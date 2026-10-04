begin;

select pg_advisory_xact_lock(hashtext('basirah:migration:0005'));

create function basirah_api.purge_expired_guest_sessions(batch_size integer default 100)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  deleted_count integer;
begin
  if batch_size < 1 or batch_size > 1000 then
    raise exception using errcode = '22023', message = 'batch_size must be between 1 and 1000';
  end if;

  with expired as (
    select id
    from basirah.guest_session
    where expires_at <= clock_timestamp()
    order by expires_at, id
    for update skip locked
    limit batch_size
  )
  delete from basirah.guest_session session
  using expired
  where session.id = expired.id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end
$function$;

revoke all on function basirah_api.purge_expired_guest_sessions(integer) from public;
grant execute on function basirah_api.purge_expired_guest_sessions(integer) to basirah_runtime;

insert into basirah_private.schema_migration (version, checksum_sha256)
values (
  '0005_expired_guest_cleanup',
  '0000000000000000000000000000000000000000000000000000000000000000'
);

commit;
