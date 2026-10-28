-- Restore the requirement that Telegram verification belongs to the signed-in Telegram identity.
create or replace function public.bind_verified_telegram_identity(actor uuid, verified_subject text, verified_telegram_id text, handoff_hash text)
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

create or replace function public.accept_telegram_invite(handoff_hash text)
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

create or replace function public.inspect_telegram_invite(handoff_hash text)
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
