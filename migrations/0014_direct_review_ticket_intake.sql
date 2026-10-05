begin;
select pg_advisory_xact_lock(hashtext('basirah:migration:0014'));

alter table basirah.review_ticket
  add column revision_id bigint references basirah.document_revision(id) on delete cascade;

update basirah.review_ticket rt
set revision_id = rr.revision_id
from basirah.review_run rr
where rr.id = rt.run_id;

alter table basirah.review_ticket
  alter column revision_id set not null,
  alter column run_id drop not null;

create unique index review_ticket_revision_uidx on basirah.review_ticket(revision_id);

create or replace function basirah_api.create_review_ticket(
  session_public_id uuid, ownership_secret text, review_public_id uuid,
  requested_ticket_code text, requested_email_hash bytea,
  requested_contact_ciphertext bytea, requested_notify boolean
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  authenticated_session_id bigint;
  selected_run_id bigint;
  selected_revision_id bigint;
  selected_ticket basirah.review_ticket%rowtype;
begin
  authenticated_session_id := basirah_api.authenticate_guest(session_public_id, ownership_secret);
  if authenticated_session_id is null then return null; end if;
  select rr.id, rr.revision_id into selected_run_id, selected_revision_id
  from basirah.review_run rr
  join basirah.document_revision dr on dr.id = rr.revision_id
  join basirah.document d on d.id = dr.document_id
  join basirah.review_report rp on rp.run_id = rr.id
  where rr.public_id = review_public_id and d.session_id = authenticated_session_id
    and rr.status in ('completed', 'partial', 'needs_review');
  if selected_run_id is null then return null; end if;
  insert into basirah.review_ticket (
    ticket_code, run_id, revision_id, email_lookup_hash, contact_ciphertext, notify_opt_in
  ) values (
    requested_ticket_code, selected_run_id, selected_revision_id,
    requested_email_hash, requested_contact_ciphertext, requested_notify
  ) on conflict (revision_id) do nothing;
  select * into selected_ticket from basirah.review_ticket where revision_id = selected_revision_id;
  if not exists (select 1 from basirah.review_ticket_event
    where ticket_id = selected_ticket.id and event_type = 'created') then
    insert into basirah.review_ticket_event (ticket_id, event_type)
    values (selected_ticket.id, 'created');
  end if;
  return jsonb_build_object(
    'ticketCode', selected_ticket.ticket_code, 'status', selected_ticket.status,
    'hasEmail', selected_ticket.email_lookup_hash is not null,
    'notifyOptIn', selected_ticket.notify_opt_in, 'createdAt', selected_ticket.created_at
  );
end
$function$;

create function basirah_api.create_revision_review_ticket(
  session_public_id uuid, ownership_secret text, revision_public_id uuid,
  requested_ticket_code text, requested_email_hash bytea,
  requested_contact_ciphertext bytea, requested_notify boolean
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  authenticated_session_id bigint;
  selected_revision_id bigint;
  selected_ticket basirah.review_ticket%rowtype;
begin
  authenticated_session_id := basirah_api.authenticate_guest(session_public_id, ownership_secret);
  if authenticated_session_id is null then return null; end if;
  select dr.id into selected_revision_id
  from basirah.document_revision dr
  join basirah.document d on d.id = dr.document_id
  where dr.public_id = revision_public_id and d.session_id = authenticated_session_id
    and d.current_revision_id = dr.id;
  if selected_revision_id is null then return null; end if;
  insert into basirah.review_ticket (
    ticket_code, revision_id, email_lookup_hash, contact_ciphertext, notify_opt_in
  ) values (
    requested_ticket_code, selected_revision_id,
    requested_email_hash, requested_contact_ciphertext, requested_notify
  ) on conflict (revision_id) do nothing;
  select * into selected_ticket from basirah.review_ticket where revision_id = selected_revision_id;
  if not exists (select 1 from basirah.review_ticket_event
    where ticket_id = selected_ticket.id and event_type = 'created') then
    insert into basirah.review_ticket_event (ticket_id, event_type)
    values (selected_ticket.id, 'created');
  end if;
  return jsonb_build_object(
    'ticketCode', selected_ticket.ticket_code, 'status', selected_ticket.status,
    'hasEmail', selected_ticket.email_lookup_hash is not null,
    'notifyOptIn', selected_ticket.notify_opt_in, 'createdAt', selected_ticket.created_at
  );
end
$function$;

create or replace function basirah_api.update_review_ticket_contact(
  session_public_id uuid, ownership_secret text, requested_ticket_code text,
  requested_email_hash bytea, requested_contact_ciphertext bytea, requested_notify boolean
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  authenticated_session_id bigint;
  selected_ticket basirah.review_ticket%rowtype;
begin
  authenticated_session_id := basirah_api.authenticate_guest(session_public_id, ownership_secret);
  if authenticated_session_id is null then return null; end if;
  update basirah.review_ticket rt
  set email_lookup_hash = requested_email_hash, contact_ciphertext = requested_contact_ciphertext,
      notify_opt_in = requested_notify, updated_at = clock_timestamp()
  from basirah.document_revision dr join basirah.document d on d.id = dr.document_id
  where rt.revision_id = dr.id and rt.ticket_code = requested_ticket_code
    and d.session_id = authenticated_session_id
  returning rt.* into selected_ticket;
  if selected_ticket.id is null then return null; end if;
  insert into basirah.review_ticket_event (ticket_id, event_type)
  values (selected_ticket.id, 'contact_updated');
  return jsonb_build_object(
    'ticketCode', selected_ticket.ticket_code, 'status', selected_ticket.status,
    'hasEmail', true, 'notifyOptIn', selected_ticket.notify_opt_in,
    'createdAt', selected_ticket.created_at
  );
end
$function$;

create or replace function basirah_api.lookup_review_ticket(
  requested_ticket_code text, requested_email_hash bytea
)
returns jsonb language sql stable security definer set search_path = '' as $function$
  select coalesce((
    select jsonb_build_object(
      'found', true, 'ticketCode', rt.ticket_code, 'status', rt.status,
      'createdAt', rt.created_at, 'publishedAt', rt.published_at,
      'submission', jsonb_build_object('revisionId', dr.public_id, 'originalText', dr.original_text),
      'report', rp.result,
      'response', case when tr.published then jsonb_build_object(
        'decision', tr.decision, 'text', tr.response_text, 'publishedAt', tr.created_at
      ) else null end
    )
    from basirah.review_ticket rt
    join basirah.document_revision dr on dr.id = rt.revision_id
    left join basirah.review_report rp on rp.run_id = rt.run_id
    left join basirah.review_ticket_response tr on tr.ticket_id = rt.id and tr.published
    where rt.ticket_code = requested_ticket_code and rt.email_lookup_hash = requested_email_hash
  ), '{"found": false}'::jsonb)
$function$;

create or replace function basirah_api.get_review_ticket(requested_ticket_code text)
returns jsonb language sql stable security definer set search_path = '' as $function$
  select coalesce((
    select jsonb_build_object(
      'ticketCode', rt.ticket_code, 'status', rt.status, 'createdAt', rt.created_at,
      'notifyOptIn', rt.notify_opt_in,
      'submission', jsonb_build_object('revisionId', dr.public_id, 'originalText', dr.original_text),
      'report', rp.result,
      'responses', coalesce((select jsonb_agg(jsonb_build_object(
        'version', tr.version, 'decision', tr.decision, 'text', tr.response_text,
        'published', tr.published, 'createdAt', tr.created_at
      ) order by tr.version) from basirah.review_ticket_response tr
        where tr.ticket_id = rt.id), '[]'::jsonb)
    )
    from basirah.review_ticket rt
    join basirah.document_revision dr on dr.id = rt.revision_id
    left join basirah.review_report rp on rp.run_id = rt.run_id
    where rt.ticket_code = requested_ticket_code
  ), 'null'::jsonb)
$function$;

revoke all on function basirah_api.create_revision_review_ticket(uuid, text, uuid, text, bytea, bytea, boolean) from public;
grant execute on function basirah_api.create_revision_review_ticket(uuid, text, uuid, text, bytea, bytea, boolean) to basirah_runtime;

insert into basirah_private.schema_migration(version,checksum_sha256)
values('0014_direct_review_ticket_intake','0000000000000000000000000000000000000000000000000000000000000000');
commit;
