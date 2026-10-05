begin;
select pg_advisory_xact_lock(hashtext('basirah:migration:0009'));

-- A source original can belong to several reviewed corpus versions without rewriting it.
create table basirah.corpus_snapshot (
  corpus_version text not null check (char_length(corpus_version) between 1 and 120),
  passage_id bigint not null references basirah.passage(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  primary key (corpus_version,passage_id)
);
insert into basirah.corpus_snapshot(corpus_version,passage_id)
  select corpus_version,id from basirah.passage where corpus_version is not null;
create index corpus_snapshot_passage_idx on basirah.corpus_snapshot(passage_id);
create trigger corpus_snapshot_immutable before update on basirah.corpus_snapshot
  for each row execute function basirah_private.reject_immutable_update();
alter table basirah.corpus_snapshot enable row level security;
grant select on basirah.corpus_snapshot to basirah_runtime,basirah_research_runtime;
create policy corpus_snapshot_visible on basirah.corpus_snapshot for select to basirah_runtime,basirah_research_runtime
  using (exists(select 1 from basirah.passage p where p.id=passage_id));

insert into basirah_private.schema_migration(version,checksum_sha256)
  values('0009_versioned_corpus_membership','0000000000000000000000000000000000000000000000000000000000000000');
commit;
