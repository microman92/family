import { afterEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ cookie: null as string | null, options: null as unknown }));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    set: (_name: string, value: string) => {
      session.cookie = value;
    },
    get: () => (session.cookie ? { value: session.cookie } : undefined),
    delete: () => {
      session.cookie = null;
    },
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock('@/server/auth/client', () => ({
  createAuthClient: async () => ({
    auth: {
      signInWithOAuth: async (options: unknown) => {
        session.options = options;
        return { data: { url: 'https://auth.example/start' }, error: null };
      },
    },
  }),
}));
vi.mock('@/server/auth/config', () => ({
  getSupabaseConfig: () => ({ url: 'https://supabase.example', key: 'key' }),
}));
import { signInTelegramForInvite } from '@/server/auth/actions';

describe('Telegram-вход по семейному приглашению', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    session.cookie = null;
    session.options = null;
  });
  it('сохраняет приглашение и передаёт Supabase точный адрес callback', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://family.example');
    const invite = '/invite/' + 'a'.repeat(32);
    await expect(signInTelegramForInvite(invite)).rejects.toThrow(
      'redirect:https://auth.example/start',
    );
    expect(session.cookie).toBe(invite);
    expect(session.options).toEqual({
      provider: 'custom:telegram',
      options: { redirectTo: 'https://family.example/auth/callback' },
    });
  });
  it('отклоняет внешние и повреждённые адреса', async () => {
    expect(await signInTelegramForInvite('https://example.com')).toMatchObject({
      error: expect.any(String),
    });
    expect(session.cookie).toBeNull();
  });
});
