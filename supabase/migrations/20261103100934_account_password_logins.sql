create table public.account_logins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z][a-z0-9_]{3,31}$'),
  is_ready boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.account_logins enable row level security;
revoke all on public.account_logins from public, anon, authenticated;
grant select on public.account_logins to authenticated;
grant select, insert, update, delete on public.account_logins to service_role;
create policy account_login_self_read on public.account_logins for select to authenticated
using (user_id = (select auth.uid()));
