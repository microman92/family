-- Existing items retain their archived category and remain editable.
create or replace function private.check_shopping_item() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.shopping_categories c where c.id = new.category_id
      and (c.archived_at is null or (tg_op = 'UPDATE' and old.category_id = new.category_id))
      and private.same_scope(new.visibility, new.family_id, new.owner_user_id,
                             c.visibility, c.family_id, c.owner_user_id)
  ) then raise exception 'Invalid category scope' using errcode = '23514'; end if;
  if new.assigned_to is not null and (new.visibility <> 'family' or not exists (
    select 1 from public.family_members m where m.id = new.assigned_to
      and m.family_id = new.family_id and m.status = 'active'
  )) then raise exception 'Invalid assignee' using errcode = '23514'; end if;
  if tg_op = 'UPDATE' and new.version <> old.version + 1 then
    raise exception 'Invalid version' using errcode = '23514';
  end if;
  return new;
end; $$;
