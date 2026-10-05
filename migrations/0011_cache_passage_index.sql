begin;
select pg_advisory_xact_lock(hashtext('basirah:migration:0011'));
create table basirah.research_page_passage (
 passage_id text primary key check(passage_id ~ '^cache-passage:[a-f0-9]{48}$'),
 parent_snapshot_key text not null references basirah.research_page_cache(snapshot_key),
 parent_sha256 text not null check(parent_sha256 ~ '^[a-f0-9]{64}$'),
 policy_sha256 text not null check(policy_sha256 ~ '^[a-f0-9]{64}$'),
 chunker_version text not null check(chunker_version='cache-sentence-context-v1'),
 start_utf16 integer not null check(start_utf16>=0), end_utf16 integer not null,
 core_start_utf16 integer not null, core_end_utf16 integer not null,
 start_codepoint integer not null check(start_codepoint>=0), end_codepoint integer not null,
 core_start_codepoint integer not null, core_end_codepoint integer not null,
 original_text text not null, passage_sha256 text not null,
 context_truncated boolean not null, boundary_truncated boolean not null,
 coverage jsonb not null, search_text text not null,
 unique(parent_snapshot_key,chunker_version,core_start_utf16,core_end_utf16),
 check(end_utf16>start_utf16 and core_start_utf16>=start_utf16 and core_end_utf16<=end_utf16 and core_end_utf16>core_start_utf16),
 check(end_codepoint>start_codepoint and char_length(original_text)=end_codepoint-start_codepoint),
 check(encode(digest(original_text,'sha256'),'hex')=passage_sha256),
 check(core_start_codepoint>=start_codepoint and core_end_codepoint<=end_codepoint and core_end_codepoint>core_start_codepoint),
 check((jsonb_typeof(coverage)='object' and coverage->>'chunkerVersion'=chunker_version
   and (coverage->>'passageCount')::integer between 1 and 32
   and (coverage->>'coveredUtf16Units')::integer between 1 and 30000
   and (coverage->>'totalUtf16Units')::integer between 1 and 30000
   and (coverage->>'coveredUtf16Units')::integer<=(coverage->>'totalUtf16Units')::integer
   and jsonb_typeof(coverage->'fullTextIndexed')='boolean'
   and (coverage->>'fullTextIndexed')::boolean=((coverage->>'coveredUtf16Units')::integer=(coverage->>'totalUtf16Units')::integer)
   and (coverage->>'boundaryTruncatedCount')::integer between 0 and (coverage->>'passageCount')::integer) is true)
);
create table basirah.research_page_passage_embedding (
 passage_id text not null references basirah.research_page_passage(passage_id),
 model_id text not null check(model_id='openai/text-embedding-3-small'),
 dimensions integer not null check(dimensions=1536),
 representation text not null check(representation='exact-contiguous-context-v1'),
 input_sha256 text not null check(input_sha256 ~ '^[a-f0-9]{64}$'),
 embedding vector(1536) not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(passage_id,model_id,dimensions,representation)
);
create index research_page_passage_parent_idx on basirah.research_page_passage(parent_snapshot_key,chunker_version);
create index research_page_passage_search_idx on basirah.research_page_passage using gin(search_text gin_trgm_ops);
-- PostgreSQL substring positions are code points; JavaScript positions are UTF16 units.
create function basirah_private.cache_utf16_length(t text) returns integer
 language sql immutable strict set search_path=pg_catalog as $$
 select coalesce(sum(case when octet_length(c)>3 then 2 else 1 end),0)::integer
 from regexp_split_to_table(t,'') c
$$;
create function basirah_private.validate_cache_passage_insert() returns trigger
 language plpgsql security definer set search_path=pg_catalog,basirah,basirah_private as $$
declare parent basirah.research_page_cache; original text; p basirah.research_page_passage;
begin
 if tg_table_name='research_page_passage' then
  select * into parent from basirah.research_page_cache where snapshot_key=new.parent_snapshot_key for key share;
  original:=parent.evidence->>'originalText';
  if parent.snapshot_key is null or parent.revoked_at is not null or parent.expires_at<=clock_timestamp()
    or parent.policy_sha256<>new.policy_sha256 or parent.original_sha256<>new.parent_sha256
    or substring(original from new.start_codepoint+1 for new.end_codepoint-new.start_codepoint)<>new.original_text
    or basirah_private.cache_utf16_length(substring(original from 1 for new.start_codepoint))<>new.start_utf16
    or basirah_private.cache_utf16_length(substring(original from 1 for new.end_codepoint))<>new.end_utf16
    or basirah_private.cache_utf16_length(substring(original from 1 for new.core_start_codepoint))<>new.core_start_utf16
    or basirah_private.cache_utf16_length(substring(original from 1 for new.core_end_codepoint))<>new.core_end_utf16
    or (new.coverage->>'totalUtf16Units')::integer<>basirah_private.cache_utf16_length(original)
    or new.end_utf16-new.start_utf16>3000 then
   raise exception 'CACHE_PASSAGE_PARENT_BINDING_INVALID';
  end if;
 else
  select * into p from basirah.research_page_passage where passage_id=new.passage_id;
  select * into parent from basirah.research_page_cache where snapshot_key=p.parent_snapshot_key for key share;
  if parent.snapshot_key is null or parent.revoked_at is not null or parent.expires_at<=clock_timestamp()
    or new.input_sha256<>p.passage_sha256 then raise exception 'CACHE_PASSAGE_VECTOR_BINDING_INVALID'; end if;
 end if;
 return new;
end $$;
create function basirah_private.freeze_cache_passage() returns trigger language plpgsql as $$
begin raise exception 'CACHE_PASSAGE_IMMUTABLE'; end $$;
create trigger cache_passage_binding before insert on basirah.research_page_passage
 for each row execute function basirah_private.validate_cache_passage_insert();
create trigger cache_passage_vector_binding before insert on basirah.research_page_passage_embedding
 for each row execute function basirah_private.validate_cache_passage_insert();
create trigger cache_passage_immutable before update or delete on basirah.research_page_passage
 for each row execute function basirah_private.freeze_cache_passage();
create trigger cache_passage_vector_immutable before update or delete on basirah.research_page_passage_embedding
 for each row execute function basirah_private.freeze_cache_passage();
revoke all on function basirah_private.cache_utf16_length(text),basirah_private.validate_cache_passage_insert(),basirah_private.freeze_cache_passage() from public;
alter table basirah.research_page_passage enable row level security;
alter table basirah.research_page_passage_embedding enable row level security;
grant select on basirah.research_page_passage,basirah.research_page_passage_embedding to basirah_research_runtime,basirah_cache_writer;
grant insert on basirah.research_page_passage,basirah.research_page_passage_embedding to basirah_cache_writer;
create policy cache_passage_read on basirah.research_page_passage for select to basirah_research_runtime,basirah_cache_writer
 using(exists(select 1 from basirah.research_page_cache c where c.snapshot_key=parent_snapshot_key and c.policy_sha256=research_page_passage.policy_sha256 and c.original_sha256=parent_sha256 and c.revoked_at is null and c.expires_at>clock_timestamp()));
create policy cache_passage_insert on basirah.research_page_passage for insert to basirah_cache_writer
 with check(exists(select 1 from basirah.research_page_cache c where c.snapshot_key=parent_snapshot_key and c.policy_sha256=research_page_passage.policy_sha256 and c.original_sha256=parent_sha256 and c.revoked_at is null and c.expires_at>clock_timestamp()));
create policy cache_passage_vector_read on basirah.research_page_passage_embedding for select to basirah_research_runtime,basirah_cache_writer
 using(exists(select 1 from basirah.research_page_passage p where p.passage_id=research_page_passage_embedding.passage_id));
create policy cache_passage_vector_insert on basirah.research_page_passage_embedding for insert to basirah_cache_writer
 with check(exists(select 1 from basirah.research_page_passage p where p.passage_id=research_page_passage_embedding.passage_id));
insert into basirah_private.schema_migration(version,checksum_sha256)
 values('0011_cache_passage_index','0000000000000000000000000000000000000000000000000000000000000000');
commit;
