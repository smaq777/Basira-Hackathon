begin;
do $test$
declare
  session_id bigint;document_id bigint;revision_id bigint;ticket_id bigint;notification_id bigint;delivery_id bigint;
  body jsonb;receipt jsonb;lookup jsonb;first_source jsonb;source_receipt jsonb;
  rejected boolean:=false;
begin
  insert into basirah.guest_session(ownership_secret_hash,expires_at)
    values(public.digest('synthetic-reviewer-test','sha256'),clock_timestamp()+interval '1 hour') returning id into session_id;
  insert into basirah.document(session_id) values(session_id) returning id into document_id;
  insert into basirah.document_revision(document_id,version,original_text,content_hash)
    values(document_id,1,'نص تجريبي اصطناعي للمراجعة',public.digest('نص تجريبي اصطناعي للمراجعة','sha256')) returning id into revision_id;
  insert into basirah.review_ticket(ticket_code,revision_id,email_lookup_hash,contact_ciphertext,notify_opt_in)
    values('BR-156QA0000001',revision_id,public.digest('synthetic@example.com','sha256'),decode('0001','hex'),true) returning id into ticket_id;
  body:='{"schemaVersion":1,"summary":"Synthetic review","limitations":"No substantive test claim","suggestedText":"","records":[{"id":"record-1","kind":"quotation","originalText":"نص تجريبي اصطناعي للمراجعة","status":"matched","correctedText":"","explanation":"Synthetic match","evidenceIds":["source-1"]}],"evidence":[{"id":"source-1","work":"Synthetic work","author":"Synthetic author","edition":"Test edition","reference":"test:1","sourceUrl":"https://example.com/source","originalText":"نص تجريبي اصطناعي للمراجعة","context":"","sourceRole":"book_excerpt"}]}'::jsonb;
  perform set_config('role','basirah_runtime',true);
  receipt:=basirah_api.save_editorial_review('BR-156QA0000001','synthetic-reviewer','bounded_revision','Same note',true,0,body);
  if receipt->>'version'<>'1' or receipt->>'published'<>'true' then raise exception 'publication failed';end if;
  receipt:=basirah_api.save_editorial_review('BR-156QA0000001','synthetic-reviewer','bounded_revision','Same note',true,1,body||'{"summary":"Version 2"}'::jsonb);
  begin
    perform basirah_api.save_editorial_review('BR-156QA0000001','synthetic-reviewer','bounded_revision','stale',true,1,body);
  exception when serialization_failure then rejected:=true;end;
  if not rejected then raise exception 'stale write accepted';end if;
  lookup:=basirah_api.lookup_review_ticket('BR-156QA0000001',public.digest('synthetic@example.com','sha256'));
  if lookup->'response'->>'version'<>'2' or lookup->'editorial'->>'summary'<>'Version 2' then raise exception 'latest version lookup failed';end if;
  if basirah_api.lookup_review_ticket('BR-156QA0000001',public.digest('wrong@example.com','sha256'))->>'found'<>'false' then raise exception 'email isolation failed';end if;
  select n.notification_id into notification_id from basirah_api.claim_editorial_notifications(10) n where response_version=1 and editorial->>'summary'='Synthetic review';
  if notification_id is null then raise exception 'email version binding failed';end if;
  if not basirah_api.record_email_receipt('BR-156QA0000001',notification_id,'<synthetic-156@provider.example>') then raise exception 'provider receipt not persisted';end if;
  if not basirah_api.complete_review_notification(notification_id,true,null) then raise exception 'provider acceptance failed';end if;
  select d.id into delivery_id from basirah_api.pending_email_deliveries(10) d where message_id='<synthetic-156@provider.example>';
  if delivery_id is null then raise exception 'pending delivery poll missing';end if;
  if not basirah_api.record_email_delivery(delivery_id,'delivered',clock_timestamp()) then raise exception 'delivery update failed';end if;
  if basirah_api.ticket_email_deliveries('BR-156QA0000001')->0->>'event'<>'delivered' then raise exception 'delivery readback failed';end if;
  if jsonb_array_length(basirah_api.review_ticket_page(0,1,'all','156QA')->'tickets')<>1 then raise exception 'pagination failed';end if;
  first_source:=body->'evidence'->0 || jsonb_build_object('rightsRecord','Synthetic test only','ticketCode','BR-156QA0000001','reviewVersion',2);
  source_receipt:=basirah_api.approve_editorial_source('reviewed-15600000000000000000000000000001','qa-156','نص تجريبي اصطناعي للمراجعة',encode(public.digest(first_source->>'originalText','sha256'),'hex'),'synthetic-reviewer',first_source);
  if not basirah_api.record_reviewed_source_receipt('BR-156QA0000001',2,'source-1',source_receipt->>'snapshotKey','synthetic-reviewer') then raise exception 'source receipt failed';end if;
  source_receipt:=basirah_api.approve_editorial_source('reviewed-15600000000000000000000000000001','qa-156','نص تجريبي اصطناعي للمراجعة',encode(public.digest(first_source->>'originalText','sha256'),'hex'),'synthetic-reviewer',first_source);
  if not exists(select 1 from basirah.passage p join basirah.corpus_snapshot c on c.passage_id=p.id where c.corpus_version='qa-156' and p.snapshot_key=source_receipt->>'snapshotKey') then raise exception 'retrieval visibility failed';end if;
  perform set_config('role',current_setting('session_authorization'),true);
  update basirah.source_edition set approval_status='revoked',revoked_at=clock_timestamp()
    where source_key=source_receipt->>'snapshotKey';
  perform set_config('role','basirah_runtime',true);
  rejected:=false;
  begin
    perform basirah_api.approve_editorial_source('reviewed-15600000000000000000000000000001','qa-156','نص تجريبي اصطناعي للمراجعة',encode(public.digest(first_source->>'originalText','sha256'),'hex'),'synthetic-reviewer',first_source);
  exception when raise_exception then
    if sqlerrm <> 'source identity unavailable' then raise;end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'revoked edition reactivated';end if;
  begin
    update basirah.passage set original_text='mutated' where snapshot_key=source_receipt->>'snapshotKey';
    raise exception 'unexpected write permission';
  exception when insufficient_privilege then null;end;
  if not basirah_api.archive_review_ticket('BR-156QA0000001','synthetic-reviewer',false) then raise exception 'archive failed';end if;
  if basirah_api.lookup_review_ticket('BR-156QA0000001',public.digest('synthetic@example.com','sha256'))->>'found'<>'false' then raise exception 'archive remains public';end if;
  if not basirah_api.archive_review_ticket('BR-156QA0000001','synthetic-reviewer',true) then raise exception 'restore failed';end if;
end
$test$;
reset role;
select 'PASS: direct publication; two immutable versions; stale-write rejection; lookup isolation; outbox version; provider acceptance and delivery receipts; pagination; RAG idempotency and visibility; revoked-source denial; runtime write denial; archive/restore' as receipt;
rollback;
