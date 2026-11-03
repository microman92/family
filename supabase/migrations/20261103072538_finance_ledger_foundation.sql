-- Read-only foundation: writing financial facts is intentionally unavailable until
-- an atomic posting function and its security/invariant tests are implemented.
create table public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  visibility text not null,
  family_id uuid references public.families(id) on delete restrict,
  owner_user_id uuid references auth.users(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 100),
  kind text not null check (kind in ('asset', 'liability', 'equity', 'income', 'expense')),
  subtype text not null check (char_length(trim(subtype)) between 1 and 40),
  currency text not null default 'UZS' check (currency = 'UZS'),
  is_system boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  check (private.scope_is_valid(visibility, family_id, owner_user_id))
);
create index finance_accounts_family_idx on public.finance_accounts(family_id);
create index finance_accounts_owner_idx on public.finance_accounts(owner_user_id);

create table public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  visibility text not null,
  family_id uuid references public.families(id) on delete restrict,
  owner_user_id uuid references auth.users(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 100),
  type text not null check (type in ('income', 'expense')),
  nominal_account_id uuid references public.finance_accounts(id) on delete restrict,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  check (private.scope_is_valid(visibility, family_id, owner_user_id))
);
create index finance_categories_family_idx on public.finance_categories(family_id);
create index finance_categories_owner_idx on public.finance_categories(owner_user_id);

create table public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  visibility text not null,
  family_id uuid references public.families(id) on delete restrict,
  owner_user_id uuid references auth.users(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  type text not null check (type in ('opening', 'income', 'expense', 'transfer', 'reversal')),
  status text not null default 'draft' check (status in ('draft', 'posted')),
  category_id uuid references public.finance_categories(id) on delete restrict,
  request_id uuid not null,
  occurred_at timestamptz not null,
  description text check (char_length(description) <= 2000),
  created_at timestamptz not null default now(),
  check (private.scope_is_valid(visibility, family_id, owner_user_id))
);
create index finance_transactions_family_idx on public.finance_transactions(family_id, occurred_at);
create index finance_transactions_owner_idx on public.finance_transactions(owner_user_id, occurred_at);
create unique index finance_transactions_family_request_idx on public.finance_transactions(family_id, request_id) where visibility = 'family';
create unique index finance_transactions_private_request_idx on public.finance_transactions(owner_user_id, request_id) where visibility = 'private';

create table public.ledger_postings (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.finance_transactions(id) on delete restrict,
  account_id uuid not null references public.finance_accounts(id) on delete restrict,
  amount_signed bigint not null check (amount_signed <> 0),
  created_at timestamptz not null default now()
);
create index ledger_postings_transaction_idx on public.ledger_postings(transaction_id);
create index ledger_postings_account_idx on public.ledger_postings(account_id);

create table public.financial_audit (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.finance_transactions(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (char_length(trim(action)) between 1 and 80),
  reason text check (char_length(reason) <= 2000),
  created_at timestamptz not null default now()
);
create index financial_audit_transaction_idx on public.financial_audit(transaction_id);
create trigger finance_account_scope before update on public.finance_accounts
for each row execute function private.prevent_scope_change();
create trigger finance_category_immutable_scope before update on public.finance_categories
for each row execute function private.prevent_scope_change();
create trigger finance_transaction_immutable_scope before update on public.finance_transactions
for each row execute function private.prevent_scope_change();

create function private.prevent_finance_account_kind_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.kind is distinct from new.kind or old.currency is distinct from new.currency then
    raise exception 'Account kind and currency cannot be changed' using errcode = '23514';
  end if;
  return new;
end; $$;
create trigger finance_account_kind before update on public.finance_accounts
for each row execute function private.prevent_finance_account_kind_change();

create function private.prevent_financial_audit_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Financial audit is append-only' using errcode = '23514';
end; $$;
create trigger financial_audit_immutable before update or delete on public.financial_audit
for each row execute function private.prevent_financial_audit_change();
revoke all on function private.prevent_finance_account_kind_change() from public, anon, authenticated;
revoke all on function private.prevent_financial_audit_change() from public, anon, authenticated;

-- Linked records must share the same family or private owner even for trusted writers.
create function private.check_finance_category_scope() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.nominal_account_id is not null and not exists (
    select 1 from public.finance_accounts a where a.id = new.nominal_account_id
      and a.kind = new.type
      and private.same_scope(new.visibility, new.family_id, new.owner_user_id,
                             a.visibility, a.family_id, a.owner_user_id)
  ) then raise exception 'Invalid category account scope or kind' using errcode = '23514'; end if;
  return new;
end; $$;
create trigger finance_category_scope before insert or update on public.finance_categories
for each row execute function private.check_finance_category_scope();

create function private.check_finance_transaction_scope() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.finance_categories c where c.id = new.category_id
      and c.type = new.type
      and private.same_scope(new.visibility, new.family_id, new.owner_user_id,
                             c.visibility, c.family_id, c.owner_user_id)
  ) then raise exception 'Invalid transaction category scope or kind' using errcode = '23514'; end if;
  return new;
end; $$;
create trigger finance_transaction_scope before insert or update on public.finance_transactions
for each row execute function private.check_finance_transaction_scope();

create function private.check_posting_scope() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.finance_transactions t join public.finance_accounts a on a.id = new.account_id
    where t.id = new.transaction_id and a.currency = 'UZS'
      and private.same_scope(t.visibility, t.family_id, t.owner_user_id,
                             a.visibility, a.family_id, a.owner_user_id)
  ) then raise exception 'Invalid posting scope' using errcode = '23514'; end if;
  return new;
end; $$;
create trigger ledger_posting_scope before insert or update on public.ledger_postings
for each row execute function private.check_posting_scope();
revoke all on function private.check_finance_category_scope() from public, anon, authenticated;
revoke all on function private.check_finance_transaction_scope() from public, anon, authenticated;
revoke all on function private.check_posting_scope() from public, anon, authenticated;

-- Financial facts are assembled as drafts, then validated when the transaction commits.
create function private.prevent_posted_transaction_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'posted' then
    raise exception 'Posted transactions are immutable' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
create trigger finance_transaction_immutable before update or delete on public.finance_transactions
for each row execute function private.prevent_posted_transaction_change();

create function private.prevent_posted_posting_change() returns trigger
language plpgsql set search_path = '' as $$
declare target_transaction uuid; target_status text;
begin
  target_transaction := case when tg_op = 'INSERT' then new.transaction_id else old.transaction_id end;
  select t.status into target_status from public.finance_transactions t
    where t.id = target_transaction for update;
  if target_status = 'posted' then
    raise exception 'Posted entries are immutable' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.transaction_id is distinct from old.transaction_id then
    raise exception 'Posting transaction cannot be changed' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
create trigger ledger_posting_immutable before insert or update or delete on public.ledger_postings
for each row execute function private.prevent_posted_posting_change();

create function private.check_posted_balance() returns trigger
language plpgsql set search_path = '' as $$
declare posting_count bigint; account_count bigint; posting_sum numeric;
begin
  if exists(select 1 from public.finance_transactions t where t.id = new.id and t.status = 'posted') then
    select count(*), count(distinct account_id), coalesce(sum(amount_signed), 0)
      into posting_count, account_count, posting_sum
      from public.ledger_postings where transaction_id = new.id;
    if posting_count < 2 or account_count < 2 or posting_sum <> 0 then
      raise exception 'Posted transactions require balanced entries on distinct accounts' using errcode = '23514';
    end if;
  end if;
  return null;
end; $$;
create constraint trigger finance_transaction_balance after insert or update on public.finance_transactions
deferrable initially deferred for each row execute function private.check_posted_balance();
revoke all on function private.prevent_posted_transaction_change() from public, anon, authenticated;
revoke all on function private.prevent_posted_posting_change() from public, anon, authenticated;
revoke all on function private.check_posted_balance() from public, anon, authenticated;

create function private.can_read_finance(visibility text, family_id uuid, owner_user_id uuid)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select private.can_access_scope(visibility, family_id, owner_user_id)
    and (visibility = 'private' or private.has_family_capability(family_id, 'finance.read'));
$$;
revoke all on function private.can_read_finance(text, uuid, uuid) from public, anon;
grant execute on function private.can_read_finance(text, uuid, uuid) to authenticated, service_role;

alter table public.finance_accounts enable row level security;
alter table public.finance_categories enable row level security;
alter table public.finance_transactions enable row level security;
alter table public.ledger_postings enable row level security;
alter table public.financial_audit enable row level security;
revoke all on public.finance_accounts, public.finance_categories, public.finance_transactions, public.ledger_postings, public.financial_audit from public, anon, authenticated;
grant select on public.finance_accounts, public.finance_categories, public.finance_transactions, public.ledger_postings, public.financial_audit to authenticated;
create policy finance_accounts_read on public.finance_accounts for select to authenticated using (private.can_read_finance(visibility, family_id, owner_user_id));
create policy finance_categories_read on public.finance_categories for select to authenticated using (private.can_read_finance(visibility, family_id, owner_user_id));
create policy finance_transactions_read on public.finance_transactions for select to authenticated using (private.can_read_finance(visibility, family_id, owner_user_id));
create policy ledger_postings_read on public.ledger_postings for select to authenticated using (exists (select 1 from public.finance_transactions t where t.id = transaction_id));
create policy financial_audit_read on public.financial_audit for select to authenticated using (exists (select 1 from public.finance_transactions t where t.id = transaction_id));
