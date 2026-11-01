-- Run using: supabase db query --linked --file scripts/verify-phase-two.sql
-- Fixtures and all their changes are rolled back. No Telegram messages are sent.
begin;
set local statement_timeout = '30s';
do $$
begin
  if exists (
    select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where c.relkind='r' and n.nspname in ('public','private')
      and (not c.relrowsecurity
        or has_table_privilege('anon', c.oid, 'select')
        or has_table_privilege('anon', c.oid, 'insert')
        or has_table_privilege('anon', c.oid, 'update')
        or has_table_privilege('anon', c.oid, 'delete')
        or has_any_column_privilege('anon', c.oid, 'select')
        or has_any_column_privilege('anon', c.oid, 'insert')
        or has_any_column_privilege('anon', c.oid, 'update'))
  ) then raise exception 'FAIL: user table lacks RLS or allows anonymous access'; end if;
  if exists (
    select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where c.relkind='r' and n.nspname='public' and c.relname in ('families', 'family_members', 'member_profiles', 'family_invites')
      and (has_table_privilege('authenticated', c.oid, 'insert')
        or has_table_privilege('authenticated', c.oid, 'update')
        or has_table_privilege('authenticated', c.oid, 'delete')
        or has_any_column_privilege('authenticated', c.oid, 'insert')
        or has_any_column_privilege('authenticated', c.oid, 'update'))
  ) then raise exception 'FAIL: direct mutation of family tables is allowed'; end if;
  if exists (
    select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where c.relkind='r' and n.nspname='private'
      and (has_table_privilege('service_role', c.oid, 'select')
        or has_table_privilege('service_role', c.oid, 'insert')
        or has_table_privilege('service_role', c.oid, 'update')
        or has_table_privilege('service_role', c.oid, 'delete')
        or has_any_column_privilege('service_role', c.oid, 'select')
        or has_any_column_privilege('service_role', c.oid, 'insert')
        or has_any_column_privilege('service_role', c.oid, 'update'))
  ) then raise exception 'FAIL: direct service access to private tables is allowed'; end if;
  if has_schema_privilege('anon', 'private', 'usage')
     or not has_schema_privilege('service_role', 'private', 'usage')
     or has_table_privilege('service_role', 'private.telegram_identity_bindings', 'select')
     or has_table_privilege('service_role', 'private.telegram_invite_handoffs', 'select')
     or has_column_privilege('authenticated', 'public.family_invites', 'token_hash', 'select')
     or has_column_privilege('authenticated', 'public.profiles', 'user_id', 'update')
     or not has_column_privilege('authenticated', 'public.profiles', 'display_name', 'update')
     or has_function_privilege('anon', 'public.create_family(text)', 'execute') then
    raise exception 'FAIL: unexpected grants for protected data';
  end if;
end $$;
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
select set_config('test.admin_member', (select id::text from public.family_members where user_id=auth.uid() and status='active'), true);
select public.set_family_title(current_setting('test.admin_member')::uuid, 'member', 'king');
do $$
begin
  if not exists (select 1 from public.family_members where id=current_setting('test.admin_member')::uuid and title='king' and role='admin') then
    raise exception 'FAIL: title changed authorization role';
  end if;
  begin
    perform public.set_family_title(current_setting('test.admin_member')::uuid, 'member', 'princess');
    raise exception 'FAIL: incompatible title accepted';
  exception when invalid_parameter_value then null; end;
end $$;
insert into storage.objects (bucket_id, name)
values ('profile-avatars', current_setting('test.admin') || '/security-test.webp');
do $$
begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('profile-avatars', current_setting('test.member') || '/forged.webp');
    raise exception 'FAIL: avatar written under another user';
  exception when insufficient_privilege then null; end;
end $$;
select public.create_family_invite(current_setting('test.invite'), 'child');
select set_config('test.revoked_id', public.create_family_invite(current_setting('test.revoked'), 'member')::text, true);
select public.revoke_family_invite(current_setting('test.revoked_id')::uuid);
select public.create_family_invite(current_setting('test.expired'), 'member');
select public.add_child_profile('Transactional child');
select set_config('test.child_profile', (select id::text from public.member_profiles where family_id=current_setting('test.family')::uuid limit 1), true);
select public.set_family_title(current_setting('test.child_profile')::uuid, 'child_profile', 'princess');
do $$
begin
  if not exists (select 1 from public.member_profiles where id=current_setting('test.child_profile')::uuid and title='princess') then raise exception 'FAIL: child title not saved'; end if;
end $$;
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
  if not private.scope_is_valid('private', null, current_setting('test.member')::uuid) then
    raise exception 'FAIL: service role cannot use scope validation';
  end if;
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
  if exists (select 1 from storage.objects where bucket_id='profile-avatars' and name=current_setting('test.admin') || '/security-test.webp') then
    raise exception 'FAIL: outsider can read private avatar';
  end if;
  begin
    perform public.accept_telegram_invite(current_setting('test.handoff'));
    raise exception 'FAIL: outsider accepted invitation';
  exception when insufficient_privilege then null; end;
  begin
    perform public.set_family_title(current_setting('test.admin_member')::uuid, 'member', 'queen');
    raise exception 'FAIL: foreign title changed';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('test.other_family', public.create_family('Other transactional family')::text, true);
reset role;
-- Disposable table proves the shared scope contract and RLS without creating product data.
create temporary table scoped_security_fixture (
  id integer primary key,
  visibility text not null,
  family_id uuid,
  owner_user_id uuid,
  body text not null,
  constraint scoped_security_fixture_valid check (private.scope_is_valid(visibility, family_id, owner_user_id))
);
alter table scoped_security_fixture enable row level security;
grant select, insert, update, delete on scoped_security_fixture to authenticated;
create policy scoped_fixture_access on scoped_security_fixture for all to authenticated
  using (private.can_access_scope(visibility, family_id, owner_user_id))
  with check (private.can_access_scope(visibility, family_id, owner_user_id));
create trigger scoped_fixture_immutable before update on scoped_security_fixture
  for each row execute function private.prevent_scope_change();
insert into scoped_security_fixture values
  (1, 'family', current_setting('test.family')::uuid, null, 'family a'),
  (2, 'family', current_setting('test.other_family')::uuid, null, 'family b'),
  (3, 'private', null, current_setting('test.admin')::uuid, 'private admin'),
  (4, 'private', null, current_setting('test.member')::uuid, 'private member'),
  (5, 'private', null, current_setting('test.outsider')::uuid, 'private outsider');
do $$
begin
  begin
    insert into scoped_security_fixture values (6, 'private', current_setting('test.family')::uuid, current_setting('test.admin')::uuid, 'invalid');
    raise exception 'FAIL: invalid scope accepted';
  exception when check_violation then null; end;
  if private.same_scope('private', null, current_setting('test.admin')::uuid, 'family', current_setting('test.family')::uuid, null) then
    raise exception 'FAIL: private and family scopes match';
  end if;
  if private.same_scope('private', null, current_setting('test.admin')::uuid, 'private', null, current_setting('test.member')::uuid) then
    raise exception 'FAIL: different owners match';
  end if;
  if private.scope_is_valid(null, null, null)
     or private.scope_is_valid('family', null, null)
     or not private.same_scope('private', null, current_setting('test.admin')::uuid, 'private', null, current_setting('test.admin')::uuid)
     or private.same_scope('family', current_setting('test.family')::uuid, null, 'family', current_setting('test.other_family')::uuid, null) then
    raise exception 'FAIL: scope validation mismatch';
  end if;
end $$;
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
declare affected integer;
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
  update public.profiles set display_name='forbidden' where user_id=current_setting('test.outsider')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: administrator updated another user profile'; end if;
  if (select count(*) from scoped_security_fixture) <> 2 or exists (select 1 from scoped_security_fixture where id in (2, 4, 5)) then
    raise exception 'FAIL: administrator can read another family or private record';
  end if;
  update scoped_security_fixture set body='forbidden' where id in (2, 4, 5);
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: administrator updated inaccessible records'; end if;
  delete from scoped_security_fixture where id in (2, 4, 5);
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: administrator deleted inaccessible records'; end if;
  begin
    insert into scoped_security_fixture values (6, 'private', null, current_setting('test.member')::uuid, 'forged');
    raise exception 'FAIL: forged owner accepted';
  exception when insufficient_privilege then null; end;
  begin
    update scoped_security_fixture set owner_user_id=current_setting('test.member')::uuid where id=3;
    raise exception 'FAIL: owner change accepted';
  exception when check_violation or insufficient_privilege then null; end;
  begin
    update scoped_security_fixture set visibility='private', family_id=null, owner_user_id=auth.uid() where id=1;
    raise exception 'FAIL: family record changed to private';
  exception when check_violation or insufficient_privilege then null; end;
  insert into scoped_security_fixture values (7, 'private', null, auth.uid(), 'own');
  update scoped_security_fixture set body='updated' where id=7;
  delete from scoped_security_fixture where id=7;
  if not private.has_family_capability(current_setting('test.family')::uuid, 'family.manage')
     or not private.has_family_capability(current_setting('test.family')::uuid, 'finance.write')
     or private.has_family_capability(current_setting('test.other_family')::uuid, 'finance.read')
     or private.has_family_capability(current_setting('test.family')::uuid, 'unexpected')
     or private.has_family_capability(current_setting('test.family')::uuid, 'constructor')
     or private.has_family_capability(current_setting('test.family')::uuid, '__proto__') then
    raise exception 'FAIL: administrator capability mismatch';
  end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('test.outsider'), true);
do $$
begin
  if exists (select 1 from public.family_members where family_id=current_setting('test.family')::uuid) then
    raise exception 'FAIL: other family can read the roster';
  end if;
  if (select count(*) from scoped_security_fixture) <> 2 or exists (select 1 from scoped_security_fixture where id in (1, 3, 4)) then
    raise exception 'FAIL: other family can read private or family records';
  end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('test.member'), true);
select public.accept_telegram_invite(current_setting('test.handoff'));
insert into storage.objects (bucket_id, name)
values ('profile-avatars', current_setting('test.member') || '/security-test.webp');
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
  if (select count(*) from scoped_security_fixture) <> 2 or exists (select 1 from scoped_security_fixture where id in (2, 3, 5)) then
    raise exception 'FAIL: child can read unrelated scoped records';
  end if;
  if private.has_family_capability(current_setting('test.family')::uuid, 'finance.read')
     or private.has_family_capability(current_setting('test.family')::uuid, 'finance.write')
     or private.has_family_capability(current_setting('test.family')::uuid, 'family.manage') then
    raise exception 'FAIL: child has restricted capability';
  end if;
  begin
    perform public.accept_telegram_invite(current_setting('test.handoff'));
    raise exception 'FAIL: invitation reused';
  exception when insufficient_privilege then null; end;
  begin
    perform public.create_family_invite(md5(random()::text) || md5(random()::text), 'member');
    raise exception 'FAIL: child created invitation';
  exception when insufficient_privilege then null; end;
  begin
    perform public.set_family_title(current_setting('test.child_profile')::uuid, 'child_profile', 'prince');
    raise exception 'FAIL: child changed title';
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
  if not private.has_family_capability(current_setting('test.family')::uuid, 'finance.read')
     or not private.has_family_capability(current_setting('test.family')::uuid, 'finance.write')
     or private.has_family_capability(current_setting('test.family')::uuid, 'family.manage') then
    raise exception 'FAIL: adult member capability mismatch';
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
  if private.has_family_capability(current_setting('test.family')::uuid, 'finance.read')
     or (select count(*) from scoped_security_fixture) <> 1
     or not exists (select 1 from scoped_security_fixture where id=4) then
    raise exception 'FAIL: removed member scope or capability mismatch';
  end if;
  if not exists (select 1 from storage.objects where bucket_id='profile-avatars' and name=current_setting('test.member') || '/security-test.webp') then
    raise exception 'FAIL: removed member cannot read own private avatar';
  end if;
end $$;
rollback;
select 'PASS: grants, family/private RLS, roles, avatars, invitations and removal; fixtures rolled back' as result;
