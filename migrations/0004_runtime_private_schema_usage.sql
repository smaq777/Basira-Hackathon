begin;

select pg_advisory_xact_lock(hashtext('basirah:migration:0004'));

grant usage on schema basirah_private to basirah_runtime;

insert into basirah_private.schema_migration (version, checksum_sha256)
values (
  '0004_runtime_private_schema_usage',
  '0000000000000000000000000000000000000000000000000000000000000000'
);

commit;
