begin;
select pg_advisory_xact_lock(hashtext('basirah:migration:0006'));

do $roles$ begin
  if not exists (select 1 from pg_roles where rolname='basirah_worker') then
    create role basirah_worker nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end $roles$;
grant usage on schema basirah_api to basirah_worker;

alter table basirah.review_run
  add column input_hash bytea check (input_hash is null or octet_length(input_hash)=32),
  add column evidence_state_hash bytea check (evidence_state_hash is null or octet_length(evidence_state_hash)=32),
  add column lease_token_hash bytea check (lease_token_hash is null or octet_length(lease_token_hash)=32);

alter table basirah.evidence_item drop constraint evidence_item_run_passage;
alter table basirah.evidence_item
  add column snapshot_key text check (snapshot_key is null or char_length(snapshot_key) between 1 and 200),
  add column source_key text,
  add column evidence_role text,
  add column source_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(source_metadata)='object'),
  add column parent_evidence_id bigint,
  add constraint evidence_item_parent_fk foreign key (run_id,parent_evidence_id)
    references basirah.evidence_item(run_id,id) deferrable initially deferred,
  add constraint evidence_item_snapshot_identity unique (run_id,snapshot_key);
create unique index evidence_item_local_passage_idx on basirah.evidence_item(run_id,passage_id)
  where passage_id is not null;

alter table basirah.claim alter column confirmed_at drop not null;
alter table basirah.claim alter column confirmed_at drop default;
alter table basirah.finding drop constraint finding_support_status_check;
alter table basirah.finding add constraint finding_support_status_check check (
  support_status in ('supported','overgeneralization','missing_qualification','unsupported_exclusivity',
    'insufficient_evidence','out_of_scope','not_assessed'));

create table basirah.review_report (
  run_id bigint primary key references basirah.review_run(id) on delete cascade,
  result jsonb not null check (jsonb_typeof(result)='object' and octet_length(result::text)<=500000),
  created_at timestamptz not null default clock_timestamp()
);
alter table basirah.review_report enable row level security;
create policy review_report_owned on basirah.review_report for select to basirah_runtime
  using (exists (select 1 from basirah.review_run r where r.id=review_report.run_id));
grant select on basirah.review_report to basirah_runtime;
create trigger review_report_immutable before update on basirah.review_report
  for each row execute function basirah_private.reject_immutable_update();

create function basirah_api.acquire_review(wanted uuid default null, lease_seconds integer default 15)
returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare
  rr basirah.review_run; rev basirah.document_revision; token text; selected_id bigint;
begin
  if lease_seconds < 1 or lease_seconds > 60 then raise exception 'INVALID_LEASE_SECONDS'; end if;
  with invalid as (
    update basirah.review_run r set status='interrupted',
      started_at=coalesce(r.started_at,clock_timestamp()),completed_at=clock_timestamp(),
      lease_until=null,lease_token_hash=null
    from basirah.document_revision dr join basirah.document d on d.id=dr.document_id
    join basirah.guest_session s on s.id=d.session_id
    where r.revision_id=dr.id and (wanted is null or r.public_id=wanted)
      and r.status in ('queued','retrieving','checking','assessing','validating')
      and (r.deadline_at<=clock_timestamp() or d.current_revision_id<>dr.id
        or s.deleted_at is not null or s.expires_at<=clock_timestamp()
        or (r.attempt>=5 and r.lease_until<=clock_timestamp()))
    returning r.id
  ) insert into basirah.review_run_event(run_id,sequence,event_type,safe_metadata)
    select invalid.id,coalesce((select max(sequence)+1 from basirah.review_run_event e where e.run_id=invalid.id),0),
      'interrupted',jsonb_build_object('reason','run_no_longer_eligible') from invalid;
  select r.id into selected_id from basirah.review_run r
    join basirah.document_revision dr on dr.id=r.revision_id
    join basirah.document d on d.id=dr.document_id
    join basirah.guest_session s on s.id=d.session_id
    where (wanted is null or r.public_id=wanted)
      and (r.status='queued' or (r.status in ('retrieving','checking','assessing','validating')
        and r.lease_until <= clock_timestamp() and r.attempt<5))
      and r.deadline_at>clock_timestamp() and s.deleted_at is null
      and s.expires_at>clock_timestamp() and d.current_revision_id=dr.id
    order by r.created_at,r.id for update of r,d,s skip locked limit 1;
  if selected_id is null then return null; end if;
  select * into strict rr from basirah.review_run where id=selected_id;
  select * into strict rev from basirah.document_revision where id=rr.revision_id;
  if public.digest(rev.original_text,'sha256')<>rev.content_hash then raise exception 'CORRUPT_REVISION_HASH'; end if;
  token:=encode(public.gen_random_bytes(32),'hex');
  update basirah.review_run set status='retrieving',
    attempt=case when rr.status='queued' then rr.attempt else rr.attempt+1 end,
    lease_token_hash=public.digest(token,'sha256'), input_hash=rev.content_hash,
    evidence_state_hash=null, lease_until=least(deadline_at,clock_timestamp()+make_interval(secs=>lease_seconds)),
    started_at=coalesce(started_at,clock_timestamp()) where id=rr.id returning * into rr;
  insert into basirah.review_run_event(run_id,sequence,event_type,safe_metadata)
    select rr.id,coalesce(max(sequence)+1,0),'lease_acquired',jsonb_build_object('attempt',rr.attempt)
    from basirah.review_run_event where run_id=rr.id;
  return jsonb_build_object('reviewId',rr.public_id,'revisionId',rev.public_id,'attempt',rr.attempt,
    'token',token,'inputSha256',encode(rr.input_hash,'hex'),'evidenceStateSha256',null,
    'text',rev.original_text,'deadlineAt',rr.deadline_at,'leaseUntil',rr.lease_until,'corpusVersion',rr.corpus_version);
end $function$;

create function basirah_private.utf16_slice(original text,start_offset integer,end_offset integer)
returns text language plpgsql immutable set search_path='' as $function$
declare position integer:=0; point integer; start_point integer; end_point integer; width integer;
begin
  if start_offset<0 or end_offset<=start_offset then raise exception 'INVALID_UTF16_SPAN'; end if;
  for point in 1..char_length(original)+1 loop
    if position=start_offset then start_point:=point; end if;
    if position=end_offset then end_point:=point; exit; end if;
    if point<=char_length(original) then
      width:=case when ascii(substring(original from point for 1))>65535 then 2 else 1 end;
      position:=position+width;
    end if;
  end loop;
  if start_point is null or end_point is null then raise exception 'INVALID_UTF16_SPAN'; end if;
  return substring(original from start_point for end_point-start_point);
end $function$;

-- Locks ownership and current revision as well as the run before any late-write check.
create function basirah_private.lock_review_lease(wanted uuid, wanted_attempt integer, token text)
returns bigint language plpgsql volatile security definer set search_path='' as $function$
declare selected_id bigint;
begin
  if token !~ '^[0-9a-f]{64}$' then return null; end if;
  select r.id into selected_id from basirah.review_run r
    join basirah.document_revision dr on dr.id=r.revision_id
    join basirah.document d on d.id=dr.document_id
    join basirah.guest_session s on s.id=d.session_id
    where r.public_id=wanted and r.attempt=wanted_attempt
      and r.lease_token_hash=public.digest(token,'sha256')
      and r.status in ('retrieving','checking','assessing','validating')
      and r.lease_until>clock_timestamp() and r.deadline_at>clock_timestamp()
      and s.deleted_at is null and s.expires_at>clock_timestamp() and d.current_revision_id=dr.id
    for update of r,d,s;
  return selected_id;
end $function$;

create function basirah_api.heartbeat_review(wanted uuid,wanted_attempt integer,token text,lease_seconds integer)
returns boolean language plpgsql volatile security definer set search_path='' as $function$
declare selected_id bigint;
begin
  if lease_seconds<1 or lease_seconds>60 then raise exception 'INVALID_LEASE_SECONDS'; end if;
  selected_id:=basirah_private.lock_review_lease(wanted,wanted_attempt,token);
  if selected_id is null then return false; end if;
  update basirah.review_run set lease_until=least(deadline_at,clock_timestamp()+make_interval(secs=>lease_seconds))
    where id=selected_id;
  return true;
end $function$;

create function basirah_api.bind_review_evidence(wanted uuid,wanted_attempt integer,token text,old_hash text,new_hash text)
returns boolean language plpgsql volatile security definer set search_path='' as $function$
declare selected_id bigint;
begin
  if new_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_EVIDENCE_HASH'; end if;
  selected_id:=basirah_private.lock_review_lease(wanted,wanted_attempt,token);
  if selected_id is null then return false; end if;
  update basirah.review_run set evidence_state_hash=decode(new_hash,'hex') where id=selected_id
    and encode(evidence_state_hash,'hex') is not distinct from old_hash;
  return found;
end $function$;

create function basirah_api.fail_review(wanted uuid,wanted_attempt integer,token text,error_code text)
returns boolean language plpgsql volatile security definer set search_path='' as $function$
declare selected_id bigint;
begin
  if error_code is null or error_code not in ('adapter_unavailable','invalid_evidence','invalid_report',
    'deadline_exceeded','internal_error') then raise exception 'INVALID_SAFE_ERROR_CODE'; end if;
  selected_id:=basirah_private.lock_review_lease(wanted,wanted_attempt,token);
  if selected_id is null then return false; end if;
  update basirah.review_run set status='failed',completed_at=clock_timestamp(),lease_until=null,
    lease_token_hash=null where id=selected_id;
  insert into basirah.review_run_event(run_id,sequence,event_type,safe_metadata)
    select selected_id,coalesce(max(sequence)+1,0),'failed',jsonb_build_object('code',error_code,'attempt',wanted_attempt)
    from basirah.review_run_event where run_id=selected_id;
  return true;
end $function$;

create function basirah_api.complete_review(wanted uuid,wanted_attempt integer,token text,report jsonb)
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
    or jsonb_typeof(report->'findings') is distinct from 'array' or jsonb_array_length(report->'findings')>5
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
      or item->>'role' not in ('quran_text','hadith_matn','tafsir_commentary','tafsir_footnote')
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

revoke all on basirah.review_report from public;
revoke all on function basirah_private.lock_review_lease(uuid,integer,text) from public;
revoke all on function basirah_private.utf16_slice(text,integer,integer) from public;
revoke all on function basirah_api.acquire_review(uuid,integer),
  basirah_api.heartbeat_review(uuid,integer,text,integer),
  basirah_api.bind_review_evidence(uuid,integer,text,text,text),
  basirah_api.fail_review(uuid,integer,text,text),
  basirah_api.complete_review(uuid,integer,text,jsonb) from public;
grant execute on function basirah_api.acquire_review(uuid,integer),
  basirah_api.heartbeat_review(uuid,integer,text,integer),
  basirah_api.bind_review_evidence(uuid,integer,text,text,text),
  basirah_api.fail_review(uuid,integer,text,text),
  basirah_api.complete_review(uuid,integer,text,jsonb) to basirah_worker;

insert into basirah_private.schema_migration(version,checksum_sha256)
  values('0006_foundation_review_bridge','0000000000000000000000000000000000000000000000000000000000000000');
commit;
