-- The member row for the current user remains visible so session guards keep working.
create function private.is_active_family_adult(target_family_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.family_members m
    where m.family_id = target_family_id and m.user_id = (select auth.uid())
      and m.status = 'active' and m.role in ('admin', 'member')
  );
$$;
revoke all on function private.is_active_family_adult(uuid) from public, anon;
grant execute on function private.is_active_family_adult(uuid) to authenticated;

drop policy members_family_read on public.family_members;
create policy members_family_read on public.family_members for select to authenticated
using (
  (user_id = (select auth.uid()) and status = 'active')
  or private.is_active_family_adult(family_id)
);

create or replace function public.family_roster()
returns table (member_id uuid, user_id uuid, role text, display_name text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.user_id, m.role, p.display_name, m.created_at
  from public.family_members m join public.profiles p on p.user_id = m.user_id
  where m.status = 'active'
    and ((m.user_id = (select auth.uid()) and private.is_active_family_member(m.family_id))
      or private.is_active_family_adult(m.family_id))
  order by m.created_at;
$$;
revoke all on function public.family_roster() from public, anon;
grant execute on function public.family_roster() to authenticated;
