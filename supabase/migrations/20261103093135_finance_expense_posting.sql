create unique index finance_system_family_idx on public.finance_accounts(family_id, subtype) where is_system and visibility='family';
create unique index finance_system_private_idx on public.finance_accounts(owner_user_id, subtype) where is_system and visibility='private';

create function private.ensure_finance_accounts(target_visibility text, target_family uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid()); owner_id uuid; cash_id uuid;
begin
  if actor is null or target_visibility not in ('family','private') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  if target_visibility='family' then
    if target_family is null or not private.has_family_capability(target_family,'finance.write') then
      raise exception 'Access denied' using errcode='42501'; end if;
  else
    if target_family is not null then raise exception 'Invalid scope' using errcode='22023'; end if;
    owner_id := actor;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('finance-scope:' || coalesce(target_family,owner_id)::text,0));
  insert into public.finance_accounts(visibility,family_id,owner_user_id,name,kind,subtype,is_system)
    select target_visibility,target_family,owner_id,v.name,v.kind,v.subtype,true
    from (values ('Наличные','asset','cash'),('Начальные остатки','equity','opening'),
                 ('Доходы','income','income_nominal'),('Расходы','expense','expense_nominal'),
                 ('К оплате','liability','payable')) as v(name,kind,subtype)
    on conflict do nothing;
  select id into cash_id from public.finance_accounts
    where visibility=target_visibility and family_id is not distinct from target_family
      and owner_user_id is not distinct from owner_id and is_system and subtype='cash';
  return cash_id;
end; $$;
revoke all on function private.ensure_finance_accounts(text,uuid) from public,anon,authenticated;
grant execute on function private.ensure_finance_accounts(text,uuid) to authenticated;
create function public.ensure_finance_accounts(target_visibility text, target_family uuid default null)
returns uuid language sql security invoker set search_path='' as $$
  select private.ensure_finance_accounts(target_visibility,target_family);
$$;
revoke all on function public.ensure_finance_accounts(text,uuid) from public,anon;
grant execute on function public.ensure_finance_accounts(text,uuid) to authenticated;

create function private.post_finance_expense(cash_account uuid, amount_uzs text, request_key uuid,
  happened_at timestamptz, expense_category uuid default null, note text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid()); cash public.finance_accounts; amount bigint;
  transaction_row public.finance_transactions; expense_id uuid; transaction_id uuid; balance numeric;
begin
  if actor is null then raise exception 'Access denied' using errcode='42501'; end if;
  if amount_uzs is null or char_length(amount_uzs)>19 or amount_uzs !~ '^[1-9][0-9]*$'
     or request_key is null or happened_at is null or not isfinite(happened_at)
     or char_length(note)>2000 then raise exception 'Invalid expense' using errcode='22023'; end if;
  amount := amount_uzs::bigint;
  select * into cash from public.finance_accounts where id=cash_account;
  if not found or cash.kind<>'asset' or cash.archived_at is not null
     or not private.can_read_finance(cash.visibility,cash.family_id,cash.owner_user_id) then
    raise exception 'Access denied' using errcode='42501'; end if;
  if cash.visibility='family' and not private.has_family_capability(cash.family_id,'finance.write') then
    raise exception 'Access denied' using errcode='42501'; end if;
  perform private.ensure_finance_accounts(cash.visibility,cash.family_id);
  select * into cash from public.finance_accounts where id=cash_account for update;
  if not private.can_read_finance(cash.visibility,cash.family_id,cash.owner_user_id)
     or (cash.visibility='family' and not private.has_family_capability(cash.family_id,'finance.write')) then
    raise exception 'Access denied' using errcode='42501'; end if;
  if cash.archived_at is not null then raise exception 'Account archived' using errcode='22023'; end if;
  select * into transaction_row from public.finance_transactions
    where request_id=request_key and visibility=cash.visibility
      and family_id is not distinct from cash.family_id and owner_user_id is not distinct from cash.owner_user_id;
  if found then
    if transaction_row.type<>'expense' or transaction_row.status<>'posted' or transaction_row.actor_user_id<>actor
      or transaction_row.occurred_at<>happened_at or transaction_row.category_id is distinct from expense_category
      or transaction_row.description is distinct from note
      or not exists(select 1 from public.ledger_postings p where p.transaction_id=transaction_row.id and p.account_id=cash_account and p.amount_signed=-amount)
    then raise exception 'Request key reused with different expense' using errcode='22023'; end if;
    return transaction_row.id;
  end if;
  if expense_category is null then
    select id into expense_id from public.finance_accounts where visibility=cash.visibility
      and family_id is not distinct from cash.family_id and owner_user_id is not distinct from cash.owner_user_id
      and is_system and subtype='expense_nominal' and archived_at is null;
  else
    select c.nominal_account_id into expense_id from public.finance_categories c
      join public.finance_accounts a on a.id=c.nominal_account_id
      where c.id=expense_category and c.type='expense' and c.archived_at is null and a.archived_at is null
        and a.kind='expense' and private.same_scope(c.visibility,c.family_id,c.owner_user_id,cash.visibility,cash.family_id,cash.owner_user_id);
    if expense_id is null then raise exception 'Invalid expense category' using errcode='22023'; end if;
  end if;
  if expense_id is null then raise exception 'Expense account unavailable' using errcode='22023'; end if;
  select coalesce(sum(p.amount_signed),0) into balance from public.ledger_postings p
    join public.finance_transactions t on t.id=p.transaction_id
    where p.account_id=cash_account and t.status='posted';
  if balance<amount then raise exception 'Insufficient funds' using errcode='22023'; end if;
  insert into public.finance_transactions(visibility,family_id,owner_user_id,actor_user_id,type,request_id,occurred_at,description,category_id)
    values(cash.visibility,cash.family_id,cash.owner_user_id,actor,'expense',request_key,happened_at,note,expense_category)
    returning id into transaction_id;
  insert into public.ledger_postings(transaction_id,account_id,amount_signed)
    values(transaction_id,expense_id,amount),(transaction_id,cash_account,-amount);
  insert into public.financial_audit(transaction_id,actor_user_id,action) values(transaction_id,actor,'posted');
  update public.finance_transactions set status='posted' where id=transaction_id;
  return transaction_id;
end; $$;
revoke all on function private.post_finance_expense(uuid,text,uuid,timestamptz,uuid,text) from public,anon,authenticated;
grant execute on function private.post_finance_expense(uuid,text,uuid,timestamptz,uuid,text) to authenticated;
create function public.post_finance_expense(cash_account uuid, amount_uzs text, request_key uuid,
  happened_at timestamptz, expense_category uuid default null, note text default null)
returns uuid language sql security invoker set search_path='' as $$
  select private.post_finance_expense(cash_account,amount_uzs,request_key,happened_at,expense_category,note);
$$;
revoke all on function public.post_finance_expense(uuid,text,uuid,timestamptz,uuid,text) from public,anon;
grant execute on function public.post_finance_expense(uuid,text,uuid,timestamptz,uuid,text) to authenticated;
