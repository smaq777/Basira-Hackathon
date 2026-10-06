begin;
select pg_advisory_xact_lock(hashtext('basirah:migration:0016'));

create table basirah.review_ticket_editorial (
  response_id bigint primary key references basirah.review_ticket_response(id) on delete cascade,
  result jsonb not null check (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 500000)
);
alter table basirah.review_ticket_editorial enable row level security;
revoke all on basirah.review_ticket_editorial from public, basirah_runtime;
create trigger review_ticket_editorial_immutable before update on basirah.review_ticket_editorial
for each row execute function basirah_private.reject_immutable_update();
create table basirah.reviewed_source_receipt (
  response_id bigint not null references basirah.review_ticket_response(id) on delete restrict,
  evidence_id text not null,
  snapshot_key text not null check(snapshot_key ~ '^reviewed-[a-f0-9]{32}$'),
  approved_by text not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(response_id,evidence_id)
);
alter table basirah.reviewed_source_receipt enable row level security;
revoke all on basirah.reviewed_source_receipt from public,basirah_runtime;
create trigger reviewed_source_receipt_immutable before update on basirah.reviewed_source_receipt
for each row execute function basirah_private.reject_immutable_update();
drop index basirah.review_ticket_one_published_response_idx;
alter table basirah.review_ticket_event drop constraint review_ticket_event_event_type_check;
alter table basirah.review_ticket_event add constraint review_ticket_event_event_type_check check (
  event_type in ('created','contact_updated','draft_saved','published','retrieval_approved','email_sent','email_failed','archived','restored')
);

create function basirah_api.save_editorial_review(
  code text, actor text, decision text, note text, publish boolean, expected_version integer, editorial jsonb
) returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  selected_ticket_id bigint;
  saved jsonb;
  selected_response_id bigint;
begin
  select rt.id into selected_ticket_id from basirah.review_ticket rt where rt.ticket_code=code and rt.status <> 'closed' for update;
  if selected_ticket_id is null then return null; end if;
  if (select coalesce(max(tr.version),0) from basirah.review_ticket_response tr where tr.ticket_id=selected_ticket_id) <> expected_version then
    raise exception using errcode='40001', message='review version conflict';
  end if;
  if editorial is null or editorial->>'schemaVersion' is distinct from '1' or jsonb_typeof(editorial->'records') is distinct from 'array' or jsonb_typeof(editorial->'evidence') is distinct from 'array' then
    raise exception 'invalid editorial review';
  end if;
  insert into basirah.review_ticket_response(ticket_id,version,decision,response_text,reviewer_user_id,published)
  values(selected_ticket_id,expected_version+1,decision,note,actor,publish) returning id into selected_response_id;
  insert into basirah.review_ticket_editorial(response_id,result) values(selected_response_id,editorial);
  update basirah.review_ticket set status=case when publish then 'published' when published_at is not null then 'published' else 'in_review' end,
    published_at=case when publish then clock_timestamp() else published_at end,updated_at=clock_timestamp() where id=selected_ticket_id;
  insert into basirah.review_ticket_event(ticket_id,event_type,actor_id,safe_metadata)
  values(selected_ticket_id,case when publish then 'published' else 'draft_saved' end,actor,jsonb_build_object('version',expected_version+1));
  if publish and exists(select 1 from basirah.review_ticket where id=selected_ticket_id and notify_opt_in and contact_ciphertext is not null) then
    insert into basirah.review_notification_outbox(ticket_id,response_id) values(selected_ticket_id,selected_response_id);
  end if;
  saved:=jsonb_build_object('ticketCode',code,'version',expected_version+1,'decision',decision,'text',note,'published',publish,
    'createdAt',(select created_at from basirah.review_ticket_response where id=selected_response_id));
  return saved || jsonb_build_object('editorial',editorial);
end
$function$;

create or replace function basirah_api.get_review_ticket(requested_ticket_code text)
returns jsonb language sql stable security definer set search_path = '' as $function$
  select (select jsonb_build_object(
    'ticketCode',rt.ticket_code,'status',rt.status,'createdAt',rt.created_at,'notifyOptIn',rt.notify_opt_in,
    'submission',jsonb_build_object('revisionId',dr.public_id,'originalText',dr.original_text),
    'report',rp.result,
    'responses',coalesce((select jsonb_agg(jsonb_build_object(
      'version',tr.version,'decision',tr.decision,'text',tr.response_text,'published',tr.published,'createdAt',tr.created_at,
      'editorial',ed.result
    ) order by tr.version) from basirah.review_ticket_response tr left join basirah.review_ticket_editorial ed on ed.response_id=tr.id
      where tr.ticket_id=rt.id),'[]'::jsonb),
    'notifications',coalesce((select jsonb_agg(jsonb_build_object('status',n.status,'attemptCount',n.attempt_count,'sentAt',n.sent_at,'errorCode',n.last_error_code))
      from basirah.review_notification_outbox n where n.ticket_id=rt.id),'[]'::jsonb),
    'sourceApprovals',coalesce((select jsonb_agg(jsonb_build_object('version',r.version,'evidenceId',s.evidence_id,'snapshotKey',s.snapshot_key,'createdAt',s.created_at))
      from basirah.reviewed_source_receipt s join basirah.review_ticket_response r on r.id=s.response_id where r.ticket_id=rt.id),'[]'::jsonb)
  ) from basirah.review_ticket rt join basirah.document_revision dr on dr.id=rt.revision_id
    left join basirah.review_report rp on rp.run_id=rt.run_id where rt.ticket_code=requested_ticket_code)
$function$;

create function basirah_api.record_reviewed_source_receipt(code text,requested_version integer,requested_evidence text,snapshot text,actor text)
returns boolean language plpgsql volatile security definer set search_path='' as $function$
declare selected_response bigint;selected_ticket bigint;
begin
  select r.id,t.id into selected_response,selected_ticket from basirah.review_ticket t
    join basirah.review_ticket_response r on r.ticket_id=t.id join basirah.review_ticket_editorial e on e.response_id=r.id
    where t.ticket_code=code and t.status <> 'closed' and r.version=requested_version and r.published
    and exists(select 1 from jsonb_array_elements(e.result->'evidence') item where item->>'id'=requested_evidence);
  if selected_response is null then return false;end if;
  insert into basirah.reviewed_source_receipt(response_id,evidence_id,snapshot_key,approved_by)
    values(selected_response,requested_evidence,snapshot,actor) on conflict do nothing;
  if not exists(select 1 from basirah.reviewed_source_receipt s where s.response_id=selected_response and s.evidence_id=requested_evidence and s.snapshot_key=snapshot) then
    raise exception 'source receipt identity collision';end if;
  insert into basirah.review_ticket_event(ticket_id,event_type,actor_id,safe_metadata)
    values(selected_ticket,'retrieval_approved',actor,jsonb_build_object('version',requested_version,'evidenceId',requested_evidence,'snapshotKey',snapshot));
  return true;
end
$function$;

create function basirah_api.claim_editorial_notifications(requested_limit integer)
returns table(notification_id bigint,ticket_code text,contact_ciphertext bytea,response_text text,response_version integer,editorial jsonb)
language sql volatile security definer set search_path='' as $function$
  select n.notification_id,n.ticket_code,n.contact_ciphertext,n.response_text,r.version,e.result
    from basirah_api.claim_review_notifications(requested_limit) n
    join basirah.review_notification_outbox o on o.id=n.notification_id
    join basirah.review_ticket_response r on r.id=o.response_id
    left join basirah.review_ticket_editorial e on e.response_id=r.id
$function$;

create or replace function basirah_api.lookup_review_ticket(requested_ticket_code text, requested_email_hash bytea)
returns jsonb language sql stable security definer set search_path = '' as $function$
  select coalesce((select jsonb_build_object(
    'found',true,'ticketCode',rt.ticket_code,'status',rt.status,'createdAt',rt.created_at,'publishedAt',rt.published_at,
    'submission',jsonb_build_object('revisionId',dr.public_id,'originalText',dr.original_text),
    'report',rp.result,'editorial',ed.result,
    'response',case when tr.published then jsonb_build_object('version',tr.version,'decision',tr.decision,'text',tr.response_text,'publishedAt',tr.created_at) else null end
  ) from basirah.review_ticket rt join basirah.document_revision dr on dr.id=rt.revision_id
    left join basirah.review_report rp on rp.run_id=rt.run_id
    left join lateral (select * from basirah.review_ticket_response r where r.ticket_id=rt.id and r.published order by r.version desc limit 1) tr on true
    left join basirah.review_ticket_editorial ed on ed.response_id=tr.id
    where rt.ticket_code=requested_ticket_code and rt.email_lookup_hash=requested_email_hash and rt.status <> 'closed'),'{"found":false}'::jsonb)
$function$;

create function basirah_api.review_ticket_page(page_offset integer,page_size integer,status_filter text,query text)
returns jsonb language sql stable security definer set search_path = '' as $function$
  with tickets as (
    select rt.*,case
      when rt.status='published' then 'low'
      when exists(select 1 from jsonb_array_elements(coalesce(rp.result->'intake'->'quotationFindings','[]'::jsonb)) q where q->>'status'='mismatch') then 'high'
      else 'medium' end as priority
    from basirah.review_ticket rt left join basirah.review_report rp on rp.run_id=rt.run_id
    where rt.status <> 'closed'
  ), filtered as (select * from tickets where (status_filter='all' or status=status_filter)
    and (query='' or ticket_code ilike '%' || query || '%')),
  page as (select * from filtered order by case priority when 'high' then 0 when 'medium' then 1 else 2 end,created_at,id
    limit greatest(1,least(page_size,50)) offset greatest(0,page_offset))
  select jsonb_build_object('total',(select count(*) from filtered),
    'counts',jsonb_build_object('pending',(select count(*) from tickets where status='pending'),
      'inReview',(select count(*) from tickets where status='in_review'),'published',(select count(*) from tickets where status='published'),
      'total',(select count(*) from tickets)),
    'tickets',coalesce((select jsonb_agg(jsonb_build_object('ticketCode',ticket_code,'status',status,'createdAt',created_at,
      'notifyOptIn',notify_opt_in,'priority',priority) order by case priority when 'high' then 0 when 'medium' then 1 else 2 end,created_at,id) from page),'[]'::jsonb))
$function$;

create function basirah_api.archive_review_ticket(code text,actor text,restore boolean)
returns boolean language plpgsql volatile security definer set search_path = '' as $function$
declare selected_id bigint;
begin
  update basirah.review_ticket rt set
    status=case when not restore then 'closed' when exists(select 1 from basirah.review_ticket_response tr where tr.ticket_id=rt.id and tr.published) then 'published' else 'pending' end,
    published_at=case when restore then (select max(tr.created_at) from basirah.review_ticket_response tr where tr.ticket_id=rt.id and tr.published) else null end,
    updated_at=clock_timestamp()
  where rt.ticket_code=code returning rt.id into selected_id;
  if selected_id is null then return false; end if;
  insert into basirah.review_ticket_event(ticket_id,event_type,actor_id) values(selected_id,case when restore then 'restored' else 'archived' end,actor);
  -- Cancel unsent mail for archived tickets without removing delivery history.
  if not restore then update basirah.review_notification_outbox set status='failed',attempt_count=10,last_error_code='TICKET_ARCHIVED'
    where ticket_id=selected_id and status in ('pending','failed'); end if;
  return true;
end
$function$;

revoke all on function basirah_api.save_editorial_review(text,text,text,text,boolean,integer,jsonb) from public;
revoke all on function basirah_api.review_ticket_page(integer,integer,text,text) from public;
revoke all on function basirah_api.archive_review_ticket(text,text,boolean) from public;
revoke all on function basirah_api.record_reviewed_source_receipt(text,integer,text,text,text) from public;
revoke all on function basirah_api.claim_editorial_notifications(integer) from public;
grant execute on function basirah_api.save_editorial_review(text,text,text,text,boolean,integer,jsonb) to basirah_runtime;
grant execute on function basirah_api.review_ticket_page(integer,integer,text,text) to basirah_runtime;
grant execute on function basirah_api.archive_review_ticket(text,text,boolean) to basirah_runtime;
grant execute on function basirah_api.record_reviewed_source_receipt(text,integer,text,text,text) to basirah_runtime;
grant execute on function basirah_api.claim_editorial_notifications(integer) to basirah_runtime;

insert into basirah_private.schema_migration(version,checksum_sha256)
values('0016_editorial_review_versions','0000000000000000000000000000000000000000000000000000000000000000');
commit;
