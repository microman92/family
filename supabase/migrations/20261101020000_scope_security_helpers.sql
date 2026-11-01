-- Reusable predicates for future scoped tables. They do not grant access on their own.
create function private.scope_is_valid(visibility text, family_id uuid, owner_user_id uuid)
returns boolean language sql immutable set search_path = ''
as $$
  select case visibility
    when 'family' then family_id is not null and owner_user_id is null
    when 'private' then family_id is null and owner_user_id is not null
    else false
  end;
$$;

create function private.same_scope(left_visibility text, left_family_id uuid, left_owner_user_id uuid,
                                   right_visibility text, right_family_id uuid, right_owner_user_id uuid)
returns boolean language sql immutable set search_path = ''
as $$
  select private.scope_is_valid(left_visibility, left_family_id, left_owner_user_id)
    and private.scope_is_valid(right_visibility, right_family_id, right_owner_user_id)
    and case left_visibility
      when 'family' then right_visibility = 'family' and left_family_id = right_family_id
      when 'private' then right_visibility = 'private' and left_owner_user_id = right_owner_user_id
      else false
    end;
$$;

-- A membership test is not a capability test: finance and other module policies need both.
create function private.can_access_scope(visibility text, family_id uuid, owner_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select auth.uid()) is not null
    and private.scope_is_valid(visibility, family_id, owner_user_id)
    and case visibility
      when 'family' then private.is_active_family_member(family_id)
      when 'private' then owner_user_id = (select auth.uid())
      else false
    end, false);
$$;

create function private.has_family_capability(target_family_id uuid, capability text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.family_members m
    where m.family_id = target_family_id and m.user_id = (select auth.uid()) and m.status = 'active'
      and case capability
        when 'members.read' then m.role in ('admin', 'member')
        when 'family.manage' then m.role = 'admin'
        when 'finance.read' then m.role in ('admin', 'member')
        when 'finance.write' then m.role in ('admin', 'member')
        else false
      end
  );
$$;

create function private.prevent_scope_change()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.visibility is distinct from new.visibility
     or old.family_id is distinct from new.family_id
     or old.owner_user_id is distinct from new.owner_user_id then
    raise exception 'Record scope cannot be changed' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.scope_is_valid(text, uuid, uuid) from public, anon;
revoke all on function private.same_scope(text, uuid, uuid, text, uuid, uuid) from public, anon;
revoke all on function private.can_access_scope(text, uuid, uuid) from public, anon;
revoke all on function private.has_family_capability(uuid, text) from public, anon;
revoke all on function private.prevent_scope_change() from public, anon, authenticated;
grant execute on function private.scope_is_valid(text, uuid, uuid) to authenticated, service_role;
grant execute on function private.same_scope(text, uuid, uuid, text, uuid, uuid) to authenticated, service_role;
grant execute on function private.can_access_scope(text, uuid, uuid) to authenticated, service_role;
grant execute on function private.has_family_capability(uuid, text) to authenticated, service_role;
