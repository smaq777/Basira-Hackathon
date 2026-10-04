begin;

select pg_advisory_xact_lock(hashtext('basirah:migration:0001'));

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists vector;

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'basirah_runtime') then
    create role basirah_runtime nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end
$roles$;

create schema basirah;
create schema basirah_api;
create schema basirah_private;

revoke create on schema public from public;
revoke all on schema basirah, basirah_api, basirah_private from public;
grant usage on schema basirah, basirah_api to basirah_runtime;

create table basirah_private.schema_migration (
  version text primary key,
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz not null default clock_timestamp()
);

create table basirah_private.security_state (
  singleton boolean primary key default true check (singleton),
  session_context_key bytea not null check (octet_length(session_context_key) = 32)
);

insert into basirah_private.security_state (singleton, session_context_key)
values (true, gen_random_bytes(32));

create table basirah.guest_session (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  ownership_secret_hash bytea not null check (octet_length(ownership_secret_hash) = 32),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  deleted_at timestamptz,
  constraint guest_session_expiry_check check (expires_at > created_at),
  constraint guest_session_deletion_check check (deleted_at is null or deleted_at >= created_at)
);

create table basirah.document (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  session_id bigint not null references basirah.guest_session(id) on delete cascade,
  current_revision_id bigint,
  created_at timestamptz not null default clock_timestamp()
);

create table basirah.document_revision (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  document_id bigint not null references basirah.document(id) on delete cascade,
  parent_revision_id bigint,
  version integer not null check (version > 0),
  original_text text not null check (char_length(original_text) between 1 and 12000),
  content_hash bytea not null check (octet_length(content_hash) = 32),
  created_at timestamptz not null default clock_timestamp(),
  constraint document_revision_document_id_pair unique (document_id, id),
  constraint document_revision_document_version unique (document_id, version),
  constraint document_revision_parent_fk
    foreign key (document_id, parent_revision_id)
    references basirah.document_revision(document_id, id)
    on delete restrict
    deferrable initially deferred,
  constraint document_revision_parent_check check (parent_revision_id is null or version > 1)
);

alter table basirah.document
  add constraint document_current_revision_fk
  foreign key (id, current_revision_id)
  references basirah.document_revision(document_id, id)
  on delete restrict
  deferrable initially deferred;

create table basirah.claim (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  revision_id bigint not null references basirah.document_revision(id) on delete cascade,
  ordinal integer not null check (ordinal >= 0),
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null,
  confirmed_text text not null check (char_length(confirmed_text) between 1 and 4000),
  claim_type text not null check (
    claim_type in ('quotation', 'attribution', 'interpretation', 'generalization', 'exclusivity', 'other')
  ),
  confirmed_at timestamptz not null default clock_timestamp(),
  constraint claim_offsets_check check (end_offset > start_offset),
  constraint claim_revision_id_pair unique (revision_id, id),
  constraint claim_revision_ordinal unique (revision_id, ordinal)
);

create table basirah.source_edition (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  source_key text not null check (source_key ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  work_name text not null check (char_length(work_name) between 1 and 300),
  author_name text not null check (char_length(author_name) between 1 and 300),
  edition text not null check (char_length(edition) between 1 and 300),
  content_version text not null check (char_length(content_version) between 1 and 120),
  source_url text,
  rights_record text not null check (char_length(rights_record) between 1 and 2000),
  approval_status text not null check (approval_status in ('pending', 'approved', 'rejected', 'revoked')),
  approved_at timestamptz,
  revoked_at timestamptz,
  constraint source_edition_source_version unique (source_key, content_version),
  constraint source_edition_approval_check check (
    (approval_status = 'approved' and approved_at is not null and revoked_at is null)
    or (approval_status = 'revoked' and approved_at is not null and revoked_at is not null)
    or (approval_status in ('pending', 'rejected') and approved_at is null and revoked_at is null)
  )
);

create table basirah.passage (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  source_edition_id bigint not null references basirah.source_edition(id) on delete restrict,
  stable_reference text not null check (char_length(stable_reference) between 1 and 300),
  ordinal integer not null check (ordinal >= 0),
  parent_passage_id bigint,
  original_text text not null check (char_length(original_text) between 1 and 30000),
  search_key text not null check (char_length(search_key) between 1 and 30000),
  content_hash bytea not null check (octet_length(content_hash) = 32),
  created_at timestamptz not null default clock_timestamp(),
  constraint passage_source_id_pair unique (source_edition_id, id),
  constraint passage_source_reference unique (source_edition_id, stable_reference),
  constraint passage_parent_fk
    foreign key (source_edition_id, parent_passage_id)
    references basirah.passage(source_edition_id, id)
    on delete restrict
    deferrable initially deferred
);

create table basirah.passage_embedding (
  id bigint generated always as identity primary key,
  passage_id bigint not null references basirah.passage(id) on delete cascade,
  model_id text not null check (char_length(model_id) between 1 and 200),
  dimensions integer not null check (dimensions between 1 and 4096),
  task_type text not null check (task_type in ('search_document', 'classification')),
  corpus_version text not null check (char_length(corpus_version) between 1 and 120),
  embedding vector not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint passage_embedding_dimension_check check (vector_dims(embedding) = dimensions),
  constraint passage_embedding_space unique (passage_id, model_id, task_type, corpus_version)
);

create table basirah.review_run (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  revision_id bigint not null references basirah.document_revision(id) on delete cascade,
  idempotency_key uuid not null,
  status text not null check (
    status in (
      'queued', 'retrieving', 'checking', 'assessing', 'validating',
      'completed', 'partial', 'needs_review', 'failed', 'cancelled', 'interrupted'
    )
  ),
  attempt integer not null default 1 check (attempt between 1 and 5),
  lease_until timestamptz,
  deadline_at timestamptz not null,
  corpus_version text not null check (char_length(corpus_version) between 1 and 120),
  support_model text,
  prompt_version text,
  created_at timestamptz not null default clock_timestamp(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint review_run_revision_id_pair unique (revision_id, id),
  constraint review_run_revision_idempotency unique (revision_id, idempotency_key),
  constraint review_run_deadline_check check (deadline_at > created_at),
  constraint review_run_time_order_check check (
    (started_at is null or started_at >= created_at)
    and (completed_at is null or started_at is not null)
    and (completed_at is null or completed_at >= started_at)
  ),
  constraint review_run_terminal_check check (
    (status in ('completed', 'partial', 'needs_review', 'failed', 'cancelled', 'interrupted'))
      = (completed_at is not null)
  )
);

create table basirah.review_run_event (
  id bigint generated always as identity primary key,
  run_id bigint not null references basirah.review_run(id) on delete cascade,
  sequence integer not null check (sequence >= 0),
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]{1,79}$'),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  occurred_at timestamptz not null default clock_timestamp(),
  constraint review_run_event_run_sequence unique (run_id, sequence)
);

create table basirah.evidence_item (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  run_id bigint not null references basirah.review_run(id) on delete cascade,
  passage_id bigint references basirah.passage(id) on delete restrict,
  source_version text not null check (char_length(source_version) between 1 and 120),
  reference text not null check (char_length(reference) between 1 and 500),
  original_text_snapshot text not null check (char_length(original_text_snapshot) between 1 and 30000),
  retrieval_modes text[] not null check (
    cardinality(retrieval_modes) between 1 and 3
    and retrieval_modes <@ array['exact', 'lexical', 'semantic']::text[]
  ),
  retrieved_at timestamptz not null,
  delivery_mode text not null check (delivery_mode in ('live', 'snapshot')),
  content_hash bytea not null check (octet_length(content_hash) = 32),
  rank integer not null check (rank > 0),
  constraint evidence_item_run_id_pair unique (run_id, id),
  constraint evidence_item_run_passage unique nulls not distinct (run_id, passage_id),
  constraint evidence_item_run_rank unique (run_id, rank)
);

create table basirah.finding (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  run_id bigint not null,
  revision_id bigint not null,
  claim_id bigint not null,
  quote_status text not null check (
    quote_status in ('exact', 'normalized', 'mismatch', 'not_applicable', 'unresolved')
  ),
  support_status text not null check (
    support_status in (
      'supported', 'overgeneralization', 'missing_qualification',
      'unsupported_exclusivity', 'insufficient_evidence', 'out_of_scope'
    )
  ),
  explanation text not null check (char_length(explanation) between 1 and 5000),
  suggested_edit text check (suggested_edit is null or char_length(suggested_edit) between 1 and 5000),
  created_at timestamptz not null default clock_timestamp(),
  constraint finding_id_run_pair unique (id, run_id),
  constraint finding_run_claim unique (run_id, claim_id),
  constraint finding_run_revision_fk
    foreign key (revision_id, run_id)
    references basirah.review_run(revision_id, id)
    on delete cascade,
  constraint finding_revision_claim_fk
    foreign key (revision_id, claim_id)
    references basirah.claim(revision_id, id)
    on delete cascade
);

create table basirah.finding_evidence (
  run_id bigint not null,
  finding_id bigint not null,
  evidence_item_id bigint not null,
  primary key (finding_id, evidence_item_id),
  constraint finding_evidence_finding_fk
    foreign key (finding_id, run_id)
    references basirah.finding(id, run_id)
    on delete cascade,
  constraint finding_evidence_item_fk
    foreign key (evidence_item_id, run_id)
    references basirah.evidence_item(id, run_id)
    on delete cascade
);

create table basirah.review_packet (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  run_id bigint not null references basirah.review_run(id) on delete cascade,
  export_version integer not null check (export_version > 0),
  storage_key text not null check (
    char_length(storage_key) between 1 and 500
    and storage_key !~ '(^|/)\.\.(/|$)'
  ),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  constraint review_packet_run_version unique (run_id, export_version),
  constraint review_packet_expiry_check check (expires_at > created_at)
);

create index guest_session_expiry_idx
  on basirah.guest_session (expires_at, id)
  where deleted_at is null;
create index document_session_created_idx
  on basirah.document (session_id, created_at desc, id desc)
  include (public_id, current_revision_id);
create unique index document_current_revision_uidx
  on basirah.document (current_revision_id)
  where current_revision_id is not null;
create index document_revision_parent_idx
  on basirah.document_revision (parent_revision_id)
  where parent_revision_id is not null;
create unique index claim_revision_ordinal_uidx
  on basirah.claim (revision_id, ordinal)
  include (public_id, start_offset, end_offset, claim_type, confirmed_at);
create index source_edition_active_idx
  on basirah.source_edition (source_key, content_version, id)
  where approval_status = 'approved' and revoked_at is null;
create unique index passage_source_reference_uidx
  on basirah.passage (source_edition_id, stable_reference)
  include (public_id, content_hash, ordinal);
create index passage_source_ordinal_idx
  on basirah.passage (source_edition_id, ordinal, id)
  include (stable_reference, public_id);
create index passage_parent_idx
  on basirah.passage (parent_passage_id, ordinal)
  where parent_passage_id is not null;
create index passage_search_key_trgm_idx
  on basirah.passage using gin (search_key gin_trgm_ops);
create index passage_embedding_compatible_space_idx
  on basirah.passage_embedding (model_id, task_type, corpus_version, passage_id)
  include (dimensions);
create index review_run_revision_created_idx
  on basirah.review_run (revision_id, created_at desc, id desc)
  include (public_id, status, completed_at);
create index review_run_active_lease_idx
  on basirah.review_run (status, lease_until, id)
  where status in ('queued', 'retrieving', 'checking', 'assessing', 'validating');
create index evidence_item_run_rank_idx
  on basirah.evidence_item (run_id, rank, id)
  include (passage_id, public_id, delivery_mode);
create index evidence_item_passage_idx on basirah.evidence_item (passage_id, run_id);
create index finding_claim_idx on basirah.finding (claim_id, run_id);
create index finding_revision_idx on basirah.finding (revision_id, run_id);
create index finding_evidence_evidence_idx
  on basirah.finding_evidence (evidence_item_id, finding_id);
create index review_packet_run_created_idx
  on basirah.review_packet (run_id, created_at desc, id desc)
  include (public_id, export_version, expires_at);
create index review_packet_expiry_idx on basirah.review_packet (expires_at, id);

create function basirah_private.reject_immutable_update()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception using errcode = '55000', message = tg_table_name || ' rows are immutable';
end
$function$;

create trigger document_revision_immutable
before update on basirah.document_revision
for each row execute function basirah_private.reject_immutable_update();
create trigger passage_immutable
before update on basirah.passage
for each row execute function basirah_private.reject_immutable_update();
create trigger passage_embedding_immutable
before update on basirah.passage_embedding
for each row execute function basirah_private.reject_immutable_update();
create trigger evidence_item_immutable
before update on basirah.evidence_item
for each row execute function basirah_private.reject_immutable_update();

create function basirah_private.current_session_id()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  candidate text := current_setting('basirah.session_id', true);
  proof text := current_setting('basirah.session_proof', true);
  signing_key bytea;
begin
  if candidate is null or candidate = '' or proof is null or proof = '' then
    return null;
  end if;
  select session_context_key into strict signing_key
  from basirah_private.security_state
  where singleton;
  if encode(hmac(candidate, signing_key, 'sha256'), 'hex') <> proof then
    return null;
  end if;
  return candidate::bigint;
exception when others then
  return null;
end
$function$;

create function basirah_api.create_guest_session(retention_hours integer default 24)
returns table (session_public_id uuid, ownership_secret text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  secret text;
begin
  if retention_hours < 1 or retention_hours > 24 then
    raise exception using errcode = '22023', message = 'retention_hours must be between 1 and 24';
  end if;
  secret := encode(gen_random_bytes(32), 'hex');
  return query
    insert into basirah.guest_session (ownership_secret_hash, expires_at)
    values (digest(secret, 'sha256'), clock_timestamp() + make_interval(hours => retention_hours))
    returning public_id, secret, guest_session.expires_at;
end
$function$;

create function basirah_api.authenticate_guest(session_public_id uuid, ownership_secret text)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  session_id bigint;
  signing_key bytea;
begin
  if ownership_secret !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select id into session_id
  from basirah.guest_session
  where public_id = session_public_id
    and ownership_secret_hash = digest(ownership_secret, 'sha256')
    and deleted_at is null
    and expires_at > clock_timestamp();
  if session_id is null then
    return null;
  end if;
  select session_context_key into strict signing_key
  from basirah_private.security_state
  where singleton;
  perform set_config('basirah.session_id', session_id::text, true);
  perform set_config('basirah.session_proof', encode(hmac(session_id::text, signing_key, 'sha256'), 'hex'), true);
  return session_id;
end
$function$;

create function basirah_api.delete_guest_session(session_public_id uuid, ownership_secret text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  deleted_count bigint;
begin
  delete from basirah.guest_session
  where public_id = session_public_id
    and ownership_secret_hash = digest(ownership_secret, 'sha256')
    and deleted_at is null;
  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end
$function$;

create function basirah_api.readiness()
returns table (migration_version text, database_name text, server_version text)
language sql
stable
security definer
set search_path = ''
as $function$
  select max(version), current_database(), current_setting('server_version')
  from basirah_private.schema_migration
$function$;

revoke all on all tables in schema basirah, basirah_private from public;
revoke all on all sequences in schema basirah from public;
revoke all on all functions in schema basirah_api, basirah_private from public;

grant execute on function basirah_private.current_session_id() to basirah_runtime;
grant execute on function basirah_api.create_guest_session(integer) to basirah_runtime;
grant execute on function basirah_api.authenticate_guest(uuid, text) to basirah_runtime;
grant execute on function basirah_api.delete_guest_session(uuid, text) to basirah_runtime;
grant execute on function basirah_api.readiness() to basirah_runtime;

grant select, update on basirah.guest_session to basirah_runtime;
grant select, insert, update, delete on
  basirah.document,
  basirah.document_revision,
  basirah.claim,
  basirah.review_run,
  basirah.review_run_event,
  basirah.evidence_item,
  basirah.finding,
  basirah.finding_evidence,
  basirah.review_packet
to basirah_runtime;
grant select on basirah.source_edition, basirah.passage, basirah.passage_embedding to basirah_runtime;
grant usage, select on all sequences in schema basirah to basirah_runtime;

alter table basirah.guest_session enable row level security;
alter table basirah.document enable row level security;
alter table basirah.document_revision enable row level security;
alter table basirah.claim enable row level security;
alter table basirah.source_edition enable row level security;
alter table basirah.passage enable row level security;
alter table basirah.passage_embedding enable row level security;
alter table basirah.review_run enable row level security;
alter table basirah.review_run_event enable row level security;
alter table basirah.evidence_item enable row level security;
alter table basirah.finding enable row level security;
alter table basirah.finding_evidence enable row level security;
alter table basirah.review_packet enable row level security;
alter table basirah_private.schema_migration enable row level security;
alter table basirah_private.security_state enable row level security;

create policy guest_session_owned on basirah.guest_session
  for all to basirah_runtime
  using (id = (select basirah_private.current_session_id()))
  with check (id = (select basirah_private.current_session_id()));

create policy document_owned on basirah.document
  for all to basirah_runtime
  using (session_id = (select basirah_private.current_session_id()))
  with check (session_id = (select basirah_private.current_session_id()));

create policy document_revision_owned on basirah.document_revision
  for all to basirah_runtime
  using (
    exists (
      select 1 from basirah.document d
      where d.id = document_revision.document_id
        and d.session_id = (select basirah_private.current_session_id())
    )
  )
  with check (
    exists (
      select 1 from basirah.document d
      where d.id = document_revision.document_id
        and d.session_id = (select basirah_private.current_session_id())
    )
  );

create policy claim_owned on basirah.claim
  for all to basirah_runtime
  using (
    exists (
      select 1
      from basirah.document_revision r
      join basirah.document d on d.id = r.document_id
      where r.id = claim.revision_id
        and d.session_id = (select basirah_private.current_session_id())
    )
  )
  with check (
    exists (
      select 1
      from basirah.document_revision r
      join basirah.document d on d.id = r.document_id
      where r.id = claim.revision_id
        and d.session_id = (select basirah_private.current_session_id())
    )
  );

create policy source_edition_approved on basirah.source_edition
  for select to basirah_runtime
  using (approval_status = 'approved' and revoked_at is null);

create policy passage_approved on basirah.passage
  for select to basirah_runtime
  using (
    exists (
      select 1 from basirah.source_edition s
      where s.id = passage.source_edition_id
        and s.approval_status = 'approved'
        and s.revoked_at is null
    )
  );

create policy passage_embedding_approved on basirah.passage_embedding
  for select to basirah_runtime
  using (
    exists (
      select 1
      from basirah.passage p
      join basirah.source_edition s on s.id = p.source_edition_id
      where p.id = passage_embedding.passage_id
        and s.approval_status = 'approved'
        and s.revoked_at is null
    )
  );

create policy review_run_owned on basirah.review_run
  for all to basirah_runtime
  using (
    exists (
      select 1
      from basirah.document_revision r
      join basirah.document d on d.id = r.document_id
      where r.id = review_run.revision_id
        and d.session_id = (select basirah_private.current_session_id())
    )
  )
  with check (
    exists (
      select 1
      from basirah.document_revision r
      join basirah.document d on d.id = r.document_id
      where r.id = review_run.revision_id
        and d.session_id = (select basirah_private.current_session_id())
    )
  );

create policy review_run_event_owned on basirah.review_run_event
  for all to basirah_runtime
  using (exists (select 1 from basirah.review_run r where r.id = review_run_event.run_id))
  with check (exists (select 1 from basirah.review_run r where r.id = review_run_event.run_id));

create policy evidence_item_owned on basirah.evidence_item
  for all to basirah_runtime
  using (exists (select 1 from basirah.review_run r where r.id = evidence_item.run_id))
  with check (exists (select 1 from basirah.review_run r where r.id = evidence_item.run_id));

create policy finding_owned on basirah.finding
  for all to basirah_runtime
  using (exists (select 1 from basirah.review_run r where r.id = finding.run_id))
  with check (exists (select 1 from basirah.review_run r where r.id = finding.run_id));

create policy finding_evidence_owned on basirah.finding_evidence
  for all to basirah_runtime
  using (exists (select 1 from basirah.review_run r where r.id = finding_evidence.run_id))
  with check (exists (select 1 from basirah.review_run r where r.id = finding_evidence.run_id));

create policy review_packet_owned on basirah.review_packet
  for all to basirah_runtime
  using (exists (select 1 from basirah.review_run r where r.id = review_packet.run_id))
  with check (exists (select 1 from basirah.review_run r where r.id = review_packet.run_id));

insert into basirah_private.schema_migration (version, checksum_sha256)
values ('0001_basirah_core', '0000000000000000000000000000000000000000000000000000000000000000');

commit;
