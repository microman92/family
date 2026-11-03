-- Called inside a transaction with the local-only ledger migration already loaded.
select set_config('test.fin_admin', gen_random_uuid()::text, true),
       set_config('test.fin_member', gen_random_uuid()::text, true),
       set_config('test.fin_child', gen_random_uuid()::text, true),
       set_config('test.fin_other', gen_random_uuid()::text, true),
       set_config('test.fin_family', gen_random_uuid()::text, true),
       set_config('test.fin_other_family', gen_random_uuid()::text, true),
       set_config('test.fin_shared', gen_random_uuid()::text, true),
       set_config('test.fin_private', gen_random_uuid()::text, true),
       set_config('test.fin_other_tx', gen_random_uuid()::text, true),
       set_config('test.fin_account', gen_random_uuid()::text, true),
       set_config('test.fin_expense', gen_random_uuid()::text, true);
insert into auth.users (id, aud, role, raw_user_meta_data)
select current_setting(key)::uuid, 'authenticated', 'authenticated', '{"name":"Finance isolation test"}'::jsonb
from unnest(array['test.fin_admin','test.fin_member','test.fin_child','test.fin_other']) as key;
insert into public.families (id, name, created_by) values
  (current_setting('test.fin_family')::uuid, 'Finance test', current_setting('test.fin_admin')::uuid),
  (current_setting('test.fin_other_family')::uuid, 'Other finance test', current_setting('test.fin_other')::uuid);
insert into public.family_members (family_id, user_id, role) values
  (current_setting('test.fin_family')::uuid, current_setting('test.fin_admin')::uuid, 'admin'),
  (current_setting('test.fin_family')::uuid, current_setting('test.fin_member')::uuid, 'member'),
  (current_setting('test.fin_family')::uuid, current_setting('test.fin_child')::uuid, 'child'),
  (current_setting('test.fin_other_family')::uuid, current_setting('test.fin_other')::uuid, 'admin');
insert into public.finance_accounts (id, visibility, family_id, name, kind, subtype)
values (current_setting('test.fin_account')::uuid, 'family', current_setting('test.fin_family')::uuid, 'Test cash', 'asset', 'cash'),
       (current_setting('test.fin_expense')::uuid, 'family', current_setting('test.fin_family')::uuid, 'Test expense', 'expense', 'expense_nominal');
insert into public.finance_transactions (id, visibility, family_id, owner_user_id, actor_user_id, type, request_id, occurred_at) values
  (current_setting('test.fin_shared')::uuid, 'family', current_setting('test.fin_family')::uuid, null, current_setting('test.fin_admin')::uuid, 'expense', gen_random_uuid(), now()),
  (current_setting('test.fin_private')::uuid, 'private', null, current_setting('test.fin_admin')::uuid, current_setting('test.fin_admin')::uuid, 'expense', gen_random_uuid(), now()),
  (current_setting('test.fin_other_tx')::uuid, 'family', current_setting('test.fin_other_family')::uuid, null, current_setting('test.fin_other')::uuid, 'expense', gen_random_uuid(), now());
insert into public.ledger_postings (transaction_id, account_id, amount_signed)
values (current_setting('test.fin_shared')::uuid, current_setting('test.fin_account')::uuid, 1);
insert into public.financial_audit (transaction_id, actor_user_id, action)
values (current_setting('test.fin_private')::uuid, current_setting('test.fin_admin')::uuid, 'test');
do $$ begin
  begin
    update public.finance_accounts set kind='expense' where id=current_setting('test.fin_account')::uuid;
    raise exception 'FAIL: account kind changed';
  exception when check_violation then null; end;
  begin
    delete from public.financial_audit where transaction_id=current_setting('test.fin_private')::uuid;
    raise exception 'FAIL: financial audit deleted';
  exception when check_violation then null; end;
  begin
    insert into public.ledger_postings(transaction_id, account_id, amount_signed)
    values (current_setting('test.fin_private')::uuid, current_setting('test.fin_account')::uuid, 1);
    raise exception 'FAIL: private transaction linked to family account';
  exception when check_violation then null; end;
end $$;
set constraints all immediate;
do $$ begin
  begin
    update public.finance_transactions set status='posted' where id=current_setting('test.fin_shared')::uuid;
    raise exception 'FAIL: unbalanced journal was posted';
  exception when check_violation then null; end;
end $$;
insert into public.ledger_postings (transaction_id, account_id, amount_signed)
values (current_setting('test.fin_shared')::uuid, current_setting('test.fin_expense')::uuid, -1);
update public.finance_transactions set status='posted' where id=current_setting('test.fin_shared')::uuid;
do $$ begin
  begin
    update public.finance_transactions set description='Changed' where id=current_setting('test.fin_shared')::uuid;
    raise exception 'FAIL: posted transaction changed';
  exception when check_violation then null; end;
  begin
    delete from public.ledger_postings where transaction_id=current_setting('test.fin_shared')::uuid;
    raise exception 'FAIL: posted entry deleted';
  exception when check_violation then null; end;
  begin
    insert into public.ledger_postings (transaction_id, account_id, amount_signed)
    values (current_setting('test.fin_shared')::uuid, current_setting('test.fin_account')::uuid, 1);
    raise exception 'FAIL: posted entry inserted';
  exception when check_violation then null; end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.fin_member'), true);
do $$ begin
  if (select count(*) from public.finance_transactions) <> 1
     or not exists(select 1 from public.finance_transactions where id=current_setting('test.fin_shared')::uuid)
     or (select count(*) from public.ledger_postings) <> 2
     or exists(select 1 from public.financial_audit) then
    raise exception 'FAIL: family, private or child-table financial isolation'; end if;
  begin
    insert into public.finance_accounts (visibility, family_id, name, kind, subtype)
    values ('family', current_setting('test.fin_family')::uuid, 'Forbidden', 'asset', 'cash');
    raise exception 'FAIL: direct financial write allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.finance_transactions set type='income' where id=current_setting('test.fin_shared')::uuid;
    raise exception 'FAIL: direct financial update allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.ledger_postings where transaction_id=current_setting('test.fin_shared')::uuid;
    raise exception 'FAIL: direct posting deletion allowed';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', current_setting('test.fin_child'), true);
do $$ begin
  if exists(select 1 from public.finance_transactions) or exists(select 1 from public.ledger_postings) then
    raise exception 'FAIL: child can access family finance'; end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('test.fin_other'), true);
do $$ begin
  if (select count(*) from public.finance_transactions) <> 1
     or exists(select 1 from public.ledger_postings) then
    raise exception 'FAIL: cross-family financial access'; end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('test.fin_admin'), true);
do $$ begin
  if (select count(*) from public.finance_transactions) <> 2
     or (select count(*) from public.financial_audit) <> 1 then
    raise exception 'FAIL: finance owner access'; end if;
end $$;
reset role;
update public.family_members set status='removed' where user_id=current_setting('test.fin_member')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.fin_member'), true);
do $$ begin
  if exists(select 1 from public.finance_transactions) or exists(select 1 from public.ledger_postings) then
    raise exception 'FAIL: removed member retains finance access'; end if;
end $$;
reset role;
select 'PASS: local finance read-only RLS foundation';
