import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const savedInvite = vi.hoisted(() => ({ value: null as string | null }));
const exchangeCode = vi.hoisted(() => vi.fn());
vi.mock('@/server/auth/invite-cookie', () => ({
  getRememberedInvite: async () => savedInvite.value,
  clearRememberedInvite: async () => {
    savedInvite.value = null;
  },
}));
vi.mock('@/server/auth/index.server', () => ({
  getSupabaseConfig: () => ({ url: 'https://supabase.test', key: 'test' }),
  createAuthClient: async () => ({
    auth: { exchangeCodeForSession: exchangeCode },
  }),
}));
import { GET } from '../../app/auth/callback/route';

describe('Возврат после входа по приглашению', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    savedInvite.value = null;
    exchangeCode.mockReset();
  });
  it('возвращает к приглашению после успешного входа и сохраняет его до вступления', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://family.example');
    const invite = '/invite/' + 'a'.repeat(32);
    savedInvite.value = invite;
    exchangeCode.mockResolvedValue({ error: null });
    const result = await GET(new NextRequest('https://family.example/auth/callback?code=valid'));
    expect(new URL(result.headers.get('location')!).pathname).toBe(invite);
    expect(savedInvite.value).toBe(invite);
  });
  it('сохраняет приглашение после сбоя входа даже при точном callback без параметров', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://family.example');
    const invite = '/invite/' + 'a'.repeat(32);
    savedInvite.value = invite;
    exchangeCode.mockResolvedValue({ error: new Error('expired') });
    const result = await GET(new NextRequest('https://family.example/auth/callback?code=expired'));
    const destination = new URL(result.headers.get('location')!);
    expect(destination.searchParams.get('next')).toBe(invite);
    expect(savedInvite.value).toBe(invite);
  });
  it('сохраняет приглашение, если завершить вход не удалось', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://family.example');
    exchangeCode.mockResolvedValue({ error: new Error('expired') });
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
