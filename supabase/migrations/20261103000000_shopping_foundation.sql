-- Shopping data is protected independently of the UI and server actions.
create table public.shopping_category_presets (
  id text primary key,
  name text not null,
  icon text not null
);
insert into public.shopping_category_presets (id, name, icon) values
  ('food', 'Продукты', 'shopping'), ('cleaning', 'Уборка', 'home'),
  ('clothing', 'Одежда', 'shopping'), ('hygiene', 'Гигиена', 'home'),
  ('health', 'Здоровье и витамины', 'home'), ('pets', 'Животные', 'home'),
  ('home', 'Дом и ремонт', 'home'), ('education', 'Обучение и канцелярия', 'notes'),
  ('leisure', 'Развлечения', 'goal'), ('other', 'Другое', 'shopping');
alter table public.shopping_category_presets enable row level security;
revoke all on public.shopping_category_presets from public, anon, authenticated;
grant select on public.shopping_category_presets to authenticated;
create policy presets_read on public.shopping_category_presets for select to authenticated using (true);

create table public.shopping_categories (
  id uuid primary key default gen_random_uuid(),
  visibility text not null,
  family_id uuid references public.families(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  icon text not null default 'shopping' check (char_length(icon) between 1 and 32),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  check (private.scope_is_valid(visibility, family_id, owner_user_id))
);
create index shopping_categories_family_idx on public.shopping_categories(family_id);
create index shopping_categories_owner_idx on public.shopping_categories(owner_user_id);

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  visibility text not null,
  family_id uuid references public.families(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  category_id uuid references public.shopping_categories(id) on delete restrict,
  preset_id text references public.shopping_category_presets(id),
  planned_qty numeric(12,3) not null default 1 check (planned_qty > 0),
  unit text not null default 'шт' check (char_length(trim(unit)) between 1 and 24),
  planned_unit_price bigint check (planned_unit_price >= 0),
  priority text not null default 'normal' check (priority in ('normal', 'urgent')),
  big_purchase boolean not null default false,
  location text check (location in ('store', 'market', 'online')),
  due_date date,
  description text check (char_length(description) <= 2000),
  assigned_to uuid references public.family_members(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  check (category_id is null or preset_id is null),
  check (private.scope_is_valid(visibility, family_id, owner_user_id))
);
create index shopping_items_family_idx on public.shopping_items(family_id);
create index shopping_items_owner_idx on public.shopping_items(owner_user_id);

-- Until fine-grained child permissions exist, only adults can access shared shopping.
create function private.can_access_shopping(visibility text, family_id uuid, owner_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.can_access_scope(visibility, family_id, owner_user_id)
    and (visibility = 'private' or private.is_active_family_adult(family_id));
$$;
revoke all on function private.can_access_shopping(text, uuid, uuid) from public, anon;
grant execute on function private.can_access_shopping(text, uuid, uuid) to authenticated, service_role;

alter table public.shopping_categories enable row level security;
alter table public.shopping_items enable row level security;
revoke all on public.shopping_categories, public.shopping_items from public, anon, authenticated;
grant select, insert, update, delete on public.shopping_categories, public.shopping_items to authenticated;
create policy shopping_categories_access on public.shopping_categories for all to authenticated
  using (private.can_access_shopping(visibility, family_id, owner_user_id))
  with check (private.can_access_shopping(visibility, family_id, owner_user_id));
create policy shopping_items_access on public.shopping_items for all to authenticated
  using (private.can_access_shopping(visibility, family_id, owner_user_id))
  with check (private.can_access_shopping(visibility, family_id, owner_user_id));
create trigger shopping_categories_scope before update on public.shopping_categories
  for each row execute function private.prevent_scope_change();
create trigger shopping_items_scope before update on public.shopping_items
  for each row execute function private.prevent_scope_change();

create function private.check_shopping_item() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.shopping_categories c where c.id = new.category_id
      and c.archived_at is null
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
revoke all on function private.check_shopping_item() from public, anon, authenticated;
create trigger shopping_items_validate before insert or update on public.shopping_items
  for each row execute function private.check_shopping_item();
