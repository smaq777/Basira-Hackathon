begin;
do $test$
declare
  sid bigint;doc bigint;rev bigint;tid bigint;off_tid bigint;nid bigint;notice record;
  body jsonb;receipt jsonb;count_before integer;seen integer:=0;
begin
  insert into basirah.guest_session(ownership_secret_hash,expires_at)
    values(public.digest('synthetic-ticket-events','sha256'),clock_timestamp()+interval '1 hour') returning id into sid;
  insert into basirah.document(session_id) values(sid) returning id into doc;
  insert into basirah.document_revision(document_id,version,original_text,content_hash)
    values(doc,1,'نص اصطناعي',public.digest('نص اصطناعي','sha256')) returning id into rev;
  insert into basirah.review_ticket(ticket_code,revision_id,email_lookup_hash,contact_ciphertext,notify_opt_in)
    values('BR-202QA0000001',rev,public.digest('synthetic@example.com','sha256'),decode('0001','hex'),true) returning id into tid;
  insert into basirah.document_revision(document_id,version,original_text,content_hash)
    values(doc,2,'نص اصطناعي ثان',public.digest('نص اصطناعي ثان','sha256')) returning id into rev;
  insert into basirah.review_ticket(ticket_code,revision_id,notify_opt_in)
    values('BR-202QA0000002',rev,false) returning id into off_tid;
  body:='{"schemaVersion":1,"summary":"Published summary","records":[],"evidence":[{"id":"source-1"}]}'::jsonb;
  perform set_config('role','basirah_runtime',true);
  -- Draft updates notify progress, but never return draft notes/report to mail.
  perform basirah_api.save_review_ticket_response('BR-202QA0000001','test-reviewer','needs_context','PRIVATE DRAFT',false);
  perform set_config('role',current_setting('session_authorization'),true);
  select count(*) into count_before from basirah.review_notification_outbox where ticket_id=tid;
  if count_before<>1 then raise exception 'draft event not queued';end if;
  perform set_config('role','basirah_runtime',true);
  if exists(select 1 from basirah_api.claim_editorial_notifications(10)) then raise exception 'legacy worker claimed generic event';end if;
  receipt:=basirah_api.save_editorial_review('BR-202QA0000001','test-reviewer','bounded_revision','Published note 1',true,1,body);
  receipt:=basirah_api.save_editorial_review('BR-202QA0000001','test-reviewer','bounded_revision','Published note 2',true,2,body||'{"summary":"Published summary 2"}'::jsonb);
  perform basirah_api.record_reviewed_source_receipt('BR-202QA0000001',3,'source-1','reviewed-20200000000000000000000000000001','test-reviewer');
  perform basirah_api.record_reviewed_source_receipt('BR-202QA0000001',3,'source-1','reviewed-20200000000000000000000000000001','test-reviewer');
  perform basirah_api.archive_review_ticket('BR-202QA0000001','test-reviewer',false);
  perform basirah_api.archive_review_ticket('BR-202QA0000001','test-reviewer',false);
  -- No-consent publication/closure produce no jobs.
  perform basirah_api.save_review_ticket_response('BR-202QA0000002','test-reviewer','returned','No consent',true);
  perform basirah_api.archive_review_ticket('BR-202QA0000002','test-reviewer',false);
  perform set_config('role',current_setting('session_authorization'),true);
  if exists(select 1 from basirah.review_notification_outbox where ticket_id=off_tid) then raise exception 'opted-out email queued';end if;
  if (select count(*) from basirah.review_notification_outbox where ticket_id=tid)<>5 then raise exception 'missing or duplicate jobs';end if;
  perform set_config('role','basirah_runtime',true);
  -- All pending communication remains claimable after closure.
  for notice in select * from basirah_api.claim_ticket_notifications(10) loop
    seen:=seen+1;
    if notice.notification_key is null then raise exception 'durable UUID missing';end if;
    if notice.ticket_code<>'BR-202QA0000001' then raise exception 'wrong ticket claimed';end if;
    if notice.event_type<>'published' and (notice.response_text<>'' or notice.editorial is not null) then raise exception 'draft/private payload leaked';end if;
    if notice.event_type='published' and notice.response_version=2 and (notice.response_text<>'Published note 1' or notice.editorial->>'summary'<>'Published summary') then raise exception 'version 2 mismatch';end if;
    if notice.event_type='published' and notice.response_version=3 and (notice.response_text<>'Published note 2' or notice.editorial->>'summary'<>'Published summary 2') then raise exception 'version 3 mismatch';end if;
    if not basirah_api.record_email_receipt(notice.ticket_code,notice.notification_id,'<synthetic-'||notice.notification_id||'@example.com>') then raise exception 'acceptance receipt failed';end if;
    perform basirah_api.complete_review_notification(notice.notification_id,true,null);
  end loop;
  if seen<>5 then raise exception 'closed-ticket notices lost';end if;
  if exists(select 1 from basirah_api.claim_ticket_notifications(10)) then raise exception 'resent accepted mail or audit loop';end if;
  if not exists(select 1 from jsonb_array_elements(basirah_api.ticket_email_deliveries('BR-202QA0000001')) d where d->>'kind'='update' and d->>'event'='accepted') then raise exception 'update acceptance readback missing';end if;
  perform basirah_api.archive_review_ticket('BR-202QA0000001','test-reviewer',true);
  perform basirah_api.archive_review_ticket('BR-202QA0000001','test-reviewer',true);
  select notification_id into nid from basirah_api.claim_ticket_notifications(10) where event_type='restored';
  if nid is null then raise exception 'reopen notice missing';end if;
  -- Ambiguous send is terminal; a persisted receipt also prevents a resend.
  perform basirah_api.complete_review_notification(nid,false,'EMAIL_SEND_RESULT_UNKNOWN');
  if exists(select 1 from basirah_api.claim_ticket_notifications(10)) then raise exception 'unknown delivery resent';end if;
  perform set_config('role',current_setting('session_authorization'),true);
  if (select count(*) from basirah.review_notification_outbox where ticket_id=tid)<>6 then raise exception 'duplicate reopen or mail audit loop';end if;
  -- Revoke consent after queueing: jobs must remain unclaimed.
  insert into basirah.review_ticket_event(ticket_id,event_type) values(tid,'draft_saved');
  update basirah.review_ticket set notify_opt_in=false where id=tid;
  perform set_config('role','basirah_runtime',true);
  if exists(select 1 from basirah_api.claim_ticket_notifications(10)) then raise exception 'revoked consent ignored';end if;
  begin
    insert into basirah.review_notification_outbox(ticket_id,event_id) values(tid,1);
    raise exception 'unexpected direct runtime write';
  exception when insufficient_privilege then null;end;
end
$test$;
select 'PASS: ticket event communications, exact versions, consent, closure/reopen, no draft disclosure, no audit loops, no blind resend and runtime isolation';
rollback;
