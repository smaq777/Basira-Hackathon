begin;
select pg_advisory_xact_lock(hashtext('basirah:migration:0010'));
do $$ begin
  if not exists(select 1 from pg_roles where rolname='basirah_cache_writer') then
    create role basirah_cache_writer nologin noinherit nobypassrls;
  end if;
end $$;
grant usage on schema basirah to basirah_cache_writer;
create table basirah.research_page_cache (
  snapshot_key text primary key,
  source_url text not null,
  original_sha256 text not null check(original_sha256 ~ '^[a-f0-9]{64}$'),
  policy_sha256 text not null check(policy_sha256 ~ '^[a-f0-9]{64}$'),
  evidence jsonb not null check(evidence->>'approvalStatus'='pending' and evidence->>'researchOnly'='true'),
  topics text[] not null check(cardinality(topics) between 1 and 5 and topics <@ array['aqidah','worship','ethics','family','transactions','quran_exegesis','hadith_studies','biography','other']::text[]),
  classification jsonb not null,
  search_text text not null,
  embedding vector(1536),
  embedding_model text,
  created_at timestamptz not null default clock_timestamp(),
  last_verified_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  unique(source_url,original_sha256,policy_sha256),
  check(expires_at>created_at),
  check((jsonb_typeof(evidence->'originalText')='string' and encode(digest(evidence->>'originalText','sha256'),'hex')=original_sha256) is true),
  check(not ((evidence->'provenance') ?| array['querySha256','gapReason','reviewId','revisionId','claimId','originalInput'])),
  check((embedding is null)=(embedding_model is null)),
  check(evidence->>'sourceUrl'=source_url and evidence->>'originalSha256'=original_sha256 and evidence->>'snapshotKey'=snapshot_key)
);
create index research_page_cache_search_idx on basirah.research_page_cache using gin(search_text gin_trgm_ops);
create index research_page_cache_policy_expiry_idx on basirah.research_page_cache(policy_sha256,expires_at);
-- Originals and machine labels are immutable. Revocation is an operator-only action.
create function basirah_private.freeze_research_page_cache() returns trigger language plpgsql as $$
begin
 if (to_jsonb(new)-'revoked_at'-'last_verified_at'-'expires_at') is distinct from (to_jsonb(old)-'revoked_at'-'last_verified_at'-'expires_at') then
   raise exception 'RESEARCH_CACHE_IMMUTABLE';
 end if;
 return new;
end $$;
create trigger research_page_cache_immutable before update on basirah.research_page_cache
 for each row execute function basirah_private.freeze_research_page_cache();
alter table basirah.research_page_cache enable row level security;
grant select on basirah.research_page_cache to basirah_research_runtime,basirah_cache_writer;
grant insert on basirah.research_page_cache to basirah_cache_writer;
grant update(last_verified_at,expires_at) on basirah.research_page_cache to basirah_cache_writer;
create policy research_cache_read on basirah.research_page_cache for select to basirah_research_runtime
 using(revoked_at is null and expires_at>clock_timestamp());
create policy research_cache_writer_read on basirah.research_page_cache for select to basirah_cache_writer
 using(revoked_at is null);
create policy research_cache_refresh on basirah.research_page_cache for update to basirah_cache_writer
 using(revoked_at is null) with check(revoked_at is null);
create policy research_cache_insert on basirah.research_page_cache for insert to basirah_cache_writer
 with check(evidence->>'approvalStatus'='pending' and evidence->>'researchOnly'='true' and revoked_at is null);
insert into basirah_private.schema_migration(version,checksum_sha256)
 values('0010_research_page_cache','0000000000000000000000000000000000000000000000000000000000000000');
commit;
