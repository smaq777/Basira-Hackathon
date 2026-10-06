begin;
do $test$
declare session_id bigint;document_id bigint;revision_id bigint;ticket_id bigint;
  body jsonb;source jsonb;receipt jsonb;outbox_before bigint;
begin
  insert into basirah.guest_session(ownership_secret_hash,expires_at)
    values(public.digest('synthetic-demo-191','sha256'),clock_timestamp()+interval '1 hour') returning id into session_id;
  insert into basirah.document(session_id) values(session_id) returning id into document_id;
  insert into basirah.document_revision(document_id,version,original_text,content_hash)
    values(document_id,1,'Synthetic demo input, never the published reviewer answer',public.digest('Synthetic demo input, never the published reviewer answer','sha256')) returning id into revision_id;
  insert into basirah.review_ticket(ticket_code,revision_id,email_lookup_hash,notify_opt_in)
    values('BR-191QA0000001',revision_id,public.digest('synthetic@example.com','sha256'),false) returning id into ticket_id;
  body:='{"schemaVersion":1,"summary":"Synthetic saved answer","limitations":"Technical QA only","suggestedText":"","records":[],"evidence":[{"id":"quran-test","work":"Synthetic reference","author":"","edition":"","reference":"qa:1","sourceUrl":"https://example.com/source","originalText":"Synthetic supporting original","context":"","sourceRole":"quran_text"}]}'::jsonb;
  select count(*) into outbox_before from basirah.review_notification_outbox;
  perform set_config('role','basirah_runtime',true);
  receipt:=basirah_api.save_editorial_review('BR-191QA0000001','synthetic-reviewer','bounded_revision','Synthetic saved reviewer answer',true,0,body);
  if receipt->>'version'<>'1' or receipt->>'published'<>'true' then raise exception 'publication failed';end if;
  source:=jsonb_build_object('sourceRole','reviewer_commentary','work','Reviewer answer','author','synthetic-reviewer','edition','Version 1','rightsRecord','Explicit demo reuse','sourceUrl','https://example.com/#/reviewer/detail?ticketCode=BR-191QA0000001','originalText','Synthetic saved reviewer answer','reference','BR-191QA0000001 version 1','ticketCode','BR-191QA0000001','reviewVersion',1,'supportingEvidence',body->'evidence','supportingContext','Synthetic supporting original');
  receipt:=basirah_api.approve_editorial_source('reviewed-19100000000000000000000000000001','qa-191','Synthetic saved reviewer answer',encode(public.digest('Synthetic saved reviewer answer','sha256'),'hex'),'synthetic-reviewer',source);
  if not basirah_api.record_reviewed_source_receipt('BR-191QA0000001',1,'reviewer-answer',receipt->>'snapshotKey','synthetic-reviewer') then raise exception 'answer receipt failed';end if;
  if not basirah_api.record_reviewed_source_receipt('BR-191QA0000001',1,'reviewer-answer',receipt->>'snapshotKey','synthetic-reviewer') then raise exception 'idempotent receipt failed';end if;
  if basirah_api.record_reviewed_source_receipt('BR-191QA0000001',1,'invented-source',receipt->>'snapshotKey','synthetic-reviewer') then raise exception 'invalid source accepted';end if;
  if basirah_api.record_reviewed_source_receipt('BR-191QA0000001',2,'reviewer-answer',receipt->>'snapshotKey','synthetic-reviewer') then raise exception 'invalid version accepted';end if;
  perform set_config('role',current_setting('session_authorization'),true);
  if (select count(*) from basirah.review_notification_outbox)<>outbox_before then raise exception 'opted-out publication queued mail';end if;
  if (select count(*) from basirah.reviewed_source_receipt where evidence_id='reviewer-answer')<>1 then raise exception 'duplicate answer receipt';end if;
  if not exists(select 1 from basirah.passage where snapshot_key=receipt->>'snapshotKey' and source_role='reviewer_commentary' and provenance->'supportingEvidence'=body->'evidence') then raise exception 'answer sources missing';end if;
end
$test$;
reset role;
select 'PASS: saved answer plus full supporting sources; Quran-only publication; version-bound receipt; duplicate receipt prevention; opt-out produces no mail' as receipt;
rollback;
