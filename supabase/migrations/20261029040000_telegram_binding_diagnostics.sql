-- Service-only diagnostics return no account identifiers or token data.
create function public.telegram_binding_diagnostics(actor uuid, verified_subject text, verified_telegram_id text, handoff_hash text)
returns text language plpgsql stable security definer set search_path = ''
as $$
declare handoff private.telegram_invite_handoffs%rowtype;
begin
  if actor is null or verified_subject is null or handoff_hash !~ '^[0-9a-f]{64}$'
     or verified_telegram_id !~ '^[0-9]{1,20}$' then return 'invalid_input'; end if;
  if not exists (select 1 from auth.identities where user_id = actor and provider = 'custom:telegram' and provider_id = verified_subject) then
    return 'login_account_mismatch';
  end if;
  select * into handoff from private.telegram_invite_handoffs where token_hash=pg_catalog.decode(handoff_hash, 'hex');
  if handoff.id is null then return 'handoff_missing'; end if;
  if handoff.telegram_user_id <> verified_telegram_id then return 'recipient_mismatch'; end if;
  if handoff.expires_at <= pg_catalog.clock_timestamp() or handoff.consumed_at is not null then return 'handoff_expired'; end if;
  if not exists (select 1 from public.family_invites where id=handoff.invite_id and expires_at>pg_catalog.clock_timestamp() and revoked_at is null and accepted_at is null) then
    return 'invitation_unavailable';
  end if;
  if exists (select 1 from private.telegram_identity_bindings where user_id=actor and (telegram_user_id<>verified_telegram_id or subject<>verified_subject)) then
    return 'account_already_bound';
  end if;
  if exists (select 1 from private.telegram_identity_bindings where (telegram_user_id=verified_telegram_id or subject=verified_subject) and user_id<>actor) then
    return 'telegram_already_bound';
  end if;
  return 'other';
end;
$$;
revoke all on function public.telegram_binding_diagnostics(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.telegram_binding_diagnostics(uuid, text, text, text) to service_role;
