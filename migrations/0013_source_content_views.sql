begin;
select pg_advisory_xact_lock(hashtext('basirah:migration:0013'));
-- Derived lexical views are separate from immutable originals and v1 passage vectors.
create table basirah.research_page_content_view (
 view_id text primary key check(view_id ~ '^content-view:[a-f0-9]{64}$'),
 parent_snapshot_key text not null references basirah.research_page_cache(snapshot_key),
 parent_sha256 text not null check(parent_sha256 ~ '^[a-f0-9]{64}$'),
 source_url text not null, policy_sha256 text not null,
 view_version text not null check(view_version='conservative-content-view-v1'),
 selection jsonb not null check(jsonb_typeof(selection)='object'),
 selection_canonical text not null,
 retained_ranges jsonb not null check(jsonb_typeof(retained_ranges)='array' and jsonb_array_length(retained_ranges) between 1 and 128),
 created_at timestamptz not null default clock_timestamp(),
 unique(parent_snapshot_key,view_version)
);
create table basirah.research_page_content_passage (
 passage_id text primary key check(passage_id ~ '^cache-passage:[a-f0-9]{48}$'),
 view_id text not null references basirah.research_page_content_view(view_id),
 start_utf16 integer not null check(start_utf16>=0), end_utf16 integer not null,
 core_start_utf16 integer not null, core_end_utf16 integer not null,
 start_codepoint integer not null check(start_codepoint>=0), end_codepoint integer not null,
 core_start_codepoint integer not null, core_end_codepoint integer not null,
 original_text text not null, passage_sha256 text not null check(passage_sha256 ~ '^[a-f0-9]{64}$'),
 context_truncated boolean not null, boundary_truncated boolean not null,
 coverage jsonb not null, search_text text not null,
 unique(view_id,core_start_utf16,core_end_utf16),
 check(end_utf16>start_utf16 and end_utf16-start_utf16<=3000 and core_start_utf16>=start_utf16 and core_end_utf16<=end_utf16 and core_end_utf16>core_start_utf16),
 check(end_codepoint>start_codepoint and char_length(original_text)=end_codepoint-start_codepoint),
 check(core_start_codepoint>=start_codepoint and core_end_codepoint<=end_codepoint and core_end_codepoint>core_start_codepoint),
 check(encode(digest(original_text,'sha256'),'hex')=passage_sha256),
 check((jsonb_typeof(coverage)='object' and coverage->>'chunkerVersion'='exact-content-block-context-v1'
   and (coverage->>'passageCount')::integer between 1 and 32
   and (coverage->>'coveredUtf16Units')::integer between 1 and 30000
   and (coverage->>'totalUtf16Units')::integer between 1 and 30000
   and (coverage->>'coveredUtf16Units')::integer<=(coverage->>'totalUtf16Units')::integer
   and jsonb_typeof(coverage->'fullTextIndexed')='boolean'
   and (coverage->>'fullTextIndexed')::boolean=((coverage->>'coveredUtf16Units')::integer=(coverage->>'totalUtf16Units')::integer)
   and (coverage->>'boundaryTruncatedCount')::integer between 0 and (coverage->>'passageCount')::integer) is true)
);
create index research_content_passage_view_idx on basirah.research_page_content_passage(view_id);
create index research_content_passage_search_idx on basirah.research_page_content_passage using gin(search_text gin_trgm_ops);
create function basirah_private.validate_source_content_insert() returns trigger
 language plpgsql security definer set search_path=pg_catalog,basirah,basirah_private as $$
declare parent basirah.research_page_cache; v basirah.research_page_content_view; original text; r jsonb;
 previous_end integer:=0; previous_codepoint_end integer:=0;
begin
 if tg_table_name='research_page_content_view' then
  select * into parent from basirah.research_page_cache where snapshot_key=new.parent_snapshot_key for key share;
  original:=parent.evidence->>'originalText';
  if parent.snapshot_key is null or parent.revoked_at is not null or parent.expires_at<=clock_timestamp()
    or parent.policy_sha256<>new.policy_sha256 or parent.original_sha256<>new.parent_sha256
    or parent.source_url<>new.source_url or new.selection_canonical::jsonb<>new.selection
    or new.selection->>'originalSha256' is distinct from new.parent_sha256 or new.selection->>'sourceUrl' is distinct from new.source_url
    or new.selection->>'viewVersion' is distinct from new.view_version or new.selection->>'blockScheme' is distinct from 'exact-markdown-blocks-v1'
    or coalesce(new.selection->>'selectionSha256','') !~ '^[a-f0-9]{64}$'
    or coalesce(new.selection->>'requestSha256','') !~ '^[a-f0-9]{64}$'
    or coalesce(new.selection->>'responseSha256','') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(new.selection->'removedBlocks') is distinct from 'array'
    or jsonb_array_length(new.selection->'removedBlocks')>128 then
   raise exception 'SOURCE_CONTENT_PARENT_BINDING_INVALID';
  end if;
  for r in select value from jsonb_array_elements(new.retained_ranges) loop
   if ((r->>'startUtf16')::integer>=previous_end and (r->>'startCodepoint')::integer>=previous_codepoint_end
      and (r->>'endUtf16')::integer>(r->>'startUtf16')::integer
      and (r->>'endCodepoint')::integer>(r->>'startCodepoint')::integer
      and (r->>'endCodepoint')::integer<=char_length(original)
      and basirah_private.cache_utf16_length(substring(original from 1 for (r->>'startCodepoint')::integer))=(r->>'startUtf16')::integer
      and basirah_private.cache_utf16_length(substring(original from 1 for (r->>'endCodepoint')::integer))=(r->>'endUtf16')::integer) is not true then
    raise exception 'SOURCE_CONTENT_RANGE_BINDING_INVALID';
   end if;
   previous_end:=(r->>'endUtf16')::integer; previous_codepoint_end:=(r->>'endCodepoint')::integer;
  end loop;
 else
  select * into v from basirah.research_page_content_view where view_id=new.view_id;
  select * into parent from basirah.research_page_cache where snapshot_key=v.parent_snapshot_key for key share;
  original:=parent.evidence->>'originalText';
  if parent.snapshot_key is null or parent.revoked_at is not null or parent.expires_at<=clock_timestamp()
    or substring(original from new.start_codepoint+1 for new.end_codepoint-new.start_codepoint)<>new.original_text
    or basirah_private.cache_utf16_length(substring(original from 1 for new.start_codepoint))<>new.start_utf16
    or basirah_private.cache_utf16_length(substring(original from 1 for new.end_codepoint))<>new.end_utf16
    or basirah_private.cache_utf16_length(substring(original from 1 for new.core_start_codepoint))<>new.core_start_utf16
    or basirah_private.cache_utf16_length(substring(original from 1 for new.core_end_codepoint))<>new.core_end_utf16
    or (new.coverage->>'totalUtf16Units')::integer<>basirah_private.cache_utf16_length(original)
    or not exists(select 1 from jsonb_array_elements(v.retained_ranges) r where
      (r->>'startUtf16')::integer<=new.start_utf16 and (r->>'endUtf16')::integer>=new.end_utf16
      and (r->>'startCodepoint')::integer<=new.start_codepoint and (r->>'endCodepoint')::integer>=new.end_codepoint) then
   raise exception 'SOURCE_CONTENT_PASSAGE_BINDING_INVALID';
  end if;
 end if;
 return new;
end $$;
create trigger content_view_binding before insert on basirah.research_page_content_view
 for each row execute function basirah_private.validate_source_content_insert();
create trigger content_passage_binding before insert on basirah.research_page_content_passage
 for each row execute function basirah_private.validate_source_content_insert();
create trigger content_view_immutable before update or delete on basirah.research_page_content_view
 for each row execute function basirah_private.freeze_cache_passage();
create trigger content_passage_immutable before update or delete on basirah.research_page_content_passage
 for each row execute function basirah_private.freeze_cache_passage();
revoke all on function basirah_private.validate_source_content_insert() from public;
alter table basirah.research_page_content_view enable row level security;
alter table basirah.research_page_content_passage enable row level security;
grant select on basirah.research_page_content_view,basirah.research_page_content_passage to basirah_research_runtime,basirah_cache_writer;
grant insert on basirah.research_page_content_view,basirah.research_page_content_passage to basirah_cache_writer;
create policy content_view_read on basirah.research_page_content_view for select to basirah_research_runtime,basirah_cache_writer
 using(exists(select 1 from basirah.research_page_cache c where c.snapshot_key=parent_snapshot_key and c.policy_sha256=research_page_content_view.policy_sha256 and c.original_sha256=parent_sha256 and c.revoked_at is null and c.expires_at>clock_timestamp()));
create policy content_view_insert on basirah.research_page_content_view for insert to basirah_cache_writer
 with check(exists(select 1 from basirah.research_page_cache c where c.snapshot_key=parent_snapshot_key and c.policy_sha256=research_page_content_view.policy_sha256 and c.original_sha256=parent_sha256 and c.revoked_at is null and c.expires_at>clock_timestamp()));
create policy content_passage_read on basirah.research_page_content_passage for select to basirah_research_runtime,basirah_cache_writer
 using(exists(select 1 from basirah.research_page_content_view v where v.view_id=research_page_content_passage.view_id));
create policy content_passage_insert on basirah.research_page_content_passage for insert to basirah_cache_writer
 with check(exists(select 1 from basirah.research_page_content_view v where v.view_id=research_page_content_passage.view_id));
insert into basirah_private.schema_migration(version,checksum_sha256)
 values('0013_source_content_views','0000000000000000000000000000000000000000000000000000000000000000');
commit;
