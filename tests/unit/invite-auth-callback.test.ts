import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/server/auth/index.server', () => ({
  getSupabaseConfig: () => ({ url: 'https://supabase.test', key: 'test' }),
  createAuthClient: async () => ({
    auth: { exchangeCodeForSession: async () => ({ error: new Error('expired') }) },
  }),
}));
import { GET } from '../../app/auth/callback/route';

describe('Возврат после входа по приглашению', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('сохраняет приглашение, если завершить вход не удалось', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://family.example');
    const result = await GET(
      new NextRequest(
        'https://family.example/auth/callback?code=expired&next=%2Finvite%2Ftest-token',
      ),
    );
    const destination = new URL(result.headers.get('location')!);
    expect(destination.pathname).toBe('/login');
    expect(destination.searchParams.get('error')).toBe('callback');
    expect(destination.searchParams.get('next')).toBe('/invite/test-token');
    expect(result.headers.get('cache-control')).toBe('private, no-store');
  });
});
