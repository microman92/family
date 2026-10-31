-- Run using: supabase db query --linked --file scripts/verify-phase-two.sql
-- Fixtures and all their changes are rolled back. No Telegram messages are sent.
begin;
set local statement_timeout = '30s';
select set_config('test.admin', gen_random_uuid()::text, true),
       set_config('test.member', gen_random_uuid()::text, true),
       set_config('test.outsider', gen_random_uuid()::text, true),
       set_config('test.invite', md5(random()::text) || md5(random()::text), true),
       set_config('test.handoff', md5(random()::text) || md5(random()::text), true),
       set_config('test.revoked', md5(random()::text) || md5(random()::text), true),
       set_config('test.expired', md5(random()::text) || md5(random()::text), true);
insert into auth.users (id, aud, role, raw_user_meta_data)
select current_setting(key)::uuid, 'authenticated', 'authenticated', '{"name":"Phase 2 transactional check"}'::jsonb
from unnest(array['test.admin','test.member','test.outsider']) as key;
insert into auth.identities (user_id, provider_id, provider, identity_data)
values (current_setting('test.member')::uuid, current_setting('test.member'), 'custom:telegram',
        jsonb_build_object('sub', current_setting('test.member')));

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.admin'), true);
select set_config('test.family', public.create_family('Phase 2 transaction only')::text, true);
select public.create_family_invite(current_setting('test.invite'), 'child');
select set_config('test.revoked_id', public.create_family_invite(current_setting('test.revoked'), 'member')::text, true);
select public.revoke_family_invite(current_setting('test.revoked_id')::uuid);
select public.create_family_invite(current_setting('test.expired'), 'member');
select public.add_child_profile('Transactional child');
do $$
begin
  begin
    perform public.change_family_member_role((select id from public.family_members where user_id=auth.uid()), 'member');
    raise exception 'FAIL: demoted last administrator';
  exception when check_violation then null; end;
  begin
    perform public.remove_family_member((select id from public.family_members where user_id=auth.uid()));
    raise exception 'FAIL: removed last administrator';
  exception when check_violation then null; end;
end $$;
reset role;
update public.family_invites set expires_at=now()-interval '1 minute'
where token_hash=decode(current_setting('test.expired'), 'hex');
set local role service_role;
do $$
begin
  if public.prepare_telegram_invite(current_setting('test.revoked'), current_setting('test.handoff'), '999999999999', '999999999999', -9223372036854775001) then
    raise exception 'FAIL: revoked invitation accepted';
  end if;
  if public.prepare_telegram_invite(current_setting('test.expired'), current_setting('test.handoff'), '999999999999', '999999999999', -9223372036854775002) then
    raise exception 'FAIL: expired invitation accepted';
  end if;
  if not public.prepare_telegram_invite(current_setting('test.invite'), current_setting('test.handoff'), '999999999999', '999999999999', -9223372036854775003) then
    raise exception 'FAIL: valid invitation rejected';
  end if;
  if public.bind_verified_telegram_identity(current_setting('test.member')::uuid, current_setting('test.member'), '999999999998', current_setting('test.handoff')) then
    raise exception 'FAIL: wrong recipient bound';
  end if;
  if not public.bind_verified_telegram_identity(current_setting('test.member')::uuid, current_setting('test.member'), '999999999999', current_setting('test.handoff')) then
    raise exception 'FAIL: valid identity rejected';
  end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.outsider'), true);
do $$
begin
  if exists (select 1 from public.families where id=current_setting('test.family')::uuid) then
    raise exception 'FAIL: outsider can read family';
  end if;
  begin
    perform public.accept_telegram_invite(current_setting('test.handoff'));
    raise exception 'FAIL: outsider accepted invitation';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('test.other_family', public.create_family('Other transactional family')::text, true);
reset role;
do $$
begin
  begin
    insert into public.member_profiles (family_id, display_name, linked_member_id)
    values (current_setting('test.family')::uuid, 'Invalid cross-family link',
      (select id from public.family_members where user_id=current_setting('test.outsider')::uuid));
    raise exception 'FAIL: cross-family profile link accepted';
  exception when foreign_key_violation then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.admin'), true);
do $$
begin
  if exists (select 1 from public.families where id=current_setting('test.other_family')::uuid) then
    raise exception 'FAIL: family administrator can read a different family';
  end if;
  if exists (select 1 from public.family_members where family_id=current_setting('test.other_family')::uuid) then
    raise exception 'FAIL: family administrator can read a different family roster';
  end if;
  if exists (select 1 from public.profiles where user_id=current_setting('test.outsider')::uuid) then
    raise exception 'FAIL: family administrator can read another user profile';
  end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('test.outsider'), true);
do $$
begin
  if exists (select 1 from public.family_members where family_id=current_setting('test.family')::uuid) then
    raise exception 'FAIL: other family can read the roster';
  end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('test.member'), true);
select public.accept_telegram_invite(current_setting('test.handoff'));
do $$
begin
  if not exists (select 1 from public.family_members where user_id=auth.uid() and role='child' and status='active') then
    raise exception 'FAIL: child membership missing';
  end if;
  if exists (select 1 from public.family_members where family_id=current_setting('test.family')::uuid and user_id<>auth.uid()) then
    raise exception 'FAIL: child can read other family memberships';
  end if;
  if (select count(*) from public.family_roster()) <> 1 or exists (select 1 from public.family_roster() where user_id<>auth.uid()) then
    raise exception 'FAIL: child can read the family roster';
  end if;
  begin
    perform public.accept_telegram_invite(current_setting('test.handoff'));
    raise exception 'FAIL: invitation reused';
  exception when insufficient_privilege then null; end;
  begin
    perform public.create_family_invite(md5(random()::text) || md5(random()::text), 'member');
    raise exception 'FAIL: child created invitation';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', current_setting('test.admin'), true);
do $$
begin
  if (select count(*) from public.family_roster()) <> 2 then
    raise exception 'FAIL: admin cannot read the family roster';
  end if;
end $$;
select public.change_family_member_role((select id from public.family_members where user_id=current_setting('test.member')::uuid), 'member');
select set_config('request.jwt.claim.sub', current_setting('test.member'), true);
do $$
begin
  if (select count(*) from public.family_roster()) <> 2 then
    raise exception 'FAIL: adult member cannot read family roster';
  end if;
  begin
    perform public.create_family_invite(md5(random()::text) || md5(random()::text), 'member');
    raise exception 'FAIL: ordinary member created invitation';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', current_setting('test.admin'), true);
select public.remove_family_member((select id from public.family_members where user_id=current_setting('test.member')::uuid));
select set_config('request.jwt.claim.sub', current_setting('test.member'), true);
do $$
begin
  if exists (select 1 from public.families where id=current_setting('test.family')::uuid) then
    raise exception 'FAIL: removed member retains family access';
  end if;
  if exists (select 1 from public.family_roster()) then
    raise exception 'FAIL: removed member retains roster access';
  end if;
end $$;
rollback;
select 'PASS: invitation expiry/revocation/replay, recipient, roles, RLS, removal; fixtures rolled back' as result;
