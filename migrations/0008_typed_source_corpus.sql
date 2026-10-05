begin;
select pg_advisory_xact_lock(hashtext('basirah:migration:0008'));

-- Historical passages retain unknown roles; ingestion supplies explicit roles.
alter table basirah.passage
  add column source_role text check (source_role in ('quran_text','hadith_matn','tafsir_commentary','tafsir_footnote','book_excerpt','scholar_explanation')),
  add column snapshot_key text unique check (char_length(snapshot_key) between 1 and 160),
  add column corpus_version text check (char_length(corpus_version) between 1 and 120),
  add column provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  add column context_before text check (char_length(context_before) <= 30000),
  add column context_after text check (char_length(context_after) <= 30000),
  add column footnotes jsonb not null default '[]'::jsonb check (jsonb_typeof(footnotes) = 'array' and jsonb_array_length(footnotes) <= 80),
  add constraint passage_original_hash_check check (content_hash = public.digest(original_text, 'sha256'));

create table basirah.passage_relation (
  from_passage_id bigint not null references basirah.passage(id) on delete restrict,
  to_passage_id bigint not null references basirah.passage(id) on delete restrict,
  relation_type text not null check (relation_type in ('explains','comments_on','quotes','context_before','context_after','footnote_of')),
  provenance jsonb not null check (jsonb_typeof(provenance) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (from_passage_id,to_passage_id,relation_type),
  check (from_passage_id <> to_passage_id)
);
create index passage_relation_target_idx on basirah.passage_relation (to_passage_id);
create trigger passage_relation_immutable before update on basirah.passage_relation
  for each row execute function basirah_private.reject_immutable_update();
alter table basirah.passage_relation enable row level security;
grant select on basirah.passage_relation to basirah_runtime;
create policy passage_relation_approved on basirah.passage_relation for select to basirah_runtime
  using (exists (select 1 from basirah.passage p where p.id = from_passage_id)
    and exists (select 1 from basirah.passage p where p.id = to_passage_id));

-- Explicit development research role. Never granted to production runtime.
create role basirah_research_runtime nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant usage on schema basirah to basirah_research_runtime;
grant select on basirah.source_edition, basirah.passage, basirah.passage_embedding, basirah.passage_relation to basirah_research_runtime;
create policy source_edition_research on basirah.source_edition for select to basirah_research_runtime
  using (approval_status in ('pending','approved') and revoked_at is null);
create policy passage_research on basirah.passage for select to basirah_research_runtime
  using (exists (select 1 from basirah.source_edition s where s.id = source_edition_id
    and s.approval_status in ('pending','approved') and s.revoked_at is null));
create policy passage_embedding_research on basirah.passage_embedding for select to basirah_research_runtime
  using (exists (select 1 from basirah.passage p where p.id = passage_id));
create policy passage_relation_research on basirah.passage_relation for select to basirah_research_runtime
  using (exists (select 1 from basirah.passage p where p.id = from_passage_id)
    and exists (select 1 from basirah.passage p where p.id = to_passage_id));

-- Preserve the prior report binding/lease checks while admitting truthful source roles.
create or replace function basirah_api.complete_review(wanted uuid,wanted_attempt integer,token text,report jsonb)
returns boolean language plpgsql volatile security definer set search_path='' as $function$
declare
  selected_id bigint; rr basirah.review_run; rev basirah.document_revision;
  item jsonb; evidence_id bigint; ids jsonb:='{}'::jsonb; parent_key text; rendered jsonb; segment jsonb;
  entry jsonb; claim_row basirah.claim; finding_id bigint; finding_ordinal integer:=0; evidence_rank integer:=0; cited text;
begin
  selected_id:=basirah_private.lock_review_lease(wanted,wanted_attempt,token);
  if selected_id is null then return false; end if;
  select * into strict rr from basirah.review_run where id=selected_id;
  select * into strict rev from basirah.document_revision where id=rr.revision_id;
  if jsonb_typeof(report) is distinct from 'object' or octet_length(report::text)>500000
    or report->>'reviewId' is distinct from rr.public_id::text or report->>'revisionId' is distinct from rev.public_id::text
    or report->>'inputSha256' is distinct from encode(rev.content_hash,'hex')
    or report->>'inputSha256' is distinct from encode(rr.input_hash,'hex')
    or (report->>'attempt')::integer is distinct from rr.attempt
    or rr.evidence_state_hash is null
    or report->>'evidenceStateSha256' is distinct from encode(rr.evidence_state_hash,'hex')
    or report->>'status' is null or report->>'status' not in ('completed','partial','needs_review')
    or jsonb_typeof(report->'evidence') is distinct from 'array' or jsonb_array_length(report->'evidence')>80
    or jsonb_typeof(report->'findings') is distinct from 'array' or jsonb_array_length(report->'findings')>80
    or jsonb_typeof(report->'result') is distinct from 'object'
    or report->'result'->>'revisionId' is distinct from rev.public_id::text
    or report->'result'->>'inputSha256' is distinct from encode(rr.input_hash,'hex')
    or report->'result'->>'reviewId' is distinct from rr.public_id::text
    or report->'result'->>'evidenceStateSha256' is distinct from encode(rr.evidence_state_hash,'hex')
    or report->'result'->>'status' is distinct from report->>'status'
    or report->'result'->'intake'->>'originalText' is distinct from rev.original_text
    or report->'result'->'intake'->>'revisionId' is distinct from rev.public_id::text
    or report->'result'->'intake'->>'revisionSha256' is distinct from encode(rev.content_hash,'hex')
    or report->'result'->'intake'->>'corpusVersion' is distinct from rr.corpus_version
    or report->'result'->'intake'->>'offsetUnit' is distinct from 'utf16_code_unit'
    or jsonb_typeof(report->'result'->'intake'->'segments') is distinct from 'array'
    or jsonb_typeof(report->'result'->'intake'->'evidence') is distinct from 'array'
    or jsonb_array_length(report->'result'->'intake'->'evidence')<>jsonb_array_length(report->'evidence')
    or jsonb_array_length(report->'result'->'intake'->'segments')>80
    then raise exception 'INVALID_REPORT_BINDING'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(report->'result'->'intake'->'segments'))
       <>jsonb_array_length(report->'result'->'intake'->'segments') then raise exception 'INVALID_RENDERED_SEGMENTS'; end if;
  if (select count(distinct coalesce(value->'provenance'->>'snapshotKey',value->>'id'))
      from jsonb_array_elements(report->'evidence'))<>jsonb_array_length(report->'evidence') then
    raise exception 'DUPLICATE_EVIDENCE_SNAPSHOT'; end if;
  for segment in select value from jsonb_array_elements(report->'result'->'intake'->'segments') loop
    if basirah_private.utf16_slice(rev.original_text,(segment->>'startOffset')::integer,(segment->>'endOffset')::integer)
         is distinct from segment->>'originalText'
      or (case when (segment->>'startOffset')::integer=0 then 0 else
          char_length(basirah_private.utf16_slice(rev.original_text,0,(segment->>'startOffset')::integer)) end)
         is distinct from (segment->>'codePointStart')::integer
      or char_length(basirah_private.utf16_slice(rev.original_text,0,(segment->>'endOffset')::integer))
         is distinct from (segment->>'codePointEnd')::integer
      or jsonb_typeof(segment->'sourceKeys') is distinct from 'array'
      or exists(select 1 from jsonb_array_elements_text(segment->'sourceKeys') k
        where not exists(select 1 from jsonb_array_elements(report->'evidence') e
          where coalesce(e->'provenance'->>'snapshotKey',e->>'id')=k))
      then raise exception 'INVALID_RENDERED_SEGMENTS'; end if;
  end loop;
  for item in select value from jsonb_array_elements(report->'evidence')
    order by case value->>'role' when 'tafsir_commentary' then 1 when 'tafsir_footnote' then 2 else 0 end loop
    select value into rendered from jsonb_array_elements(report->'result'->'intake'->'evidence')
      where value->>'snapshotKey'=coalesce(item->'provenance'->>'snapshotKey',item->>'id');
    if (select count(*) from jsonb_array_elements(report->'result'->'intake'->'evidence')
      where value->>'snapshotKey'=coalesce(item->'provenance'->>'snapshotKey',item->>'id'))<>1
      or rendered is distinct from ((item-'id'-'role'-'parentEvidenceId'-'retrievedAt')||
        jsonb_build_object('snapshotKey',coalesce(item->'provenance'->>'snapshotKey',item->>'id'),
          'sourceRole',item->'role','provenance',(item->'provenance')-'snapshotKey',
          'parentSnapshotKey',(select coalesce(p->'provenance'->>'snapshotKey',p->>'id')
            from jsonb_array_elements(report->'evidence') p where p->>'id'=item->>'parentEvidenceId')))
      then raise exception 'RENDERED_EVIDENCE_MISMATCH'; end if;
    if item->>'id' is null or ids ? (item->>'id')
      or item->>'originalSha256' is distinct from encode(public.digest(item->>'originalText','sha256'),'hex')
      or item->>'originalSha256' is null
      or item->>'approvalStatus' not in ('pending','approved','rejected','revoked')
      or jsonb_typeof(item->'researchOnly') is distinct from 'boolean'
      or jsonb_typeof(item->'sourceId') is distinct from 'string'
      or jsonb_typeof(item->'role') is distinct from 'string'
      or item->>'role' not in ('quran_text','hadith_matn','tafsir_commentary','tafsir_footnote','book_excerpt','scholar_explanation')
      or char_length(item->>'sourceId') not between 1 and 200
      or char_length(item->>'role') not between 1 and 80
      or char_length(item->>'work') not between 1 and 300 or item->>'work' is null
      or item->>'approvalStatus' is null
      or ((item->>'researchOnly')::boolean=false and item->>'approvalStatus'<>'approved')
      or jsonb_typeof(item->'provenance') is distinct from 'object' then raise exception 'INVALID_EVIDENCE'; end if;
    parent_key:=item->>'parentEvidenceId';
    if parent_key is not null and (not ids ? parent_key or parent_key=item->>'id') then
      raise exception 'INVALID_EVIDENCE_PARENT';
    end if;
    if item->>'role'='tafsir_footnote' then
      if parent_key is null or not exists (
        select 1 from jsonb_array_elements(report->'evidence') parent
        where parent->>'id'=parent_key and parent->>'role'='tafsir_commentary'
          and parent->>'sourceId'=item->>'sourceId' and parent->>'sourceVersion'=item->>'sourceVersion'
          and parent->>'work'=item->>'work' and parent->>'reference'=item->>'reference') then raise exception 'FOOTNOTE_SOURCE_MISMATCH'; end if;
    elsif item->>'role'='tafsir_commentary' and parent_key is not null then
      if not exists(select 1 from jsonb_array_elements(report->'evidence') parent
        where parent->>'id'=parent_key and parent->>'role'='quran_text'
          and parent->>'parentEvidenceId' is null and parent->>'reference'=item->>'reference') then
        raise exception 'COMMENTARY_ANCHOR_MISMATCH'; end if;
    elsif parent_key is not null then raise exception 'UNEXPECTED_EVIDENCE_PARENT'; end if;
    evidence_rank:=evidence_rank+1;
    insert into basirah.evidence_item(run_id,snapshot_key,source_key,evidence_role,source_version,
      reference,original_text_snapshot,retrieval_modes,retrieved_at,delivery_mode,content_hash,rank,source_metadata,parent_evidence_id)
    values(rr.id,item->>'id',item->>'sourceId',item->>'role',item->>'sourceVersion',item->>'reference',
      item->>'originalText',array(select jsonb_array_elements_text(item->'retrievalModes')),
      (item->>'retrievedAt')::timestamptz,item->>'delivery',decode(item->>'originalSha256','hex'),
      evidence_rank,item-'originalText'-'originalSha256'-'id',
      case when parent_key is null then null else (ids->>parent_key)::bigint end) returning id into evidence_id;
    ids:=ids||jsonb_build_object(item->>'id',evidence_id);
  end loop;
  for item in select value from jsonb_array_elements(report->'evidence') loop
    parent_key:=item->>'parentEvidenceId';
    if parent_key is not null and (not ids ? parent_key or parent_key=item->>'id') then
      raise exception 'INVALID_EVIDENCE_PARENT';
    end if;
  end loop;
  for entry in select value from jsonb_array_elements(report->'findings') loop
    finding_ordinal:=finding_ordinal+1;
    if jsonb_typeof(entry->'editorConfirmed') is distinct from 'boolean'
      or basirah_private.utf16_slice(rev.original_text,(entry->>'startOffset')::integer,(entry->>'endOffset')::integer)
        is distinct from entry->>'claimText' then raise exception 'CLAIM_SPAN_MISMATCH'; end if;
    if not (entry->>'editorConfirmed')::boolean and entry->>'supportStatus'<>'not_assessed' then
      raise exception 'UNCONFIRMED_SUPPORT_ASSESSMENT';
    end if;
    select * into claim_row from basirah.claim c where c.revision_id=rev.id
      and c.start_offset=(entry->>'startOffset')::integer and c.end_offset=(entry->>'endOffset')::integer
      and c.confirmed_text=entry->>'claimText' and c.claim_type=entry->>'claimType'
      and ((entry->>'editorConfirmed')::boolean=(c.confirmed_at is not null))
      and not exists(select 1 from basirah.finding f where f.run_id=rr.id and f.claim_id=c.id)
      order by c.ordinal limit 1;
    if not found then
      if (entry->>'editorConfirmed')::boolean then raise exception 'CLAIM_NOT_EDITOR_CONFIRMED'; end if;
      insert into basirah.claim(revision_id,ordinal,start_offset,end_offset,confirmed_text,claim_type,confirmed_at)
        values(rev.id,(select coalesce(max(c.ordinal),0)+1 from basirah.claim c where c.revision_id=rev.id),
          (entry->>'startOffset')::integer,(entry->>'endOffset')::integer,
          entry->>'claimText',entry->>'claimType',null) returning * into claim_row;
    end if;
    if (entry->>'editorConfirmed')::boolean and claim_row.confirmed_at is null then
      raise exception 'CLAIM_NOT_EDITOR_CONFIRMED';
    end if;
    insert into basirah.finding(run_id,revision_id,claim_id,quote_status,support_status,explanation)
      values(rr.id,rev.id,claim_row.id,entry->>'quoteStatus',entry->>'supportStatus',entry->>'explanation')
      returning id into finding_id;
    if jsonb_typeof(entry->'evidenceIds') is distinct from 'array' then raise exception 'INVALID_CITATIONS'; end if;
    if jsonb_array_length(entry->'evidenceIds')=0 and
      (entry->>'quoteStatus' in ('exact','normalized','mismatch') or
       entry->>'supportStatus' not in ('not_assessed','insufficient_evidence','out_of_scope'))
      then raise exception 'EVIDENCE_REQUIRED'; end if;
    for cited in select jsonb_array_elements_text(entry->'evidenceIds') loop
      if not ids ? cited then raise exception 'UNKNOWN_CITATION'; end if;
      insert into basirah.finding_evidence(run_id,finding_id,evidence_item_id)
        values(rr.id,finding_id,(ids->>cited)::bigint);
    end loop;
  end loop;
  insert into basirah.review_report(run_id,result) values(rr.id,report->'result');
  update basirah.review_run set status=report->>'status',completed_at=clock_timestamp(),
    lease_until=null,lease_token_hash=null where id=rr.id and lease_until>clock_timestamp()
    and deadline_at>clock_timestamp();
  if not found then raise exception 'REVIEW_DEADLINE_DURING_PERSIST'; end if;
  insert into basirah.review_run_event(run_id,sequence,event_type,safe_metadata)
    select rr.id,coalesce(max(sequence)+1,0),'report_persisted',jsonb_build_object('attempt',rr.attempt)
    from basirah.review_run_event where run_id=rr.id;
  return true;
end $function$;

insert into basirah_private.schema_migration (version,checksum_sha256)
values ('0008_typed_source_corpus','0000000000000000000000000000000000000000000000000000000000000000');
commit;
