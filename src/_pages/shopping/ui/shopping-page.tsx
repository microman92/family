import Link from 'next/link';
import { ShoppingEditForm, ShoppingItemStepper, ShoppingDelete } from '@/features/shopping';
import {
  getCurrentUser,
  requireCurrentFamilyCapability,
  AccessDeniedError,
} from '@/server/access/index.server';
import {
  addShoppingPosition,
  deleteShoppingItem,
  saveShoppingCategory,
  archiveShoppingCategory,
} from '@/server/shopping/index.server';
import { Button, Icon } from '@/shared/ui';
import { calculatePlan } from '@/server/modules/shopping/domain/plan';
import styles from './shopping.module.scss';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    scope?: string;
    error?: string;
    urgent?: string;
    big?: string;
    sort?: string;
  }>;
}) {
  const params = await searchParams;
  const scope = params.scope === 'private' ? 'private' : 'family';
  const { client, user } = await getCurrentUser();
  let familyId: string | null = null;
  try {
    familyId = (await requireCurrentFamilyCapability('members.read')).familyId;
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
  }
  const selected = scope === 'family' && !familyId ? 'private' : scope;
  const tabLink = (nextScope: 'family' | 'private') => {
    const next = new URLSearchParams({ scope: nextScope });
    if (params.urgent === '1') next.set('urgent', '1');
    if (params.big === '1') next.set('big', '1');
    if (params.sort === 'due') next.set('sort', 'due');
    return `/shopping?${next.toString()}`;
  };
  let query = client
    .from('shopping_items')
    .select(
      'id,title,planned_qty,unit,planned_unit_price,priority,location,big_purchase,due_date,assigned_to,category_id,preset_id,version',
    )
    .eq('visibility', selected)
    .is('deleted_at', null);
  if (params.urgent === '1') query = query.eq('priority', 'urgent');
  if (params.big === '1') query = query.eq('big_purchase', true);
  const { data: presets, error: presetsError } = await client
    .from('shopping_category_presets')
    .select('id,name,icon')
    .order('name');
  const categoryQuery = client
    .from('shopping_categories')
    .select('id,name,icon,color')
    .eq('visibility', selected)
    .is('archived_at', null);
  const { data: categories, error: categoriesError } = await (
    selected === 'family'
      ? categoryQuery.eq('family_id', familyId!)
      : categoryQuery.eq('owner_user_id', user.id)
  ).order('name');
  const { data: members, error: membersError } =
    selected === 'family' ? await client.rpc('family_roster') : { data: [], error: null };
  query =
    selected === 'family' ? query.eq('family_id', familyId!) : query.eq('owner_user_id', user.id);
  if (params.sort === 'due')
    query = query.order('due_date', { ascending: true, nullsFirst: false });
  const { data: items, error } = await query.order('created_at', { ascending: false });
  const plan = calculatePlan(items ?? []);
  return (
    <div className={styles.page}>
      <header>
        <h1>Покупки</h1>
        <p>Всё нужное в одном списке.</p>
      </header>
      <nav className={styles.tabs} aria-label="Пространство покупок">
        {familyId && (
          <Link href={tabLink('family')} aria-current={selected === 'family' ? 'page' : undefined}>
            Общее
          </Link>
        )}
        <Link href={tabLink('private')} aria-current={selected === 'private' ? 'page' : undefined}>
          Личное
        </Link>
      </nav>
      {!error && !presetsError && !categoriesError && !membersError && (
        <ShoppingItemStepper
          key={selected}
          scope={selected}
          save={addShoppingPosition}
          categories={[
            ...(presets ?? []).map((preset) => ({
              value: `preset:${preset.id}`,
              name: preset.name,
              icon: preset.icon,
            })),
            ...(categories ?? []).map((category) => ({
              value: `custom:${category.id}`,
              name: category.name,
              icon: category.icon,
            })),
          ]}
          members={members ?? []}
        />
      )}
      <section className={styles.panel}>
        <h2 id="shopping-list-title" tabIndex={-1}>
          {selected === 'family' ? 'Общий список' : 'Личный список'}
        </h2>
        {error || presetsError || categoriesError || membersError ? (
          <p role="alert">Не удалось загрузить покупки. Попробуйте позже.</p>
        ) : (
          <>
            {params.error && (
              <p role="alert">
                {params.error === 'title'
                  ? 'Укажите название покупки.'
                  : params.error === 'conflict'
                    ? 'Покупка изменилась или была удалена. Обновите список и попробуйте снова.'
                    : params.error === 'fields'
                      ? 'Проверьте данные покупки.'
                      : 'Не удалось сохранить покупку. Попробуйте ещё раз.'}
              </p>
            )}
            <form className={styles.filters} action="/shopping">
              <input type="hidden" name="scope" value={selected} />
              <label>
                Сортировка
                <select name="sort" defaultValue={params.sort === 'due' ? 'due' : 'new'}>
                  <option value="new">Новые сначала</option>
                  <option value="due">По дате</option>
                </select>
              </label>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  name="urgent"
                  value="1"
                  defaultChecked={params.urgent === '1'}
                />{' '}
                Срочные
              </label>
              <label className={styles.checkbox}>
                <input type="checkbox" name="big" value="1" defaultChecked={params.big === '1'} />{' '}
                Крупные
              </label>
              <Button type="submit" variant="outline">
                Показать
              </Button>
            </form>
            {items?.length ? (
              <>
                <p className={styles.empty}>
                  {plan.unknown === items.length
                    ? 'Сумма пока неизвестна: цены не указаны.'
                    : `Известная сумма: ${plan.amount} сум${plan.unknown > 0 ? ` · Без цены: ${plan.unknown}` : ''}`}
                </p>
                <ul className={styles.list}>
                  {items.map((item) => (
                    <li key={item.id}>
                      <div>
                        <div className={styles.itemHeading}>
                          <span className={styles.itemTitle}>{item.title}</span>
                          <ShoppingDelete
                            key={item.version}
                            id={item.id}
                            title={item.title}
                            version={item.version}
                            scope={selected}
                            remove={deleteShoppingItem}
                          />
                        </div>
                        <details className={styles.edit}>
                          <summary>Редактировать</summary>
                          <ShoppingEditForm key={item.version}>
                            <input type="hidden" name="scope" value={selected} />
                            <input type="hidden" name="id" value={item.id} />
                            <input type="hidden" name="version" value={item.version} />
                            <label>
                              Название
                              <input
                                name="title"
                                defaultValue={item.title}
                                maxLength={200}
                                required
                              />
                            </label>
                            <label>
                              Количество
                              <input
                                name="qty"
                                type="number"
                                min="0.001"
                                max="999999999"
                                step="0.001"
                                defaultValue={item.planned_qty}
                                required
                              />
                            </label>
                            <label>
                              Единица
                              <input name="unit" maxLength={24} defaultValue={item.unit} required />
                            </label>
                            <label>
                              Цена за единицу, сум
                              <input
                                name="price"
                                type="number"
                                min="0"
                                max="999999999999"
                                step="1"
                                defaultValue={item.planned_unit_price ?? ''}
                              />
                            </label>
                            <label>
                              Категория
                              <select
                                name="category"
                                defaultValue={
                                  item.category_id
                                    ? `custom:${item.category_id}`
                                    : item.preset_id
                                      ? `preset:${item.preset_id}`
                                      : ''
                                }
                              >
                                <option value="">Без категории</option>
                                {presets?.map((preset) => (
                                  <option key={preset.id} value={`preset:${preset.id}`}>
                                    {preset.name}
                                  </option>
                                ))}
                                {categories?.map((category) => (
                                  <option key={category.id} value={`custom:${category.id}`}>
                                    {category.name}
                                  </option>
                                ))}
                                {item.category_id &&
                                  !categories?.some(
                                    (category) => category.id === item.category_id,
                                  ) && (
                                    <option value={`custom:${item.category_id}`}>
                                      Архивная категория
                                    </option>
                                  )}
                              </select>
                            </label>
                            <label>
                              Срочность
                              <select name="priority" defaultValue={item.priority}>
                                <option value="normal">Обычная</option>
                                <option value="urgent">Срочно</option>
                              </select>
                            </label>
                            <input type="hidden" name="location" value={item.location ?? ''} />
                            <label>
                              Дата
                              <input name="due" type="date" defaultValue={item.due_date ?? ''} />
                            </label>
                            {selected === 'family' && (
                              <label>
                                Ответственный
                                <select name="assigned" defaultValue={item.assigned_to ?? ''}>
                                  <option value="">Не назначен</option>
                                  {members?.map(
                                    (member: { member_id: string; display_name: string }) => (
                                      <option key={member.member_id} value={member.member_id}>
                                        {member.display_name}
                                      </option>
                                    ),
                                  )}
                                  {item.assigned_to &&
                                    !members?.some(
                                      (member: { member_id: string }) =>
                                        member.member_id === item.assigned_to,
                                    ) && (
                                      <option value={item.assigned_to} disabled>
                                        Участник недоступен — выберите другого
                                      </option>
                                    )}
                                </select>
                              </label>
                            )}
                            <label className={styles.checkbox}>
                              <input
                                name="big"
                                type="checkbox"
                                defaultChecked={item.big_purchase}
                              />{' '}
                              Крупная покупка
                            </label>
                            <Button type="submit" variant="outline">
                              Сохранить
                            </Button>
                          </ShoppingEditForm>
                        </details>
                      </div>
                      <small className={styles.itemMeta}>
                        {item.preset_id
                          ? (presets?.find((preset) => preset.id === item.preset_id)?.name ??
                            'Без категории')
                          : item.category_id
                            ? (categories?.find((category) => category.id === item.category_id)
                                ?.name ?? 'Архивная категория')
                            : 'Без категории'}{' '}
                        · {item.planned_qty} {item.unit} ·{' '}
                        {item.planned_unit_price === null
                          ? 'Цена не указана'
                          : `${item.planned_unit_price} сум за единицу`}
                        {item.priority === 'urgent' && ' · Срочно'}
                        {item.big_purchase && ' · Крупная'}
                        {item.due_date && ` · До ${item.due_date}`}
                        {item.assigned_to &&
                          ` · ${members?.find((member: { member_id: string }) => member.member_id === item.assigned_to)?.display_name ?? 'Участник недоступен'}`}
                      </small>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className={styles.empty}>Список пока пуст. Добавьте первую покупку.</p>
            )}
          </>
        )}
      </section>
      {!categoriesError && (
        <section className={styles.panel}>
          <details className={styles.categories}>
            <summary>Свои категории</summary>
            <form action={saveShoppingCategory}>
              <input type="hidden" name="scope" value={selected} />
              <label>
                Название категории
                <input name="name" maxLength={80} required />
              </label>
              <label>
                Значок
                <select name="icon" defaultValue="shopping">
                  <option value="shopping">Покупки</option>
                  <option value="home">Дом</option>
                  <option value="notes">Записи</option>
                  <option value="goal">Цель</option>
                </select>
              </label>
              <label>
                Цвет
                <input name="color" type="color" defaultValue="#7d2944" />
              </label>
              <Button type="submit">Добавить категорию</Button>
            </form>
            {categories?.map((category) => (
              <div key={category.id} className={styles.categoryRow}>
                <span className={styles.categoryIcon}>
                  <span style={{ color: category.color ?? undefined }}>
                    <Icon
                      name={
                        (['shopping', 'home', 'notes', 'goal'].includes(category.icon)
                          ? category.icon
                          : 'shopping') as 'shopping' | 'home' | 'notes' | 'goal'
                      }
                      size={18}
                    />
                  </span>
                  {category.name}
                </span>
                <form action={saveShoppingCategory}>
                  <input type="hidden" name="scope" value={selected} />
                  <input type="hidden" name="id" value={category.id} />
                  <label>
                    Название категории
                    <input name="name" defaultValue={category.name} maxLength={80} required />
                  </label>
                  <label>
                    Значок
                    <select name="icon" defaultValue={category.icon}>
                      <option value="shopping">Покупки</option>
                      <option value="home">Дом</option>
                      <option value="notes">Записи</option>
                      <option value="goal">Цель</option>
                    </select>
                  </label>
                  <label>
                    Цвет
                    <input name="color" type="color" defaultValue={category.color ?? '#7d2944'} />
                  </label>
                  <Button type="submit" variant="outline">
                    Сохранить
                  </Button>
                </form>
                <form action={archiveShoppingCategory}>
                  <input type="hidden" name="scope" value={selected} />
                  <input type="hidden" name="id" value={category.id} />
                  <Button type="submit" variant="outline">
                    В архив
                  </Button>
                </form>
              </div>
            ))}
          </details>
        </section>
      )}
    </div>
  );
}
