import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  user: { id: 'authenticated-user' } as { id: string } | null,
  member: null as { role: string; family_id?: string } | null,
  filters: [] as [string, string][],
}));
vi.mock('server-only', () => ({}));
vi.mock('@/server/auth/client', () => ({
  createAuthClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    from: () => {
      const query = {
        select: () => query,
        eq: (column: string, value: string) => {
          state.filters.push([column, value]);
          return query;
        },
        maybeSingle: async () => ({ data: state.member, error: null }),
      };
      return query;
    },
  }),
}));
import {
  assertRecordScope,
  getCurrentUser,
  requireCapability,
  requireCurrentFamilyCapability,
} from '@/server/access/index.server';
import type { Scope } from '@/server/modules/access/domain/scope';

beforeEach(() => {
  state.user = { id: 'authenticated-user' };
  state.member = null;
  state.filters = [];
});

describe('Серверные проверки доступа', () => {
  it('не принимает отсутствующую сессию', async () => {
    state.user = null;
    await expect(getCurrentUser()).rejects.toThrow('Access denied');
  });
  it('проверяет актуальное членство пользователя из сессии и право роли', async () => {
    await expect(requireCapability('family-a', 'finance.read')).rejects.toThrow('Access denied');
    expect(state.filters).toEqual([
      ['family_id', 'family-a'],
      ['user_id', 'authenticated-user'],
      ['status', 'active'],
    ]);
    state.member = { role: 'child' };
    await expect(requireCapability('family-a', 'finance.read')).rejects.toThrow('Access denied');
    state.member = { role: 'member' };
    await expect(requireCapability('family-a', 'finance.read')).resolves.toMatchObject({
      role: 'member',
    });
    await expect(requireCapability('family-a', 'family.manage')).rejects.toThrow('Access denied');
    state.member = { role: 'unknown' };
    await expect(requireCapability('family-a', 'finance.read')).rejects.toThrow('Access denied');
  });
  it('оставляет личное пространство только владельцу независимо от членства', async () => {
    await expect(
      assertRecordScope({ visibility: 'private', ownerUserId: 'authenticated-user' }),
    ).resolves.toBeDefined();
    await expect(
      assertRecordScope({ visibility: 'private', ownerUserId: 'another-user' }),
    ).rejects.toThrow('Access denied');
    await expect(assertRecordScope({ visibility: 'family', familyId: 'family-a' })).rejects.toThrow(
      'Access denied',
    );
    await expect(
      assertRecordScope({
        visibility: 'unexpected',
        ownerUserId: 'authenticated-user',
      } as unknown as Scope),
    ).rejects.toThrow('Access denied');
  });
  it('получает текущую семью из базы и запрещает администрирование участнику или ребёнку', async () => {
    state.member = { role: 'member', family_id: 'family-a' };
    await expect(requireCurrentFamilyCapability('family.manage')).rejects.toThrow('Access denied');
    expect(state.filters).toEqual([
      ['user_id', 'authenticated-user'],
      ['status', 'active'],
    ]);
    state.member = { role: 'child', family_id: 'family-a' };
    await expect(requireCurrentFamilyCapability('family.manage')).rejects.toThrow('Access denied');
    state.member = { role: 'admin', family_id: 'family-a' };
    await expect(requireCurrentFamilyCapability('family.manage')).resolves.toMatchObject({
      familyId: 'family-a',
    });
    state.member = { role: 'admin' };
    await expect(requireCurrentFamilyCapability('family.manage')).rejects.toThrow('Access denied');
  });
});
