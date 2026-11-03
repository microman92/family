import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  write: vi.fn(),
  read: vi.fn(),
  actor: vi.fn(),
  family: vi.fn(),
  revalidate: vi.fn(),
  filter: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/server/access/index.server', () => ({
  AccessDeniedError: class extends Error {},
  getCurrentUser: mocks.actor,
  requireCurrentFamilyCapability: mocks.family,
}));
import { deleteShoppingItem } from '../../src/server/shopping/actions';
import { AccessDeniedError } from '@/server/access/index.server';

const writeQuery = {
  eq: mocks.filter,
  is: () => writeQuery,
  select: () => ({ maybeSingle: mocks.write }),
};
const readQuery = { eq: () => readQuery, maybeSingle: mocks.read };
const client = { from: () => ({ update: mocks.update, select: () => readQuery }) };
function form(scope = 'family') {
  const data = new FormData();
  data.set('id', '00000000-0000-4000-8000-000000000123');
  data.set('version', '3');
  data.set('scope', scope);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.filter.mockReturnValue(writeQuery);
  mocks.update.mockReturnValue(writeQuery);
  mocks.actor.mockResolvedValue({ client, user: { id: 'owner' } });
  mocks.family.mockResolvedValue({ familyId: 'current-family' });
  mocks.write.mockResolvedValue({ data: { id: 'item' }, error: null });
  mocks.read.mockResolvedValue({ data: null, error: null });
});
describe('Удаление покупки', () => {
  it('отмечает удаление с проверкой текущей семьи и версии', async () => {
    expect((await deleteShoppingItem({}, form())).message).toBe('Позиция удалена.');
    expect(mocks.update).toHaveBeenCalledWith({ deleted_at: expect.any(String), version: 4 });
    expect(mocks.filter).toHaveBeenCalledWith('version', 3);
    expect(mocks.filter).toHaveBeenCalledWith('family_id', 'current-family');
  });
  it('ограничивает личное удаление текущим владельцем', async () => {
    await deleteShoppingItem({}, form('private'));
    expect(mocks.filter).toHaveBeenCalledWith('owner_user_id', 'owner');
    expect(mocks.family).not.toHaveBeenCalled();
  });
  it('сохраняет изменённую позицию при устаревшей версии', async () => {
    mocks.write.mockResolvedValue({ data: null, error: null });
    mocks.read.mockResolvedValue({ data: { deleted_at: null }, error: null });
    expect((await deleteShoppingItem({}, form())).error).toContain('изменилась');
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it('подтверждает повтор удаления уже скрытой позиции', async () => {
    mocks.write.mockResolvedValue({ data: null, error: null });
    mocks.read.mockResolvedValue({ data: { deleted_at: new Date().toISOString() }, error: null });
    expect((await deleteShoppingItem({}, form())).message).toBe('Позиция удалена.');
  });
  it('отклоняет неверные поля до обращения к данным', async () => {
    expect((await deleteShoppingItem({}, new FormData())).error).toBeTruthy();
    expect((await deleteShoppingItem({}, form('other'))).error).toBeTruthy();
    expect(mocks.actor).not.toHaveBeenCalled();
  });
  it('обрабатывает отказ доступа и ошибку базы', async () => {
    mocks.actor.mockRejectedValueOnce(new AccessDeniedError());
    expect((await deleteShoppingItem({}, form())).error).toContain('Нет доступа');
    mocks.write.mockResolvedValue({ data: null, error: { code: '42501' } });
    expect((await deleteShoppingItem({}, form())).message).toBeUndefined();
  });
});
