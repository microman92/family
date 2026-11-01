import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  user: { id: 'authenticated-user' } as { id: string } | null,
  member: null as { role: string; family_id: string } | null,
  rpc: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/server/auth/config', () => ({
  getSupabaseConfig: () => ({ url: 'https://example.invalid', key: 'key' }),
  getTelegramBotUsername: () => 'family_test_bot',
  isTelegramInviteConfigured: () => true,
}));
vi.mock('@/server/auth/client', () => ({
  createAuthClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    rpc: state.rpc,
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: state.member, error: null }),
      };
      return query;
    },
  }),
}));
import { addChild, changeMemberRole, createInvite, revokeInvite } from '@/server/auth/actions';

beforeEach(() => {
  state.user = { id: 'authenticated-user' };
  state.member = null;
  state.rpc.mockReset().mockResolvedValue({ error: null });
});

describe('Защита действий администратора', () => {
  const memberId = '11111111-1111-4111-8111-111111111111';
  it.each(['member', 'child'])('не позволяет роли %s управлять семьёй', async (role) => {
    state.member = { role, family_id: 'family-a' };
    const invite = new FormData();
    invite.set('role', 'member');
    expect(await createInvite({}, invite)).toHaveProperty('error');
    const child = new FormData();
    child.set('name', 'Ребёнок');
    expect(await addChild({}, child)).toHaveProperty('error');
    const roleForm = new FormData();
    roleForm.set('role', 'admin');
    expect(await changeMemberRole(memberId, {}, roleForm)).toHaveProperty('error');
    const revoke = new FormData();
    revoke.set('id', memberId);
    await expect(revokeInvite(revoke)).rejects.toThrow('Access denied');
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it('отклоняет потерявшего членство и допускает администратора', async () => {
    const form = new FormData();
    form.set('name', 'Ребёнок');
    expect(await addChild({}, form)).toHaveProperty('error');
    expect(state.rpc).not.toHaveBeenCalled();
    state.member = { role: 'admin', family_id: 'family-a' };
    expect(await addChild({}, form)).toHaveProperty('message');
    expect(state.rpc).toHaveBeenCalledWith('add_child_profile', { profile_name: 'Ребёнок' });
  });
  it('не выполняет административное действие без проверенной сессии', async () => {
    state.user = null;
    state.member = { role: 'admin', family_id: 'family-a' };
    const form = new FormData();
    form.set('name', 'Ребёнок');
    expect(await addChild({}, form)).toHaveProperty('error');
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it('сохраняет доступ администратора к приглашению, отзыву и изменению роли', async () => {
    state.member = { role: 'admin', family_id: 'family-a' };
    const invite = new FormData();
    invite.set('role', 'member');
    const result = await createInvite({}, invite);
    expect(result.url).toMatch(/^https:\/\/t\.me\/family_test_bot\?start=invite_[\w-]{32}$/);
    expect(result.qr).toMatch(/^data:image\/png;base64,/);
    expect(state.rpc).toHaveBeenCalledWith('create_family_invite', {
      invite_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      invite_role: 'member',
    });
    const revoke = new FormData();
    revoke.set('id', memberId);
    await revokeInvite(revoke);
    expect(state.rpc).toHaveBeenCalledWith('revoke_family_invite', { invite_id: memberId });
    const roleForm = new FormData();
    roleForm.set('role', 'member');
    expect(await changeMemberRole(memberId, {}, roleForm)).toHaveProperty('message');
    expect(state.rpc).toHaveBeenCalledWith('change_family_member_role', {
      target_member: memberId,
      new_role: 'member',
    });
  });
});
