begin;
select pg_advisory_xact_lock(hashtext('basirah:migration:0017'));
create table basirah.reviewer_source_contribution (
  id bigint generated always as identity primary key,
  passage_id bigint not null references basirah.passage(id) on delete restrict,
  ticket_code text not null check(ticket_code ~ '^BR-[A-Z0-9]{12}$'),
  review_version integer not null check(review_version>0),
  reviewer_user_id text not null check(char_length(reviewer_user_id) between 1 and 255),
  created_at timestamptz not null default clock_timestamp(),
  unique(passage_id,ticket_code,review_version)
);
alter table basirah.reviewer_source_contribution enable row level security;
revoke all on basirah.reviewer_source_contribution from public,basirah_runtime,basirah_research_runtime;
create trigger reviewer_source_contribution_immutable before update on basirah.reviewer_source_contribution
for each row execute function basirah_private.reject_immutable_update();

-- Authenticated allowlisted source curators only at the API boundary. Runtime
-- receives this scoped insertion function, not owner/table-write privileges.
create function basirah_api.approve_editorial_source(
  requested_key text, requested_corpus text, search_text text, original_hash text, actor text, source jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare selected_edition bigint;selected_passage bigint;identity_key text;
begin
  if source is null or jsonb_typeof(source) <> 'object' or requested_key is null or requested_corpus is null
    or actor is null or search_text is null or original_hash is null
    or requested_key !~ '^reviewed-[a-f0-9]{32}$' or char_length(requested_corpus) not between 1 and 120
    or not (source ?& array['sourceRole','work','author','edition','rightsRecord','sourceUrl','originalText','reference','ticketCode','reviewVersion'])
    or exists(select 1 from unnest(array['sourceRole','work','author','edition','rightsRecord','sourceUrl','originalText','reference','ticketCode']) k
      where jsonb_typeof(source->k) is distinct from 'string' or btrim(source->>k)='')
    or jsonb_typeof(source->'reviewVersion') is distinct from 'number'
    or source->>'sourceRole' not in ('hadith_matn','book_excerpt','scholar_explanation')
    or char_length(source->>'work') not between 1 and 300 or char_length(source->>'author') not between 1 and 300
    or char_length(source->>'edition') not between 1 and 300 or char_length(source->>'rightsRecord') not between 1 and 2000
    or source->>'sourceUrl' !~ '^https://' or char_length(source->>'originalText') not between 1 and 30000
    or char_length(source->>'reference') not between 1 and 300 or char_length(search_text) not between 1 and 30000
    or source->>'ticketCode' !~ '^BR-[A-Z0-9]{12}$' or source->>'reviewVersion' !~ '^[1-9][0-9]{0,8}$'
    or char_length(actor) not between 1 and 255 then raise exception 'invalid reviewed source'; end if;
  identity_key:=requested_key;
  if encode(public.digest(convert_to(source->>'originalText','UTF8'),'sha256'),'hex') <> original_hash then raise exception 'source hash mismatch'; end if;
  insert into basirah.source_edition(source_key,work_name,author_name,edition,content_version,source_url,rights_record,approval_status,approved_at)
  values(identity_key,source->>'work',source->>'author',source->>'edition','reviewed-v1',source->>'sourceUrl',source->>'rightsRecord','approved',clock_timestamp())
  on conflict(source_key,content_version) do nothing;
  select id into selected_edition from basirah.source_edition s where s.source_key=identity_key and s.content_version='reviewed-v1' and s.approval_status='approved'
    and s.revoked_at is null
    and s.work_name=source->>'work' and s.author_name=source->>'author' and s.edition=source->>'edition'
    and s.source_url=source->>'sourceUrl' and s.rights_record=source->>'rightsRecord';
  if selected_edition is null then raise exception 'source identity unavailable'; end if;
  insert into basirah.passage(source_edition_id,stable_reference,ordinal,original_text,search_key,content_hash,source_role,snapshot_key,corpus_version,provenance,context_before,context_after)
  values(selected_edition,source->>'reference',0,source->>'originalText',search_text,decode(original_hash,'hex'),source->>'sourceRole',identity_key,requested_corpus,
    jsonb_build_object('source','reviewer_approved_original','reviewer',actor,'ticketCode',source->>'ticketCode','reviewVersion',source->'reviewVersion'),null,null)
  on conflict(source_edition_id,stable_reference) do nothing;
  select p.id into selected_passage from basirah.passage p where p.source_edition_id=selected_edition and p.stable_reference=source->>'reference'
    and p.original_text=source->>'originalText' and p.content_hash=decode(original_hash,'hex') and p.source_role=source->>'sourceRole';
  if selected_passage is null then raise exception 'reviewed source identity collision'; end if;
  insert into basirah.corpus_snapshot(corpus_version,passage_id) values(requested_corpus,selected_passage) on conflict do nothing;
  insert into basirah.reviewer_source_contribution(passage_id,ticket_code,review_version,reviewer_user_id)
  values(selected_passage,source->>'ticketCode',(source->>'reviewVersion')::integer,actor) on conflict do nothing;
  return jsonb_build_object('snapshotKey',identity_key);
end
$function$;
revoke all on function basirah_api.approve_editorial_source(text,text,text,text,text,jsonb) from public;
-- Corpus readers must not gain a write capability through their existing
-- research role. A dedicated curator login receives only this function through
-- the checked-in provisioning script; the report runtime is for co-located QA.
grant execute on function basirah_api.approve_editorial_source(text,text,text,text,text,jsonb) to basirah_runtime;
insert into basirah_private.schema_migration(version,checksum_sha256)
values('0017_reviewed_source_contributions','0000000000000000000000000000000000000000000000000000000000000000');
commit;
