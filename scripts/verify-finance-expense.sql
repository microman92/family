set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.fin_admin'),true);
select set_config('test.cash',public.ensure_finance_accounts('family',current_setting('test.fin_family')::uuid)::text,true);
select set_config('test.private_cash',public.ensure_finance_accounts('private')::text,true);
select set_config('test.expense_request',gen_random_uuid()::text,true);
reset role;
do $$ declare opening_id uuid; equity_id uuid; begin
  select id into equity_id from public.finance_accounts where family_id=current_setting('test.fin_family')::uuid and is_system and subtype='opening';
  insert into public.finance_transactions(visibility,family_id,actor_user_id,type,request_id,occurred_at)
    values('family',current_setting('test.fin_family')::uuid,current_setting('test.fin_admin')::uuid,'opening',gen_random_uuid(),now()) returning id into opening_id;
  insert into public.ledger_postings(transaction_id,account_id,amount_signed)
    values(opening_id,current_setting('test.cash')::uuid,100000),(opening_id,equity_id,-100000);
  update public.finance_transactions set status='posted' where id=opening_id;
end $$;
set local role authenticated;
select set_config('test.expense_id',public.post_finance_expense(current_setting('test.cash')::uuid,'30000',current_setting('test.expense_request')::uuid,'2026-11-03T10:00:00Z')::text,true);
do $$ declare result uuid; begin
  result:=public.post_finance_expense(current_setting('test.cash')::uuid,'30000',current_setting('test.expense_request')::uuid,'2026-11-03T10:00:00Z');
  if result<>current_setting('test.expense_id')::uuid then raise exception 'FAIL: duplicate expense'; end if;
  if (select sum(amount_signed) from public.ledger_postings where account_id=current_setting('test.cash')::uuid)<>70000 then raise exception 'FAIL: incorrect balance'; end if;
  if (select count(*) from public.ledger_postings where transaction_id=result)<>2 then raise exception 'FAIL: incorrect posting count'; end if;
  begin
    perform public.post_finance_expense(current_setting('test.cash')::uuid,'30001',current_setting('test.expense_request')::uuid,'2026-11-03T10:00:00Z');
    raise exception 'FAIL: changed idempotent request';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.post_finance_expense(current_setting('test.cash')::uuid,'80000',gen_random_uuid(),'2026-11-03T10:00:00Z');
    raise exception 'FAIL: negative balance allowed';
  exception when invalid_parameter_value then null; end;
  if (select count(*) from public.finance_transactions where type='expense' and status='posted' and family_id=current_setting('test.fin_family')::uuid)<>2 then
    -- One pre-existing fixture and one expense created by the RPC.
    raise exception 'FAIL: failed expense left a transaction'; end if;
end $$;
reset role;
create function private.test_fail_financial_audit() returns trigger language plpgsql as $$
begin raise exception 'Injected audit failure' using errcode='22023'; end; $$;
create trigger test_fail_financial_audit before insert on public.financial_audit
for each row execute function private.test_fail_financial_audit();
set local role authenticated;
select set_config('test.failed_request',gen_random_uuid()::text,true);
do $$ begin
  begin
    perform public.post_finance_expense(current_setting('test.cash')::uuid,'1000',current_setting('test.failed_request')::uuid,'2026-11-03T10:00:00Z');
    raise exception 'FAIL: injected failure ignored';
  exception when invalid_parameter_value then null; end;
  if exists(select 1 from public.finance_transactions where request_id=current_setting('test.failed_request')::uuid) then
    raise exception 'FAIL: partial transaction survived audit error'; end if;
  if (select sum(amount_signed) from public.ledger_postings where account_id=current_setting('test.cash')::uuid)<>70000 then
    raise exception 'FAIL: failed expense changed balance'; end if;
end $$;
reset role;
drop trigger test_fail_financial_audit on public.financial_audit;
drop function private.test_fail_financial_audit();
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.fin_other'),true);
do $$ begin
  begin
    perform public.post_finance_expense(current_setting('test.cash')::uuid,'1',gen_random_uuid(),now());
    raise exception 'FAIL: outsider spent family money';
  exception when insufficient_privilege then null; end;
  begin
    perform public.post_finance_expense(current_setting('test.private_cash')::uuid,'1',gen_random_uuid(),now());
    raise exception 'FAIL: outsider spent private money';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: expense atomic posting, balance, retry and access';
