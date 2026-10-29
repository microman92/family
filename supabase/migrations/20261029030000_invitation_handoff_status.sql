-- The server checks whether the one-time link is still usable before offering
-- Telegram confirmation. The raw link is never stored or returned.
create function public.telegram_handoff_is_active(handoff_hash text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case
    when handoff_hash is null or handoff_hash !~ '^[0-9a-f]{64}$' then false
    else exists (
      select 1 from private.telegram_invite_handoffs h
      join public.family_invites i on i.id = h.invite_id
      where h.token_hash = pg_catalog.decode(handoff_hash, 'hex')
        and h.expires_at > now() and h.consumed_at is null
        and i.expires_at > now() and i.revoked_at is null and i.accepted_at is null
    )
  end;
$$;
revoke all on function public.telegram_handoff_is_active(text) from public, anon, authenticated;
grant execute on function public.telegram_handoff_is_active(text) to service_role;
