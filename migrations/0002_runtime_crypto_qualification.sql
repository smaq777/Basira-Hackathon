begin;

select pg_advisory_xact_lock(hashtext('basirah:migration:0002'));

create or replace function basirah_private.current_session_id()
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
  if encode(public.hmac(candidate, signing_key, 'sha256'), 'hex') <> proof then
    return null;
  end if;
  return candidate::bigint;
exception when others then
  return null;
end
$function$;

create or replace function basirah_api.create_guest_session(retention_hours integer default 24)
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
  secret := encode(public.gen_random_bytes(32), 'hex');
  return query
    insert into basirah.guest_session (ownership_secret_hash, expires_at)
    values (public.digest(secret, 'sha256'), clock_timestamp() + make_interval(hours => retention_hours))
    returning public_id, secret, guest_session.expires_at;
end
$function$;

create or replace function basirah_api.authenticate_guest(
  session_public_id uuid,
  ownership_secret text
)
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
    and ownership_secret_hash = public.digest(ownership_secret, 'sha256')
    and deleted_at is null
    and expires_at > clock_timestamp();
  if session_id is null then
    return null;
  end if;
  select session_context_key into strict signing_key
  from basirah_private.security_state
  where singleton;
  perform set_config('basirah.session_id', session_id::text, true);
  perform set_config(
    'basirah.session_proof',
    encode(public.hmac(session_id::text, signing_key, 'sha256'), 'hex'),
    true
  );
  return session_id;
end
$function$;

create or replace function basirah_api.delete_guest_session(
  session_public_id uuid,
  ownership_secret text
)
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
    and ownership_secret_hash = public.digest(ownership_secret, 'sha256')
    and deleted_at is null;
  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end
$function$;

insert into basirah_private.schema_migration (version, checksum_sha256)
values (
  '0002_runtime_crypto_qualification',
  '0000000000000000000000000000000000000000000000000000000000000000'
);

commit;
