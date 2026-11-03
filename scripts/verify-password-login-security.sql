begin;
set local statement_timeout = '30s';
select set_config('test.login_owner', gen_random_uuid()::text, true),
       set_config('test.login_other', gen_random_uuid()::text, true);
insert into auth.users (id, aud, role, raw_user_meta_data)
select current_setting(key)::uuid, 'authenticated', 'authenticated', '{"name":"Temporary login test"}'::jsonb
from unnest(array['test.login_owner', 'test.login_other']) as key;
insert into public.account_logins(user_id,username,is_ready) values
  (current_setting('test.login_owner')::uuid, 'test_' || replace(current_setting('test.login_owner'),'-','')::varchar(24), true),
  (current_setting('test.login_other')::uuid, 'test_' || replace(current_setting('test.login_other'),'-','')::varchar(24), true);
do $$ begin
  if has_table_privilege('anon','public.account_logins','select')
     or not (select relrowsecurity from pg_class where oid='public.account_logins'::regclass) then
    raise exception 'FAIL: anonymous access or missing RLS'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.login_owner'),true);
do $$ begin
  if not exists(select 1 from public.account_logins where user_id=current_setting('test.login_owner')::uuid)
    or exists(select 1 from public.account_logins where user_id=current_setting('test.login_other')::uuid) then
    raise exception 'FAIL: login privacy'; end if;
  begin
    update public.account_logins set username='forbidden_change' where user_id=auth.uid();
    raise exception 'FAIL: direct login update allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.account_logins where user_id=auth.uid();
    raise exception 'FAIL: direct login delete allowed';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'PASS: login privacy, RLS and mutation restrictions';
