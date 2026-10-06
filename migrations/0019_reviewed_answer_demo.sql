begin;
select pg_advisory_xact_lock(hashtext('basirah:migration:0019'));
-- Human answers have their own type; original scripture and source text stay immutable.
alter table basirah.passage drop constraint passage_source_role_check;
alter table basirah.passage add constraint passage_source_role_check check
  (source_role in ('quran_text','hadith_matn','tafsir_commentary','tafsir_footnote','book_excerpt','scholar_explanation','reviewer_commentary'));
-- CREATE OR REPLACE retains existing dedicated curator/runtime grants.
create or replace function basirah_api.approve_editorial_source(
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
    or source->>'sourceRole' not in ('hadith_matn','book_excerpt','scholar_explanation','reviewer_commentary')
    or char_length(source->>'work') not between 1 and 300 or char_length(source->>'author') not between 1 and 300
    or char_length(source->>'edition') not between 1 and 300 or char_length(source->>'rightsRecord') not between 1 and 2000
    or source->>'sourceUrl' !~ '^https://' or char_length(source->>'originalText') not between 1 and 30000
    or char_length(source->>'reference') not between 1 and 300 or char_length(search_text) not between 1 and 30000
    or source->>'ticketCode' !~ '^BR-[A-Z0-9]{12}$' or source->>'reviewVersion' !~ '^[1-9][0-9]{0,8}$'
    or char_length(actor) not between 1 and 255 then raise exception 'invalid reviewed source'; end if;
  if source->>'sourceRole'='reviewer_commentary' and
    (jsonb_typeof(source->'supportingEvidence') is distinct from 'array'
      or jsonb_array_length(source->'supportingEvidence')>80
      or jsonb_typeof(source->'supportingContext') is distinct from 'string'
      or char_length(source->>'supportingContext')>30000) then
    raise exception 'invalid supporting evidence'; end if;
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
    jsonb_build_object('source',case when source->>'sourceRole'='reviewer_commentary' then 'reviewer_approved_answer' else 'reviewer_approved_original' end,
      'reviewer',actor,'ticketCode',source->>'ticketCode','reviewVersion',source->'reviewVersion')
      || case when source->>'sourceRole'='reviewer_commentary' then jsonb_build_object('supportingEvidence',source->'supportingEvidence') else '{}'::jsonb end,
    case when source->>'sourceRole'='reviewer_commentary' then nullif(source->>'supportingContext','') else null end,null)
  on conflict(source_edition_id,stable_reference) do nothing;
  select p.id into selected_passage from basirah.passage p where p.source_edition_id=selected_edition and p.stable_reference=source->>'reference'
    and p.original_text=source->>'originalText' and p.content_hash=decode(original_hash,'hex') and p.source_role=source->>'sourceRole';
  if selected_passage is null then raise exception 'reviewed source identity collision'; end if;
  insert into basirah.corpus_snapshot(corpus_version,passage_id) values(requested_corpus,selected_passage) on conflict do nothing;
  insert into basirah.reviewer_source_contribution(passage_id,ticket_code,review_version,reviewer_user_id)
  values(selected_passage,source->>'ticketCode',(source->>'reviewVersion')::integer,actor) on conflict do nothing;
  -- Link only byte-identical originals already present in this retrieval snapshot.
  -- Attached references remain fully preserved even when they have no corpus match.
  if source->>'sourceRole'='reviewer_commentary' then
    insert into basirah.passage_relation(from_passage_id,to_passage_id,relation_type,provenance)
    select selected_passage,p.id,'comments_on',jsonb_build_object('source','reviewer_attached_evidence')
    from jsonb_array_elements(source->'supportingEvidence') item
    join basirah.passage p on p.snapshot_key=item->>'id'
      and p.original_text=item->>'originalText'
      and p.content_hash=public.digest(convert_to(item->>'originalText','UTF8'),'sha256')
    where p.source_role <> 'reviewer_commentary' and exists(
      select 1 from basirah.corpus_snapshot cs where cs.passage_id=p.id
      and cs.corpus_version in (requested_corpus,substr(requested_corpus,10)))
    on conflict do nothing;
  end if;
  return jsonb_build_object('snapshotKey',identity_key);
end
$function$;

-- The isolated corpus database may not contain the report/ticket schema.
do $migration$
begin
  if to_regclass('basirah.review_ticket_editorial') is not null then
    execute $receipt$
create or replace function basirah_api.record_reviewed_source_receipt(code text,requested_version integer,requested_evidence text,snapshot text,actor text)
returns boolean language plpgsql volatile security definer set search_path='' as $function$
declare selected_response bigint;selected_ticket bigint;
begin
  select r.id,t.id into selected_response,selected_ticket from basirah.review_ticket t
    join basirah.review_ticket_response r on r.ticket_id=t.id left join basirah.review_ticket_editorial e on e.response_id=r.id
    where t.ticket_code=code and t.status <> 'closed' and r.version=requested_version and r.published
    and (requested_evidence='reviewer-answer' or exists(select 1 from jsonb_array_elements(e.result->'evidence') item where item->>'id'=requested_evidence));
  if selected_response is null then return false;end if;
  insert into basirah.reviewed_source_receipt(response_id,evidence_id,snapshot_key,approved_by)
    values(selected_response,requested_evidence,snapshot,actor) on conflict do nothing;
  if not exists(select 1 from basirah.reviewed_source_receipt s where s.response_id=selected_response and s.evidence_id=requested_evidence and s.snapshot_key=snapshot) then
    raise exception 'source receipt identity collision';end if;
  insert into basirah.review_ticket_event(ticket_id,event_type,actor_id,safe_metadata)
    values(selected_ticket,'retrieval_approved',actor,jsonb_build_object('version',requested_version,'evidenceId',requested_evidence,'snapshotKey',snapshot));
  return true;
end
$function$;
$receipt$;
    revoke all on function basirah_api.record_reviewed_source_receipt(text,integer,text,text,text) from public;
    grant execute on function basirah_api.record_reviewed_source_receipt(text,integer,text,text,text) to basirah_runtime;
  end if;
end
$migration$;
insert into basirah_private.schema_migration(version,checksum_sha256)
values('0019_reviewed_answer_demo','0000000000000000000000000000000000000000000000000000000000000000');
commit;
