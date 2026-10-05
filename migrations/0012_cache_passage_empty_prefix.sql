begin;
select pg_advisory_xact_lock(hashtext('basirah:migration:0012'));
-- regexp_split_to_table('', '') produces an empty row. An empty prefix is zero
-- UTF16 units, including at offset zero before supplementary Unicode characters.
create or replace function basirah_private.cache_utf16_length(t text) returns integer
 language sql immutable strict set search_path=pg_catalog as $$
 select coalesce(sum(case when octet_length(c)>3 then 2 else 1 end),0)::integer
 from regexp_split_to_table(t,'') c where c<>''
$$;
revoke all on function basirah_private.cache_utf16_length(text) from public;
insert into basirah_private.schema_migration(version,checksum_sha256)
 values('0012_cache_passage_empty_prefix','0000000000000000000000000000000000000000000000000000000000000000');
commit;
