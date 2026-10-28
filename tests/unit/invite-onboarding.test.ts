import { describe, expect, it, vi } from 'vitest';

const invite = '/invite/' + 'a'.repeat(32);
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock('@/_pages/access', () => ({ AccessPage: () => null }));
vi.mock('@/server/auth/invite-cookie', () => ({ getRememberedInvite: async () => invite }));
vi.mock('@/server/auth/index.server', () => ({
  getSupabaseConfig: () => ({ url: 'https://supabase.test', key: 'test' }),
  createFamily: () => {},
  createAuthClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'test-user' } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    }),
  }),
}));
import Page from '../../app/(auth)/onboarding/page';

describe('Создание семьи и ожидающее приглашение', () => {
  it('возвращает приглашённого к приглашению, вместо создания семьи', async () => {
    await expect(Page()).rejects.toThrow(`redirect:${invite}`);
  });
});
