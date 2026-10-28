-- Phase 2 foundation. All access is denied unless explicitly granted below.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 100),
  timezone text not null default 'Asia/Tashkent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  timezone text not null default 'Asia/Tashkent',
  currency text not null default 'UZS' check (currency = 'UZS'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('admin', 'member', 'child')),
  status text not null default 'active' check (status in ('active', 'removed')),
  created_at timestamptz not null default now(),
  unique (family_id, user_id)
);
create unique index family_members_one_active_family on public.family_members(user_id) where status = 'active';
create index family_members_family_idx on public.family_members(family_id);

create table public.member_profiles (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 100),
  linked_member_id uuid references public.family_members(id),
  created_at timestamptz not null default now()
);

create index member_profiles_family_idx on public.member_profiles(family_id);

create table public.family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  token_hash bytea not null unique,
  role text not null check (role in ('member', 'child')),
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check ((accepted_at is null) = (accepted_by is null))
);

create function private.is_active_family_member(target_family_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.family_members m
    where m.family_id = target_family_id and m.user_id = (select auth.uid()) and m.status = 'active'
  );
$$;
revoke all on function private.is_active_family_member(uuid) from public, anon;
grant execute on function private.is_active_family_member(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.member_profiles enable row level security;
alter table public.family_invites enable row level security;

revoke all on public.profiles, public.families, public.family_members, public.member_profiles, public.family_invites from public, anon, authenticated;
grant select on public.profiles, public.families, public.family_members, public.member_profiles to authenticated;
grant update (display_name, timezone) on public.profiles to authenticated;
create policy profiles_self_read on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy profiles_self_update on public.profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy families_member_read on public.families for select to authenticated using (private.is_active_family_member(id));
create policy members_family_read on public.family_members for select to authenticated using (private.is_active_family_member(family_id));
create policy member_profiles_family_read on public.member_profiles for select to authenticated using (private.is_active_family_member(family_id));

create function private.create_profile_for_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), nullif(split_part(new.email, '@', 1), ''), 'Участник'), 100));
  return new;
end;
$$;
revoke all on function private.create_profile_for_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.create_profile_for_user();

insert into public.profiles (user_id, display_name)
select id, left(coalesce(nullif(trim(raw_user_meta_data ->> 'name'), ''), nullif(split_part(email, '@', 1), ''), 'Участник'), 100)
from auth.users on conflict (user_id) do nothing;

create function public.create_family(family_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare actor uuid := auth.uid(); new_family_id uuid;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if family_name is null or char_length(trim(family_name)) not between 1 and 100 then
    raise exception 'Invalid family name' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text, 0));
  if exists (select 1 from public.family_members where user_id = actor and status = 'active') then
    raise exception 'Already belongs to a family' using errcode = '23505';
  end if;
  insert into public.families (name, created_by) values (trim(family_name), actor) returning id into new_family_id;
  insert into public.family_members (family_id, user_id, role) values (new_family_id, actor, 'admin');
  return new_family_id;
end;
$$;
revoke all on function public.create_family(text) from public, anon;
grant execute on function public.create_family(text) to authenticated;

-- Handoffs are server-only; the webhook can create them only with service_role.
create table private.telegram_invite_handoffs (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.family_invites(id) on delete cascade,
  token_hash bytea not null unique,
  telegram_user_id text not null,
  telegram_chat_id text not null,
  update_id bigint not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz
);
alter table private.telegram_invite_handoffs enable row level security;
revoke all on private.telegram_invite_handoffs from public, anon, authenticated;

create table private.telegram_identity_bindings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  telegram_user_id text not null unique,
  subject text not null unique,
  created_at timestamptz not null default now()
);
alter table private.telegram_identity_bindings enable row level security;
revoke all on private.telegram_identity_bindings from public, anon, authenticated;

grant select (id, family_id, role, expires_at, accepted_at, revoked_at, created_at) on public.family_invites to authenticated;
create policy invites_admin_read on public.family_invites for select to authenticated using (
  exists (select 1 from public.family_members m where m.family_id = family_invites.family_id
    and m.user_id = (select auth.uid()) and m.role = 'admin' and m.status = 'active')
);

create function public.create_family_invite(invite_hash text, invite_role text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare actor uuid := auth.uid(); target_family uuid; result uuid;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if invite_hash !~ '^[0-9a-f]{64}$' or invite_role not in ('member', 'child') then
    raise exception 'Invalid invitation' using errcode = '22023';
  end if;
  select family_id into target_family from public.family_members where user_id = actor and status = 'active' and role = 'admin';
  if target_family is null then raise exception 'Admin required' using errcode = '42501'; end if;
  insert into public.family_invites (family_id, token_hash, role, created_by, expires_at)
  values (target_family, pg_catalog.decode(invite_hash, 'hex'), invite_role, actor, now() + interval '7 days') returning id into result;
  return result;
end;
$$;
revoke all on function public.create_family_invite(text, text) from public, anon;
grant execute on function public.create_family_invite(text, text) to authenticated;

create function public.revoke_family_invite(invite_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.family_invites i set revoked_at = now()
  where i.id = invite_id and i.accepted_at is null and i.revoked_at is null
    and exists (select 1 from public.family_members m where m.family_id = i.family_id and m.user_id = auth.uid() and m.role = 'admin' and m.status = 'active');
  if not found then raise exception 'Invitation unavailable' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.revoke_family_invite(uuid) from public, anon;
grant execute on function public.revoke_family_invite(uuid) to authenticated;

create function public.prepare_telegram_invite(invite_hash text, handoff_hash text, telegram_id text, chat_id text, telegram_update bigint)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare selected_invite uuid;
begin
  if invite_hash !~ '^[0-9a-f]{64}$' or handoff_hash !~ '^[0-9a-f]{64}$' or telegram_id !~ '^[0-9]{1,20}$' or chat_id !~ '^[0-9]{1,20}$' or telegram_id <> chat_id then
    raise exception 'Invalid Telegram update' using errcode = '22023';
  end if;
  select id into selected_invite from public.family_invites where token_hash = pg_catalog.decode(invite_hash, 'hex')
    and expires_at > now() and accepted_at is null and revoked_at is null for update;
  if selected_invite is null then return false; end if;
  insert into private.telegram_invite_handoffs as existing (invite_id, token_hash, telegram_user_id, telegram_chat_id, update_id, expires_at)
    values (selected_invite, pg_catalog.decode(handoff_hash, 'hex'), telegram_id, chat_id, telegram_update, now() + interval '15 minutes')
    on conflict (update_id) do update set token_hash = excluded.token_hash, expires_at = excluded.expires_at
      where existing.invite_id = excluded.invite_id
        and existing.telegram_user_id = excluded.telegram_user_id
        and existing.consumed_at is null;
  return found;
end;
$$;
revoke all on function public.prepare_telegram_invite(text, text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.prepare_telegram_invite(text, text, text, text, bigint) to service_role;

-- Only the server can call this after validating Telegram's signed ID token.
create function public.bind_verified_telegram_identity(actor uuid, verified_subject text, verified_telegram_id text, handoff_hash text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare handoff private.telegram_invite_handoffs%rowtype;
begin
  if actor is null or verified_subject is null or char_length(verified_subject) not between 1 and 255
     or verified_telegram_id !~ '^[0-9]{1,20}$' or handoff_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  if not exists (select 1 from auth.identities where user_id = actor and provider = 'custom:telegram' and provider_id = verified_subject) then
    return false;
  end if;
  select * into handoff from private.telegram_invite_handoffs where token_hash = pg_catalog.decode(handoff_hash, 'hex') for update;
  if handoff.id is null or handoff.telegram_user_id <> verified_telegram_id or handoff.expires_at <= pg_catalog.clock_timestamp() or handoff.consumed_at is not null then
    return false;
  end if;
  if not exists (select 1 from public.family_invites where id = handoff.invite_id and expires_at > pg_catalog.clock_timestamp() and revoked_at is null and accepted_at is null) then
    return false;
  end if;
  insert into private.telegram_identity_bindings as existing (user_id, telegram_user_id, subject)
    values (actor, verified_telegram_id, verified_subject)
    on conflict (user_id) do update set subject = excluded.subject
      where existing.telegram_user_id = excluded.telegram_user_id and existing.subject = excluded.subject;
  return found;
end;
$$;
revoke all on function public.bind_verified_telegram_identity(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.bind_verified_telegram_identity(uuid, text, text, text) to service_role;

create function public.accept_telegram_invite(handoff_hash text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare actor uuid := auth.uid(); tg_id text; handoff private.telegram_invite_handoffs%rowtype; invite public.family_invites%rowtype;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if handoff_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid invitation' using errcode = '22023'; end if;
  select b.telegram_user_id into tg_id from private.telegram_identity_bindings b
    join auth.identities a on a.user_id = b.user_id and a.provider = 'custom:telegram' and a.provider_id = b.subject
    where b.user_id = actor limit 1;
  if tg_id is null then raise exception 'Telegram login required' using errcode = '42501'; end if;
  select * into handoff from private.telegram_invite_handoffs where token_hash = pg_catalog.decode(handoff_hash, 'hex') for update;
  if handoff.id is null or handoff.telegram_user_id <> tg_id or handoff.expires_at <= pg_catalog.clock_timestamp() or handoff.consumed_at is not null then
    raise exception 'Invitation unavailable' using errcode = '42501';
  end if;
  select * into invite from public.family_invites where id = handoff.invite_id for update;
  if invite.id is null or invite.expires_at <= pg_catalog.clock_timestamp() or invite.revoked_at is not null or invite.accepted_at is not null then
    raise exception 'Invitation unavailable' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text, 0));
  if exists (select 1 from public.family_members where user_id = actor and status = 'active') then
    raise exception 'Already belongs to a family' using errcode = '23505';
  end if;
  insert into public.family_members (family_id, user_id, role, status) values (invite.family_id, actor, invite.role, 'active')
    on conflict (family_id, user_id) do update set role = excluded.role, status = 'active';
  update public.family_invites set accepted_by = actor, accepted_at = now() where id = invite.id;
  update private.telegram_invite_handoffs set consumed_at = now() where id = handoff.id;
  return invite.family_id;
end;
$$;
revoke all on function public.accept_telegram_invite(text) from public, anon;
grant execute on function public.accept_telegram_invite(text) to authenticated;

create function public.inspect_telegram_invite(handoff_hash text)
returns table (family_name text, invited_role text)
language sql stable security definer set search_path = ''
as $$
  select f.name, i.role from private.telegram_invite_handoffs h
  join public.family_invites i on i.id = h.invite_id
  join public.families f on f.id = i.family_id
  where handoff_hash ~ '^[0-9a-f]{64}$' and h.token_hash = pg_catalog.decode(handoff_hash, 'hex')
    and h.expires_at > now() and h.consumed_at is null
    and i.expires_at > now() and i.revoked_at is null and i.accepted_at is null
    and exists (select 1 from private.telegram_identity_bindings b join auth.identities a
      on a.user_id = b.user_id and a.provider = 'custom:telegram' and a.provider_id = b.subject
      where b.user_id = auth.uid() and b.telegram_user_id = h.telegram_user_id);
$$;
revoke all on function public.inspect_telegram_invite(text) from public, anon;
grant execute on function public.inspect_telegram_invite(text) to authenticated;

create function public.family_roster()
returns table (member_id uuid, user_id uuid, role text, display_name text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.user_id, m.role, p.display_name, m.created_at
  from public.family_members m join public.profiles p on p.user_id = m.user_id
  where m.status = 'active' and private.is_active_family_member(m.family_id)
  order by m.created_at;
$$;
revoke all on function public.family_roster() from public, anon;
grant execute on function public.family_roster() to authenticated;

create function public.add_child_profile(profile_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare actor uuid := auth.uid(); target_family uuid; result uuid;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if profile_name is null or char_length(trim(profile_name)) not between 1 and 100 then
    raise exception 'Invalid profile name' using errcode = '22023';
  end if;
  select family_id into target_family from public.family_members where user_id = actor and status = 'active' and role = 'admin';
  if target_family is null then raise exception 'Admin required' using errcode = '42501'; end if;
  insert into public.member_profiles (family_id, display_name) values (target_family, trim(profile_name)) returning id into result;
  return result;
end;
$$;
revoke all on function public.add_child_profile(text) from public, anon;
grant execute on function public.add_child_profile(text) to authenticated;

create function public.remove_family_member(target_member uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare actor uuid := auth.uid(); target public.family_members%rowtype; actor_role text;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into target from public.family_members where id = target_member and status = 'active';
  if target.id is null then raise exception 'Member unavailable' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target.family_id::text, 1));
  select * into target from public.family_members where id = target_member and status = 'active' for update;
  if target.id is null then raise exception 'Member unavailable' using errcode = '42501'; end if;
  select role into actor_role from public.family_members where family_id = target.family_id and user_id = actor and status = 'active';
  if actor_role is null or (target.user_id <> actor and actor_role <> 'admin') then
    raise exception 'Member unavailable' using errcode = '42501';
  end if;
  if target.role = 'admin' and (select count(*) from public.family_members where family_id = target.family_id and status = 'active' and role = 'admin') <= 1 then
    raise exception 'Cannot remove last administrator' using errcode = '23514';
  end if;
  update public.family_members set status = 'removed' where id = target.id;
end;
$$;
revoke all on function public.remove_family_member(uuid) from public, anon;
grant execute on function public.remove_family_member(uuid) to authenticated;

create function public.change_family_member_role(target_member uuid, new_role text)
returns void language plpgsql security definer set search_path = ''
as $$
declare actor uuid := auth.uid(); target public.family_members%rowtype; actor_role text;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if new_role is null or new_role not in ('admin', 'member', 'child') then raise exception 'Invalid role' using errcode = '22023'; end if;
  select * into target from public.family_members where id = target_member and status = 'active';
  if target.id is null then raise exception 'Member unavailable' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target.family_id::text, 1));
  select * into target from public.family_members where id = target_member and status = 'active' for update;
  if target.id is null then raise exception 'Member unavailable' using errcode = '42501'; end if;
  select role into actor_role from public.family_members where family_id = target.family_id and user_id = actor and status = 'active';
  if actor_role is distinct from 'admin' then raise exception 'Member unavailable' using errcode = '42501'; end if;
  if target.role = 'admin' and new_role <> 'admin' and
    (select count(*) from public.family_members where family_id = target.family_id and status = 'active' and role = 'admin') <= 1 then
    raise exception 'Cannot demote last administrator' using errcode = '23514';
  end if;
  update public.family_members set role = new_role where id = target.id;
end;
$$;
revoke all on function public.change_family_member_role(uuid, text) from public, anon;
grant execute on function public.change_family_member_role(uuid, text) to authenticated;
