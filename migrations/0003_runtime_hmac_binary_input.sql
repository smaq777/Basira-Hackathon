begin;

select pg_advisory_xact_lock(hashtext('basirah:migration:0003'));

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
  if encode(
    public.hmac(pg_catalog.convert_to(candidate, 'UTF8'), signing_key, 'sha256'),
    'hex'
  ) <> proof then
    return null;
  end if;
  return candidate::bigint;
exception when others then
  return null;
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
    encode(
      public.hmac(pg_catalog.convert_to(session_id::text, 'UTF8'), signing_key, 'sha256'),
      'hex'
    ),
    true
  );
  return session_id;
end
$function$;

insert into basirah_private.schema_migration (version, checksum_sha256)
values (
  '0003_runtime_hmac_binary_input',
  '0000000000000000000000000000000000000000000000000000000000000000'
);

commit;
