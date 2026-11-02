-- Real shopping tables: all fixtures roll back at the end of this test.
begin;
select set_config('test.shop_a', gen_random_uuid()::text, true),
       set_config('test.shop_b', gen_random_uuid()::text, true),
       set_config('test.shop_other', gen_random_uuid()::text, true),
       set_config('test.shop_child', gen_random_uuid()::text, true),
       set_config('test.family_a', gen_random_uuid()::text, true),
       set_config('test.family_b', gen_random_uuid()::text, true),
       set_config('test.private_item', gen_random_uuid()::text, true),
       set_config('test.family_item', gen_random_uuid()::text, true),
       set_config('test.other_item', gen_random_uuid()::text, true),
       set_config('test.private_category', gen_random_uuid()::text, true);
insert into auth.users (id, aud, role, raw_user_meta_data)
select current_setting(key)::uuid, 'authenticated', 'authenticated', '{"name":"Shopping test"}'::jsonb
from unnest(array['test.shop_a','test.shop_b','test.shop_other','test.shop_child']) as key;
insert into public.families (id, name, created_by) values
  (current_setting('test.family_a')::uuid, 'test', current_setting('test.shop_a')::uuid),
  (current_setting('test.family_b')::uuid, 'test', current_setting('test.shop_other')::uuid);
insert into public.family_members (family_id, user_id, role) values
  (current_setting('test.family_a')::uuid, current_setting('test.shop_a')::uuid, 'admin'),
  (current_setting('test.family_a')::uuid, current_setting('test.shop_b')::uuid, 'member'),
  (current_setting('test.family_a')::uuid, current_setting('test.shop_child')::uuid, 'child'),
  (current_setting('test.family_b')::uuid, current_setting('test.shop_other')::uuid, 'admin');
select set_config('test.other_member', (select id::text from public.family_members where user_id=current_setting('test.shop_other')::uuid), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.shop_a'), true);
do $$ begin
  if (select count(*) from public.shopping_category_presets) <> 10 then
    raise exception 'FAIL: missing system shopping categories'; end if;
end $$;
insert into public.shopping_categories (id, visibility, owner_user_id, name)
values (current_setting('test.private_category')::uuid, 'private', auth.uid(), 'Private category');
insert into public.shopping_items (id, visibility, owner_user_id, title)
values (current_setting('test.private_item')::uuid, 'private', auth.uid(), 'Private item');
insert into public.shopping_items (id, visibility, family_id, title)
values (current_setting('test.family_item')::uuid, 'family', current_setting('test.family_a')::uuid, 'Shared item');
update public.shopping_items set category_id=current_setting('test.private_category')::uuid, version=version+1
where id=current_setting('test.private_item')::uuid;
update public.shopping_categories set archived_at=now() where id=current_setting('test.private_category')::uuid;
update public.shopping_items set title='Edited after archive', version=version+1 where id=current_setting('test.private_item')::uuid;
do $$ begin
  begin
    insert into public.shopping_items (visibility, family_id, title, category_id)
    values ('family', current_setting('test.family_a')::uuid, 'Bad link', current_setting('test.private_category')::uuid);
    raise exception 'FAIL: cross-scope category accepted';
  exception when check_violation then null; end;
  begin
    update public.shopping_items set owner_user_id = current_setting('test.shop_b')::uuid, version=version+1
    where id=current_setting('test.private_item')::uuid;
    raise exception 'FAIL: scope change accepted';
  exception when check_violation then null; end;
  begin
    insert into public.shopping_items (visibility, family_id, title, assigned_to)
    values ('family', current_setting('test.family_a')::uuid, 'Bad assignee', current_setting('test.other_member')::uuid);
    raise exception 'FAIL: foreign assignee accepted';
  exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub', current_setting('test.shop_other'), true);
insert into public.shopping_items (id, visibility, family_id, title)
values (current_setting('test.other_item')::uuid, 'family', current_setting('test.family_b')::uuid, 'Other family');
do $$ begin
  if exists (select 1 from public.shopping_items where id in (current_setting('test.private_item')::uuid, current_setting('test.family_item')::uuid)) then
    raise exception 'FAIL: outsider can read items'; end if;
  begin
    insert into public.shopping_items (visibility, family_id, title)
    values ('family', current_setting('test.family_a')::uuid, 'Forged');
    raise exception 'FAIL: outsider can insert in other family';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', current_setting('test.shop_b'), true);
do $$ begin
  if not exists (select 1 from public.shopping_items where id=current_setting('test.family_item')::uuid)
     or exists (select 1 from public.shopping_items where id in (current_setting('test.private_item')::uuid, current_setting('test.other_item')::uuid)) then
    raise exception 'FAIL: member scope visibility'; end if;
  update public.shopping_items set title='Updated', version=version+1 where id=current_setting('test.family_item')::uuid;
  if not found then raise exception 'FAIL: member cannot update shared item'; end if;
  delete from public.shopping_items where id=current_setting('test.private_item')::uuid;
  if found then raise exception 'FAIL: member deleted private item'; end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('test.shop_child'), true);
do $$ begin
  if exists (select 1 from public.shopping_items where id=current_setting('test.family_item')::uuid) then
    raise exception 'FAIL: child has unapproved shared access'; end if;
end $$;
reset role;
update public.family_members set status='removed' where user_id=current_setting('test.shop_b')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.shop_b'), true);
do $$ begin
  if exists (select 1 from public.shopping_items where id=current_setting('test.family_item')::uuid) then
    raise exception 'FAIL: removed member retains access'; end if;
end $$;
rollback;
select 'PASS: shopping family/private isolation and category link';
