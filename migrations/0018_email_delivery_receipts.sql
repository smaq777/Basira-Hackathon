begin;
select pg_advisory_xact_lock(hashtext('basirah:migration:0018'));
-- Provider acceptance is not mailbox delivery. No recipient or raw event body
-- is retained here; contact data stays encrypted in the existing ticket.
create table basirah.review_email_delivery (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references basirah.review_ticket(id) on delete cascade,
  notification_id bigint unique references basirah.review_notification_outbox(id) on delete cascade,
  message_id text not null unique check(char_length(message_id) between 1 and 500),
  event text not null default 'accepted' check(event in ('accepted','delivered','deferred','hardBounces','softBounces','blocked','invalid','error')),
  occurred_at timestamptz,
  accepted_at timestamptz not null default clock_timestamp(),
  checked_at timestamptz
);
alter table basirah.review_email_delivery enable row level security;
revoke all on basirah.review_email_delivery from public,basirah_runtime;

create function basirah_api.record_email_receipt(code text,notification bigint,message text)
returns boolean language plpgsql volatile security definer set search_path='' as $function$
declare selected_ticket bigint;
begin
  if message is null or char_length(message) not between 1 and 500 then raise exception 'invalid provider receipt';end if;
  select t.id into selected_ticket from basirah.review_ticket t where t.ticket_code=code
    and (notification is null or exists(select 1 from basirah.review_notification_outbox n where n.id=notification and n.ticket_id=t.id));
  if selected_ticket is null then return false;end if;
  insert into basirah.review_email_delivery(ticket_id,notification_id,message_id) values(selected_ticket,notification,message) on conflict do nothing;
  return exists(select 1 from basirah.review_email_delivery d where d.ticket_id=selected_ticket and d.notification_id is not distinct from notification and d.message_id=message);
end
$function$;
create function basirah_api.pending_email_deliveries(requested_limit integer)
returns table(id bigint,message_id text) language plpgsql volatile security definer set search_path='' as $function$
begin
  if requested_limit is null or requested_limit not between 1 and 20 then raise exception 'invalid delivery limit';end if;
  return query select d.id,d.message_id from basirah.review_email_delivery d
    where d.event in ('accepted','deferred') and d.accepted_at>clock_timestamp()-interval '7 days'
      and (d.checked_at is null or d.checked_at<clock_timestamp()-interval '5 minutes')
    order by d.checked_at nulls first,d.id limit requested_limit;
end
$function$;
create function basirah_api.record_email_delivery(delivery bigint,provider_event text,provider_date timestamptz)
returns boolean language plpgsql volatile security definer set search_path='' as $function$
begin
  if provider_event is null or provider_event not in ('accepted','delivered','deferred','hardBounces','softBounces','blocked','invalid','error')
    or (provider_event<>'accepted' and provider_date is null) then raise exception 'invalid delivery event';end if;
  update basirah.review_email_delivery d set event=provider_event,occurred_at=provider_date,checked_at=clock_timestamp()
    where d.id=delivery and d.event in ('accepted','deferred');
  return found;
end
$function$;
create function basirah_api.ticket_email_deliveries(code text)
returns jsonb language sql stable security definer set search_path='' as $function$
  select coalesce(jsonb_agg(jsonb_build_object('kind',case when d.notification_id is null then 'receipt' else 'review' end,
    'version',r.version,'messageId',d.message_id,'event',d.event,'occurredAt',d.occurred_at,'acceptedAt',d.accepted_at) order by d.id),'[]'::jsonb)
  from basirah.review_email_delivery d join basirah.review_ticket t on t.id=d.ticket_id
    left join basirah.review_notification_outbox n on n.id=d.notification_id
    left join basirah.review_ticket_response r on r.id=n.response_id where t.ticket_code=code
$function$;

-- An expired sending lease has an unknown outcome. Never retry it blindly:
-- the provider may have accepted it just before a worker restart.
create or replace function basirah_api.claim_review_notifications(requested_limit integer default 10)
returns table(notification_id bigint,ticket_code text,contact_ciphertext bytea,response_text text)
language plpgsql volatile security definer set search_path='' as $function$
begin
  if requested_limit is null or requested_limit not between 1 and 20 then raise exception 'invalid notification limit';end if;
  update basirah.review_notification_outbox set status='failed',attempt_count=10,last_error_code='EMAIL_SEND_RESULT_UNKNOWN'
    where status='sending' and claimed_at<clock_timestamp()-interval '10 minutes';
  return query with due as (
    select n.id from basirah.review_notification_outbox n join basirah.review_ticket t on t.id=n.ticket_id
    where n.status in ('pending','failed') and n.next_attempt_at<=clock_timestamp() and n.attempt_count<10
      and t.status<>'closed' and t.notify_opt_in and t.contact_ciphertext is not null
      and not exists(select 1 from basirah.review_email_delivery d where d.notification_id=n.id)
    order by n.next_attempt_at,n.id for update of n skip locked limit requested_limit
  ), claimed as (
    update basirah.review_notification_outbox n set status='sending',claimed_at=clock_timestamp(),attempt_count=n.attempt_count+1
    from due where n.id=due.id returning n.id,n.ticket_id,n.response_id
  ) select c.id,t.ticket_code,t.contact_ciphertext,r.response_text from claimed c
    join basirah.review_ticket t on t.id=c.ticket_id join basirah.review_ticket_response r on r.id=c.response_id;
end
$function$;
create or replace function basirah_api.complete_review_notification(requested_notification_id bigint,was_sent boolean,requested_error_code text default null)
returns boolean language plpgsql volatile security definer set search_path='' as $function$
declare selected_ticket bigint;
begin
  update basirah.review_notification_outbox n set status=case when was_sent then 'sent' else 'failed' end,
    sent_at=case when was_sent then clock_timestamp() else null end,
    attempt_count=case when not was_sent and coalesce(requested_error_code,'EMAIL_SEND_RESULT_UNKNOWN')<>'BREVO_HTTP_429' then 10 else n.attempt_count end,
    next_attempt_at=case when was_sent then n.next_attempt_at else clock_timestamp()+make_interval(mins=>least(60,power(2,least(n.attempt_count,5))::integer)) end,
    last_error_code=case when was_sent then null else left(coalesce(requested_error_code,'EMAIL_SEND_RESULT_UNKNOWN'),120) end
    where n.id=requested_notification_id and n.status='sending' returning n.ticket_id into selected_ticket;
  if selected_ticket is null then return false;end if;
  insert into basirah.review_ticket_event(ticket_id,event_type,safe_metadata) values(selected_ticket,case when was_sent then 'email_sent' else 'email_failed' end,jsonb_build_object('notificationId',requested_notification_id));
  return true;
end
$function$;
revoke all on function basirah_api.record_email_receipt(text,bigint,text),basirah_api.pending_email_deliveries(integer),basirah_api.record_email_delivery(bigint,text,timestamptz),basirah_api.ticket_email_deliveries(text) from public;
grant execute on function basirah_api.record_email_receipt(text,bigint,text),basirah_api.pending_email_deliveries(integer),basirah_api.record_email_delivery(bigint,text,timestamptz),basirah_api.ticket_email_deliveries(text) to basirah_runtime;
insert into basirah_private.schema_migration(version,checksum_sha256) values('0018_email_delivery_receipts','0000000000000000000000000000000000000000000000000000000000000000');
commit;
