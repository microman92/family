import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  read: vi.fn(),
  actor: vi.fn(),
  family: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/server/access/index.server', () => ({
  AccessDeniedError: class extends Error {},
  getCurrentUser: mocks.actor,
  requireCurrentFamilyCapability: mocks.family,
}));
import { addShoppingPosition } from '../../src/server/shopping/actions';

const id = '00000000-0000-4000-8000-000000000123';
const client = {
  from: vi.fn(() => ({
    insert: mocks.insert,
    select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }),
  })),
};
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    scope: 'family',
    requestId: id,
    category: 'preset:food',
    title: 'Картошка',
    qty: '2.5',
    unit: 'кг',
  }))
    data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ client, user: { id: 'owner' } });
  mocks.family.mockResolvedValue({ familyId: 'family' });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.read.mockResolvedValue({ data: null, error: null });
});
describe('Добавление позиции', () => {
  it('сохраняет категорию, дробное количество и неизвестную цену', async () => {
    expect(await addShoppingPosition({}, form())).toEqual({ message: 'Позиция добавлена.' });
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id,
        preset_id: 'food',
        planned_qty: '2.5',
        planned_unit_price: null,
        unit: 'кг',
        family_id: 'family',
        owner_user_id: null,
      }),
    );
  });
  it('повторяет тот же запрос без создания второй позиции', async () => {
    await addShoppingPosition({}, form());
    const original = mocks.insert.mock.calls[0]?.[0];
    mocks.insert.mockResolvedValue({ error: { code: '23505' } });
    mocks.read.mockResolvedValue({ data: { ...original, planned_qty: '2.500' }, error: null });
    expect(await addShoppingPosition({}, form())).toEqual({ message: 'Позиция добавлена.' });
  });
  it('не считает другую запись успешным повтором', async () => {
    mocks.insert.mockResolvedValue({ error: { code: '23505' } });
    mocks.read.mockResolvedValue({ data: { title: 'Другое' }, error: null });
    expect((await addShoppingPosition({}, form())).error).toBeTruthy();
  });
  it('нормализует категорию и цену с ведущими нулями для повторного запроса', async () => {
    const data = form();
    data.set('price', '00012000');
    data.set('category', 'PRESET:FOOD');
    await addShoppingPosition({}, data);
    const original = mocks.insert.mock.calls[0]?.[0];
    expect(original).toMatchObject({ planned_unit_price: '12000', preset_id: 'food' });
    mocks.insert.mockResolvedValue({ error: { code: '23505' } });
    mocks.read.mockResolvedValue({ data: { ...original, planned_unit_price: 12000 }, error: null });
    expect((await addShoppingPosition({}, data)).message).toBe('Позиция добавлена.');
  });
  it('проверяет обязательную категорию и идентификатор до записи', async () => {
    const data = form();
    data.delete('category');
    expect((await addShoppingPosition({}, data)).error).toBeTruthy();
    data.set('category', 'preset:food');
    data.set('requestId', 'invalid');
    expect((await addShoppingPosition({}, data)).error).toBeTruthy();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('сохраняет личную позицию только за текущим пользователем', async () => {
    const data = form();
    data.set('scope', 'private');
    await addShoppingPosition({}, data);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ family_id: null, owner_user_id: 'owner' }),
    );
    expect(mocks.family).not.toHaveBeenCalled();
  });
  it('возвращает ошибку базы без ложного подтверждения', async () => {
    mocks.insert.mockResolvedValue({ error: { code: '23514' } });
    const result = await addShoppingPosition({}, form());
    expect(result.error).toBeTruthy();
    expect(result.message).toBeUndefined();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
