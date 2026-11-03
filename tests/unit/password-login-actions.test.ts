import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  telegram: true,
  reserved: false,
  update: vi.fn(),
  insert: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/server/access/index.server', () => ({
  getCurrentUser: async () => ({
    client: { auth: { signInWithPassword: async () => ({ error: null }) } },
    user: {
      id: 'verified-user',
      identities: state.telegram ? [{ provider: 'custom:telegram' }] : [],
    },
  }),
}));
vi.mock('@/server/auth/password-login', () => ({
  isTelegramUser: (user: { identities: { provider: string }[] }) =>
    user.identities.some((identity) => identity.provider === 'custom:telegram'),
  passwordLoginAdmin: () => ({
    auth: { admin: { updateUserById: state.update } },
    from: () => {
      const query = {
        insert: async (input: unknown) => {
          state.insert(input);
          return { error: state.reserved ? { code: '23505' } : null };
        },
        update: () => query,
        eq: () => query,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ error: null }).then(resolve),
      };
      return query;
    },
  }),
}));
import { generatePasswordLogin } from '@/server/auth/password-actions';

beforeEach(() => {
  state.telegram = true;
  state.reserved = false;
  state.update.mockReset().mockResolvedValue({ error: null });
  state.insert.mockReset();
});
describe('Выдача дополнительных данных входа', () => {
  it('выдаёт пароль только подтверждённому Telegram-пользователю и сохраняет в таблице только логин', async () => {
    const result = await generatePasswordLogin();
    expect(result.username).toMatch(/^family_[a-f0-9]{16}$/);
    expect(result.password?.length).toBeGreaterThanOrEqual(24);
    expect(state.insert).toHaveBeenCalledWith({
      user_id: 'verified-user',
      username: result.username,
    });
    expect(state.update).toHaveBeenCalledWith('verified-user', {
      password: result.password,
      email: 'verified-user@accounts.family.invalid',
      email_confirm: true,
    });
  });
  it('не меняет пароль повторно и не выдаёт его аккаунту без Telegram', async () => {
    state.reserved = true;
    expect((await generatePasswordLogin()).error).toBeDefined();
    expect(state.update).not.toHaveBeenCalled();
    state.telegram = false;
    expect((await generatePasswordLogin()).error).toBeDefined();
    expect(state.update).not.toHaveBeenCalled();
  });
});
