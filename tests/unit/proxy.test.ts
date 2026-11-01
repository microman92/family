import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  claims: null as { sub: string } | null,
  error: null as Error | null,
  refresh: false,
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: { cookies: { setAll: (values: unknown[], headers: Record<string, string>) => void } },
  ) => ({
    auth: {
      getClaims: async () => {
        if (state.refresh)
          options.cookies.setAll(
            [{ name: 'session', value: 'refreshed', options: { httpOnly: true, path: '/' } }],
            {},
          );
        return { data: state.claims ? { claims: state.claims } : null, error: state.error };
      },
    },
  }),
}));
import { proxy } from '../../proxy';

afterEach(() => {
  vi.unstubAllEnvs();
  state.claims = null;
  state.error = null;
  state.refresh = false;
});
const request = (path: string) => new NextRequest(`https://family.example${path}`);

describe('Защита маршрутов', () => {
  it('перенаправляет гостя с закрытых страниц и не доверяет cookie без проверки', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.example');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test');
    for (const path of [
      '/',
      '/dashboard',
      '/family',
      '/finance/transactions',
      '/onboarding',
      '/does-not-exist',
    ]) {
      const result = await proxy(request(path));
      expect(result.status).toBe(307);
      expect(new URL(result.headers.get('location')!).pathname).toBe('/login');
    }
    expect((await proxy(request('/api/private'))).status).toBe(401);
  });
  it('оставляет доступными страницы входа, восстановления, приглашений и webhook', async () => {
    for (const path of [
      '/login',
      '/register',
      '/reset-password',
      '/update-password',
      '/help/access',
      '/invite/token',
      '/auth/callback',
      '/auth/telegram-bind/callback',
      '/api/telegram/webhook',
    ]) {
      expect((await proxy(request(path))).status).toBe(200);
    }
    expect((await proxy(request('/login/extra'))).status).toBe(307);
    expect((await proxy(request('/api/telegram/webhook/extra'))).status).toBe(401);
  });
  it('не открывает закрытые страницы без настроенного Supabase', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    expect((await proxy(request('/dashboard'))).status).toBe(307);
    expect((await proxy(request('/api/private'))).status).toBe(401);
  });
  it('пропускает проверенную сессию и сохраняет обновлённые cookies при отказе', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.example');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test');
    state.claims = { sub: 'user-id' };
    expect((await proxy(request('/dashboard'))).status).toBe(200);
    state.claims = null;
    state.error = new Error('invalid');
    state.refresh = true;
    const denied = await proxy(request('/family'));
    expect(denied.status).toBe(307);
    expect(denied.cookies.get('session')?.value).toBe('refreshed');
  });
});
