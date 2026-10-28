import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock('@/_pages/access', () => ({ AccessPage: () => null }));
vi.mock('@/server/auth/index.server', () => ({
  getSupabaseConfig: () => ({ url: 'https://supabase.test', key: 'test' }),
  createAuthClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user' } }, error: null }) },
  }),
  authenticate: () => {},
  authenticateForInvite: () => {},
  signInTelegram: () => {},
  signInTelegramForInvite: () => {},
}));
import Page from '../../app/(auth)/login/page';

describe('Вход по приглашению', () => {
  it('возвращает уже авторизованного пользователя к приглашению', async () => {
    await expect(
      Page({ searchParams: Promise.resolve({ next: '/invite/test-token' }) }),
    ).rejects.toThrow('redirect:/invite/test-token');
  });
  it('не перенаправляет на внешний сайт', async () => {
    await expect(
      Page({ searchParams: Promise.resolve({ next: 'https://example.com' }) }),
    ).rejects.toThrow('redirect:/onboarding');
  });
});
