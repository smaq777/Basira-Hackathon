begin;
select pg_advisory_xact_lock(hashtext('basirah:migration:0011'));

create table basirah.review_ticket (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  ticket_code text not null unique check (ticket_code ~ '^BR-[A-Z0-9]{12}$'),
  run_id bigint not null unique references basirah.review_run(id) on delete cascade,
  email_lookup_hash bytea check (
    email_lookup_hash is null or octet_length(email_lookup_hash) = 32
  ),
  contact_ciphertext bytea,
  notify_opt_in boolean not null default false,
  status text not null default 'pending' check (
    status in ('pending', 'in_review', 'published', 'closed')
  ),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  published_at timestamptz,
  check (not notify_opt_in or (email_lookup_hash is not null and contact_ciphertext is not null)),
  check ((status = 'published') = (published_at is not null))
);

create table basirah.review_ticket_response (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  ticket_id bigint not null references basirah.review_ticket(id) on delete cascade,
  version integer not null check (version > 0),
  decision text not null check (decision in ('needs_context', 'bounded_revision', 'returned')),
  response_text text not null check (char_length(response_text) between 1 and 12000),
  reviewer_user_id text not null check (char_length(reviewer_user_id) between 1 and 255),
  published boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  constraint review_ticket_response_version unique (ticket_id, version)
);

create unique index review_ticket_one_published_response_idx
  on basirah.review_ticket_response (ticket_id)
  where published;

create table basirah.reviewer_knowledge_candidate (
  id bigint generated always as identity primary key,
  response_id bigint not null unique references basirah.review_ticket_response(id) on delete cascade,
  source_reference text not null check (char_length(source_reference) between 1 and 500),
  provenance jsonb not null check (jsonb_typeof(provenance) = 'object'),
  approved_by text not null check (char_length(approved_by) between 1 and 255),
  approved_at timestamptz not null default clock_timestamp()
);

create table basirah.review_notification_outbox (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  ticket_id bigint not null references basirah.review_ticket(id) on delete cascade,
  response_id bigint not null unique references basirah.review_ticket_response(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  next_attempt_at timestamptz not null default clock_timestamp(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 120),
  created_at timestamptz not null default clock_timestamp()
);

create table basirah.review_ticket_event (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references basirah.review_ticket(id) on delete cascade,
  event_type text not null check (
    event_type in ('created', 'contact_updated', 'draft_saved', 'published', 'retrieval_approved', 'email_sent', 'email_failed')
  ),
  actor_id text check (actor_id is null or char_length(actor_id) between 1 and 255),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default clock_timestamp()
);

create index review_ticket_status_created_idx
  on basirah.review_ticket (status, created_at, id);
create index review_ticket_email_lookup_idx
  on basirah.review_ticket (ticket_code, email_lookup_hash)
  where email_lookup_hash is not null;
create index review_ticket_response_ticket_created_idx
  on basirah.review_ticket_response (ticket_id, created_at desc, id desc);
create index review_notification_due_idx
  on basirah.review_notification_outbox (next_attempt_at, id)
  where status in ('pending', 'failed');
create index review_ticket_event_ticket_created_idx
  on basirah.review_ticket_event (ticket_id, created_at, id);

create trigger review_ticket_response_immutable
before update on basirah.review_ticket_response
for each row execute function basirah_private.reject_immutable_update();
create trigger reviewer_knowledge_candidate_immutable
before update on basirah.reviewer_knowledge_candidate
for each row execute function basirah_private.reject_immutable_update();
create trigger review_ticket_event_immutable
before update on basirah.review_ticket_event
for each row execute function basirah_private.reject_immutable_update();

alter table basirah.review_ticket enable row level security;
alter table basirah.review_ticket_response enable row level security;
alter table basirah.reviewer_knowledge_candidate enable row level security;
alter table basirah.review_notification_outbox enable row level security;
alter table basirah.review_ticket_event enable row level security;

revoke all on basirah.review_ticket,
  basirah.review_ticket_response,
  basirah.reviewer_knowledge_candidate,
  basirah.review_notification_outbox,
  basirah.review_ticket_event
from public, basirah_runtime;

create function basirah_api.create_review_ticket(
  session_public_id uuid,
  ownership_secret text,
  review_public_id uuid,
  requested_ticket_code text,
  requested_email_hash bytea,
  requested_contact_ciphertext bytea,
  requested_notify boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  authenticated_session_id bigint;
  selected_run_id bigint;
  selected_ticket basirah.review_ticket%rowtype;
begin
  authenticated_session_id := basirah_api.authenticate_guest(session_public_id, ownership_secret);
  if authenticated_session_id is null then
    return null;
  end if;
  select rr.id into selected_run_id
  from basirah.review_run rr
  join basirah.document_revision dr on dr.id = rr.revision_id
  join basirah.document d on d.id = dr.document_id
  join basirah.review_report rp on rp.run_id = rr.id
  where rr.public_id = review_public_id
    and d.session_id = authenticated_session_id
    and rr.status in ('completed', 'partial', 'needs_review');
  if selected_run_id is null then
    return null;
  end if;
  insert into basirah.review_ticket (
    ticket_code, run_id, email_lookup_hash, contact_ciphertext, notify_opt_in
  ) values (
    requested_ticket_code,
    selected_run_id,
    requested_email_hash,
    requested_contact_ciphertext,
    requested_notify
  )
  on conflict (run_id) do nothing;
  select * into selected_ticket from basirah.review_ticket where run_id = selected_run_id;
  if not exists (
    select 1 from basirah.review_ticket_event
    where ticket_id = selected_ticket.id and event_type = 'created'
  ) then
    insert into basirah.review_ticket_event (ticket_id, event_type)
    values (selected_ticket.id, 'created');
  end if;
  return jsonb_build_object(
    'ticketCode', selected_ticket.ticket_code,
    'status', selected_ticket.status,
    'hasEmail', selected_ticket.email_lookup_hash is not null,
    'notifyOptIn', selected_ticket.notify_opt_in,
    'createdAt', selected_ticket.created_at
  );
end
$function$;

create function basirah_api.update_review_ticket_contact(
  session_public_id uuid,
  ownership_secret text,
  requested_ticket_code text,
  requested_email_hash bytea,
  requested_contact_ciphertext bytea,
  requested_notify boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  authenticated_session_id bigint;
  selected_ticket basirah.review_ticket%rowtype;
begin
  authenticated_session_id := basirah_api.authenticate_guest(session_public_id, ownership_secret);
  if authenticated_session_id is null then
    return null;
  end if;
  update basirah.review_ticket rt
  set email_lookup_hash = requested_email_hash,
      contact_ciphertext = requested_contact_ciphertext,
      notify_opt_in = requested_notify,
      updated_at = clock_timestamp()
  from basirah.review_run rr
  join basirah.document_revision dr on dr.id = rr.revision_id
  join basirah.document d on d.id = dr.document_id
  where rt.run_id = rr.id
    and rt.ticket_code = requested_ticket_code
    and d.session_id = authenticated_session_id
  returning rt.* into selected_ticket;
  if selected_ticket.id is null then
    return null;
  end if;
  insert into basirah.review_ticket_event (ticket_id, event_type)
  values (selected_ticket.id, 'contact_updated');
  return jsonb_build_object(
    'ticketCode', selected_ticket.ticket_code,
    'status', selected_ticket.status,
    'hasEmail', true,
    'notifyOptIn', selected_ticket.notify_opt_in,
    'createdAt', selected_ticket.created_at
  );
end
$function$;

create function basirah_api.lookup_review_ticket(
  requested_ticket_code text,
  requested_email_hash bytea
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select jsonb_build_object(
      'found', true,
      'ticketCode', rt.ticket_code,
      'status', rt.status,
      'createdAt', rt.created_at,
      'publishedAt', rt.published_at,
      'report', rp.result,
      'response', case when tr.published then jsonb_build_object(
        'decision', tr.decision,
        'text', tr.response_text,
        'publishedAt', tr.created_at
      ) else null end
    )
    from basirah.review_ticket rt
    join basirah.review_report rp on rp.run_id = rt.run_id
    left join basirah.review_ticket_response tr
      on tr.ticket_id = rt.id and tr.published
    where rt.ticket_code = requested_ticket_code
      and rt.email_lookup_hash = requested_email_hash
  ), '{"found": false}'::jsonb)
$function$;

create function basirah_api.list_review_tickets()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'ticketCode', rt.ticket_code,
    'status', rt.status,
    'createdAt', rt.created_at,
    'notifyOptIn', rt.notify_opt_in
  ) order by rt.created_at asc), '[]'::jsonb)
  from basirah.review_ticket rt
  where rt.status <> 'closed'
$function$;

create function basirah_api.get_review_ticket(requested_ticket_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select jsonb_build_object(
      'ticketCode', rt.ticket_code,
      'status', rt.status,
      'createdAt', rt.created_at,
      'notifyOptIn', rt.notify_opt_in,
      'report', rp.result,
      'responses', coalesce((
        select jsonb_agg(jsonb_build_object(
          'version', tr.version,
          'decision', tr.decision,
          'text', tr.response_text,
          'published', tr.published,
          'createdAt', tr.created_at
        ) order by tr.version)
        from basirah.review_ticket_response tr where tr.ticket_id = rt.id
      ), '[]'::jsonb)
    )
    from basirah.review_ticket rt
    join basirah.review_report rp on rp.run_id = rt.run_id
    where rt.ticket_code = requested_ticket_code
  ), 'null'::jsonb)
$function$;

create function basirah_api.save_review_ticket_response(
  requested_ticket_code text,
  requested_reviewer_user_id text,
  requested_decision text,
  requested_response_text text,
  should_publish boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  selected_ticket_id bigint;
  next_version integer;
  inserted_response basirah.review_ticket_response%rowtype;
begin
  select id into selected_ticket_id
  from basirah.review_ticket
  where ticket_code = requested_ticket_code
  for update;
  if selected_ticket_id is null then return null; end if;
  if should_publish and exists (
    select 1 from basirah.review_ticket_response
    where ticket_id = selected_ticket_id and published
  ) then
    raise exception using errcode = '23505', message = 'ticket already published';
  end if;
  select coalesce(max(version), 0) + 1 into next_version
  from basirah.review_ticket_response where ticket_id = selected_ticket_id;
  insert into basirah.review_ticket_response (
    ticket_id, version, decision, response_text, reviewer_user_id, published
  ) values (
    selected_ticket_id, next_version, requested_decision,
    requested_response_text, requested_reviewer_user_id, should_publish
  ) returning * into inserted_response;
  update basirah.review_ticket
  set status = case when should_publish then 'published' else 'in_review' end,
      published_at = case when should_publish then clock_timestamp() else null end,
      updated_at = clock_timestamp()
  where id = selected_ticket_id;
  insert into basirah.review_ticket_event (ticket_id, event_type, actor_id, safe_metadata)
  values (
    selected_ticket_id,
    case when should_publish then 'published' else 'draft_saved' end,
    requested_reviewer_user_id,
    jsonb_build_object('version', next_version, 'decision', requested_decision)
  );
  if should_publish and exists (
    select 1 from basirah.review_ticket
    where id = selected_ticket_id and notify_opt_in and contact_ciphertext is not null
  ) then
    insert into basirah.review_notification_outbox (ticket_id, response_id)
    values (selected_ticket_id, inserted_response.id);
  end if;
  return jsonb_build_object(
    'ticketCode', requested_ticket_code,
    'version', next_version,
    'decision', requested_decision,
    'text', requested_response_text,
    'published', should_publish,
    'createdAt', inserted_response.created_at
  );
end
$function$;

create function basirah_api.approve_review_response_for_retrieval(
  requested_ticket_code text,
  requested_reviewer_user_id text,
  requested_source_reference text,
  requested_provenance jsonb
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  selected_ticket_id bigint;
  selected_response_id bigint;
begin
  select id into selected_ticket_id from basirah.review_ticket
  where ticket_code = requested_ticket_code and status = 'published';
  select id into selected_response_id from basirah.review_ticket_response
  where ticket_id = selected_ticket_id and published;
  if selected_response_id is null then return false; end if;
  insert into basirah.reviewer_knowledge_candidate (
    response_id, source_reference, provenance, approved_by
  ) values (
    selected_response_id, requested_source_reference, requested_provenance, requested_reviewer_user_id
  ) on conflict (response_id) do nothing;
  insert into basirah.review_ticket_event (ticket_id, event_type, actor_id)
  values (selected_ticket_id, 'retrieval_approved', requested_reviewer_user_id);
  return true;
end
$function$;

create function basirah_api.claim_review_notifications(requested_limit integer default 10)
returns table (
  notification_id bigint,
  ticket_code text,
  contact_ciphertext bytea,
  response_text text
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if requested_limit < 1 or requested_limit > 20 then
    raise exception using errcode = '22023', message = 'requested_limit must be between 1 and 20';
  end if;
  return query
  with due as (
    select no.id
    from basirah.review_notification_outbox no
    where no.status in ('pending', 'failed')
      and no.next_attempt_at <= clock_timestamp()
      and no.attempt_count < 10
    order by no.next_attempt_at, no.id
    for update skip locked
    limit requested_limit
  ), claimed as (
    update basirah.review_notification_outbox no
    set status = 'sending', claimed_at = clock_timestamp(), attempt_count = attempt_count + 1
    from due where no.id = due.id
    returning no.id, no.ticket_id, no.response_id
  )
  select claimed.id, rt.ticket_code, rt.contact_ciphertext, tr.response_text
  from claimed
  join basirah.review_ticket rt on rt.id = claimed.ticket_id
  join basirah.review_ticket_response tr on tr.id = claimed.response_id;
end
$function$;

create function basirah_api.complete_review_notification(
  requested_notification_id bigint,
  was_sent boolean,
  requested_error_code text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  selected_ticket_id bigint;
begin
  update basirah.review_notification_outbox
  set status = case when was_sent then 'sent' else 'failed' end,
      sent_at = case when was_sent then clock_timestamp() else null end,
      next_attempt_at = case when was_sent then next_attempt_at
        else clock_timestamp() + make_interval(mins => least(60, power(2, least(attempt_count, 5))::integer)) end,
      last_error_code = case when was_sent then null else left(requested_error_code, 120) end
  where id = requested_notification_id and status = 'sending'
  returning ticket_id into selected_ticket_id;
  if selected_ticket_id is null then return false; end if;
  insert into basirah.review_ticket_event (ticket_id, event_type, safe_metadata)
  values (
    selected_ticket_id,
    case when was_sent then 'email_sent' else 'email_failed' end,
    jsonb_build_object('notificationId', requested_notification_id)
  );
  return true;
end
$function$;

revoke all on function basirah_api.create_review_ticket(uuid, text, uuid, text, bytea, bytea, boolean) from public;
revoke all on function basirah_api.update_review_ticket_contact(uuid, text, text, bytea, bytea, boolean) from public;
revoke all on function basirah_api.lookup_review_ticket(text, bytea) from public;
revoke all on function basirah_api.list_review_tickets() from public;
revoke all on function basirah_api.get_review_ticket(text) from public;
revoke all on function basirah_api.save_review_ticket_response(text, text, text, text, boolean) from public;
revoke all on function basirah_api.approve_review_response_for_retrieval(text, text, text, jsonb) from public;
revoke all on function basirah_api.claim_review_notifications(integer) from public;
revoke all on function basirah_api.complete_review_notification(bigint, boolean, text) from public;

grant execute on function basirah_api.create_review_ticket(uuid, text, uuid, text, bytea, bytea, boolean) to basirah_runtime;
grant execute on function basirah_api.update_review_ticket_contact(uuid, text, text, bytea, bytea, boolean) to basirah_runtime;
grant execute on function basirah_api.lookup_review_ticket(text, bytea) to basirah_runtime;
grant execute on function basirah_api.list_review_tickets() to basirah_runtime;
grant execute on function basirah_api.get_review_ticket(text) to basirah_runtime;
grant execute on function basirah_api.save_review_ticket_response(text, text, text, text, boolean) to basirah_runtime;
grant execute on function basirah_api.approve_review_response_for_retrieval(text, text, text, jsonb) to basirah_runtime;
grant execute on function basirah_api.claim_review_notifications(integer) to basirah_runtime;
grant execute on function basirah_api.complete_review_notification(bigint, boolean, text) to basirah_runtime;

insert into basirah_private.schema_migration(version,checksum_sha256)
  values('0011_secure_review_tickets','0000000000000000000000000000000000000000000000000000000000000000');
commit;
