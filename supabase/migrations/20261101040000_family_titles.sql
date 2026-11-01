-- Titles describe a person's place in the family; authorization remains in role.
alter table public.family_members add column title text;
alter table public.family_members add constraint family_member_title_matches_role check (
  title is null or (role in ('admin', 'member') and title in ('king', 'queen'))
  or (role = 'child' and title in ('prince', 'princess'))
);
alter table public.member_profiles add column title text;
alter table public.member_profiles add constraint member_profile_child_title check (
  title is null or title in ('prince', 'princess')
);

-- A promotion or change to child must not leave an incompatible title.
create function private.clear_incompatible_family_title()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.title is not null and ((new.role = 'child' and new.title not in ('prince', 'princess'))
     or (new.role in ('admin', 'member') and new.title not in ('king', 'queen'))) then
    new.title := null;
  end if;
  return new;
end;
$$;
revoke all on function private.clear_incompatible_family_title() from public, anon, authenticated;
create trigger clear_incompatible_family_title before update of role on public.family_members
for each row execute function private.clear_incompatible_family_title();

create function public.set_family_title(target_id uuid, target_type text, new_title text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target_family uuid; target_role text;
begin
  if actor is null or target_id is null or target_type is null
    or new_title is null or new_title not in ('king', 'queen', 'prince', 'princess', 'none') then
    raise exception 'Invalid title' using errcode = '22023';
  end if;
  if target_type = 'member' then
    select family_id, role into target_family, target_role from public.family_members
      where id = target_id and status = 'active';
  elsif target_type = 'child_profile' then
    select family_id, 'child' into target_family, target_role from public.member_profiles
      where id = target_id and linked_member_id is null;
  else raise exception 'Invalid title' using errcode = '22023';
  end if;
  if target_family is null or not private.has_family_capability(target_family, 'family.manage') then
    raise exception 'Member unavailable' using errcode = '42501';
  end if;
  if new_title <> 'none' and ((target_role = 'child' and new_title not in ('prince', 'princess'))
      or (target_role in ('admin', 'member') and new_title not in ('king', 'queen'))) then
    raise exception 'Invalid title' using errcode = '22023';
  end if;
  if target_type = 'member' then
    update public.family_members set title = nullif(new_title, 'none') where id = target_id and status = 'active';
  else
    update public.member_profiles set title = nullif(new_title, 'none') where id = target_id and linked_member_id is null;
  end if;
  if not found then raise exception 'Member unavailable' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.set_family_title(uuid, text, text) from public, anon;
grant execute on function public.set_family_title(uuid, text, text) to authenticated;
