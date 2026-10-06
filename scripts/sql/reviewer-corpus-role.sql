-- Owner-only provisioning. The caller supplies these transaction-local settings
-- as parameters, never as command-line credentials or committed configuration.
-- This adds a new isolated capability; it never changes an existing reader role.
do $provision$
declare
  curator text := current_setting('basirah.curator_role',true);
  credential text := current_setting('basirah.curator_password',true);
  existing record;
begin
  if curator is null or curator !~ '^basirah_(reviewer_curator|qa_curator_156|reviewer_curator_193|qa_curator_193_[a-f0-9]{8})$'
    or credential is null or char_length(credential)<32 then
    raise exception 'explicit curator provisioning required';
  end if;
  select * into existing from pg_roles where rolname=curator;
  if found then
    -- Do not silently rotate a credential or strip another role's permissions.
    raise exception 'curator role already exists; inspect and reuse its credential';
  end if;
  execute format('create role %I login nosuperuser nocreatedb nocreaterole noinherit nobypassrls password %L',curator,credential);
  execute format('grant usage on schema basirah_api to %I',curator);
  execute format('grant execute on function basirah_api.approve_editorial_source(text,text,text,text,text,jsonb) to %I',curator);
end
$provision$;
