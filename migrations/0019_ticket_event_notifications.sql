begin;
select pg_advisory_xact_lock(hashtext('basirah:migration:0019'));

-- Add event-bound notices without changing historical response/delivery records.
alter table basirah.review_notification_outbox alter column response_id drop not null;
alter table basirah.review_notification_outbox add column event_id bigint unique
  references basirah.review_ticket_event(id) on delete cascade;
alter table basirah.review_notification_outbox add constraint review_notification_one_binding
  check ((response_id is null) <> (event_id is null));

create function basirah_private.queue_ticket_event_notification()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  -- Contact updates already send the intake receipt. Published responses use
  -- their existing exact-version outbox. Transport audit events never send mail.
  if new.event_type in ('draft_saved','archived','restored','retrieval_approved')
    and exists(select 1 from basirah.review_ticket t where t.id=new.ticket_id
      and t.notify_opt_in and t.contact_ciphertext is not null) then
    insert into basirah.review_notification_outbox(ticket_id,event_id)
      values(new.ticket_id,new.id) on conflict(event_id) do nothing;
  end if;
  return new;
end
$function$;
revoke all on function basirah_private.queue_ticket_event_notification() from public;
create trigger review_ticket_event_notification after insert on basirah.review_ticket_event
for each row execute function basirah_private.queue_ticket_event_notification();

-- Old application workers must not claim/drop event-bound notices during rollout.
create or replace function basirah_api.claim_review_notifications(requested_limit integer default 10)
returns table(notification_id bigint,ticket_code text,contact_ciphertext bytea,response_text text)
language plpgsql volatile security definer set search_path='' as $function$
begin
  if requested_limit is null or requested_limit not between 1 and 20 then raise exception 'invalid notification limit';end if;
  update basirah.review_notification_outbox set status='failed',attempt_count=10,last_error_code='EMAIL_SEND_RESULT_UNKNOWN'
    where status='sending' and claimed_at<clock_timestamp()-interval '10 minutes';
  return query with due as (
    select n.id from basirah.review_notification_outbox n join basirah.review_ticket t on t.id=n.ticket_id
    where n.status in ('pending','failed') and n.next_attempt_at<=clock_timestamp() and n.attempt_count<10
      and n.response_id is not null and t.status<>'closed' and t.notify_opt_in and t.contact_ciphertext is not null
      and not exists(select 1 from basirah.review_email_delivery d where d.notification_id=n.id)
    order by n.next_attempt_at,n.id for update of n skip locked limit requested_limit
  ), claimed as (
    update basirah.review_notification_outbox n set status='sending',claimed_at=clock_timestamp(),attempt_count=n.attempt_count+1
    from due where n.id=due.id returning n.id,n.ticket_id,n.response_id
  ) select c.id,t.ticket_code,t.contact_ciphertext,r.response_text from claimed c
    join basirah.review_ticket t on t.id=c.ticket_id join basirah.review_ticket_response r on r.id=c.response_id;
end
$function$;
create function basirah_api.claim_ticket_notifications(requested_limit integer)
returns table(notification_id bigint,ticket_code text,contact_ciphertext bytea,response_text text,response_version integer,editorial jsonb,event_type text,notification_key uuid)
language plpgsql volatile security definer set search_path='' as $function$
begin
  if requested_limit is null or requested_limit not between 1 and 20 then raise exception 'invalid notification limit';end if;
  update basirah.review_notification_outbox set status='failed',attempt_count=10,last_error_code='EMAIL_SEND_RESULT_UNKNOWN'
    where status='sending' and claimed_at<clock_timestamp()-interval '10 minutes';
  return query with due as (
    select n.id from basirah.review_notification_outbox n join basirah.review_ticket t on t.id=n.ticket_id
    where n.status in ('pending','failed') and n.next_attempt_at<=clock_timestamp() and n.attempt_count<10
      and t.notify_opt_in and t.contact_ciphertext is not null
      and not exists(select 1 from basirah.review_email_delivery d where d.notification_id=n.id)
    order by n.next_attempt_at,n.id for update of n skip locked limit requested_limit
  ), claimed as (
    update basirah.review_notification_outbox n set status='sending',claimed_at=clock_timestamp(),attempt_count=n.attempt_count+1
    from due where n.id=due.id returning n.id,n.ticket_id,n.response_id,n.event_id,n.public_id
  ) select c.id,t.ticket_code,t.contact_ciphertext,coalesce(r.response_text,''),r.version,e.result,coalesce(ev.event_type,'published'),c.public_id from claimed c
    join basirah.review_ticket t on t.id=c.ticket_id left join basirah.review_ticket_response r on r.id=c.response_id
    left join basirah.review_ticket_editorial e on e.response_id=r.id
    left join basirah.review_ticket_event ev on ev.id=c.event_id;
end
$function$;
create or replace function basirah_api.archive_review_ticket(code text,actor text,restore boolean)
returns boolean language plpgsql volatile security definer set search_path = '' as $function$
declare selected_id bigint;selected_status text;
begin
  select t.id,t.status into selected_id,selected_status from basirah.review_ticket t where t.ticket_code=code for update;
  if selected_id is null then return false;end if;
  if (restore and selected_status<>'closed') or (not restore and selected_status='closed') then return true;end if;
  update basirah.review_ticket rt set
    status=case when not restore then 'closed' when exists(select 1 from basirah.review_ticket_response tr where tr.ticket_id=rt.id and tr.published) then 'published' else 'pending' end,
    published_at=case when restore then (select max(tr.created_at) from basirah.review_ticket_response tr where tr.ticket_id=rt.id and tr.published) else null end,
    updated_at=clock_timestamp()
  where rt.ticket_code=code and ((restore and rt.status='closed') or (not restore and rt.status<>'closed')) returning rt.id into selected_id;
  if selected_id is null then return false; end if;
  insert into basirah.review_ticket_event(ticket_id,event_type,actor_id) values(selected_id,case when restore then 'restored' else 'archived' end,actor);
  return true;
end
$function$;

create or replace function basirah_api.record_reviewed_source_receipt(code text,requested_version integer,requested_evidence text,snapshot text,actor text)
returns boolean language plpgsql volatile security definer set search_path='' as $function$
declare selected_response bigint;selected_ticket bigint;inserted boolean;
begin
  select r.id,t.id into selected_response,selected_ticket from basirah.review_ticket t
    join basirah.review_ticket_response r on r.ticket_id=t.id join basirah.review_ticket_editorial e on e.response_id=r.id
    where t.ticket_code=code and t.status <> 'closed' and r.version=requested_version and r.published
    and exists(select 1 from jsonb_array_elements(e.result->'evidence') item where item->>'id'=requested_evidence);
  if selected_response is null then return false;end if;
  insert into basirah.reviewed_source_receipt(response_id,evidence_id,snapshot_key,approved_by)
    values(selected_response,requested_evidence,snapshot,actor) on conflict do nothing;
  inserted:=found;
  if not exists(select 1 from basirah.reviewed_source_receipt s where s.response_id=selected_response and s.evidence_id=requested_evidence and s.snapshot_key=snapshot) then
    raise exception 'source receipt identity collision';end if;
  if inserted then
  insert into basirah.review_ticket_event(ticket_id,event_type,actor_id,safe_metadata)
    values(selected_ticket,'retrieval_approved',actor,jsonb_build_object('version',requested_version,'evidenceId',requested_evidence,'snapshotKey',snapshot));
  end if;
  return true;
end
$function$;

create or replace function basirah_api.ticket_email_deliveries(code text)
returns jsonb language sql stable security definer set search_path='' as $function$
  select coalesce(jsonb_agg(jsonb_build_object('kind',case when d.notification_id is null then 'receipt'
    when n.event_id is not null then 'update' else 'review' end,
    'version',r.version,'messageId',d.message_id,'event',d.event,'occurredAt',d.occurred_at,'acceptedAt',d.accepted_at) order by d.id),'[]'::jsonb)
  from basirah.review_email_delivery d join basirah.review_ticket t on t.id=d.ticket_id
    left join basirah.review_notification_outbox n on n.id=d.notification_id
    left join basirah.review_ticket_response r on r.id=n.response_id where t.ticket_code=code
$function$;
revoke all on function basirah_api.claim_ticket_notifications(integer) from public;
grant execute on function basirah_api.claim_ticket_notifications(integer) to basirah_runtime;
insert into basirah_private.schema_migration(version,checksum_sha256)
values('0019_ticket_event_notifications','0000000000000000000000000000000000000000000000000000000000000000');
commit;
