import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAuthClient } from '@/server/auth/index.server';

const invite = '/invite/' + 'a'.repeat(32);
const state = vi.hoisted(() => ({ invite: null as string | null }));
vi.mock('@/server/auth/invite-cookie', () => ({ getRememberedInvite: async () => state.invite }));
vi.mock('@/server/auth/index.server', () => ({
  createAuthClient: vi.fn(),
  finishTelegramBinding: vi.fn(),
}));
import { GET } from '../../app/auth/telegram-bind/callback/route';

describe('Ошибка подтверждения Telegram', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    state.invite = null;
  });
  it('возвращает пользователя к исходному приглашению', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://family.example');
    state.invite = invite;
    const response = await GET(
      new NextRequest('https://family.example/auth/telegram-bind/callback'),
    );
    const destination = new URL(response.headers.get('location')!);
    expect(destination.pathname).toBe(invite);
    expect(destination.searchParams.get('error')).toBe('telegram');
    expect(destination.searchParams.get('reason')).toBe('callback');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });
  it('останавливает цикл входа, если приглашение потеряно', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://family.example');
    const response = await GET(
      new NextRequest('https://family.example/auth/telegram-bind/callback'),
    );
    const destination = new URL(response.headers.get('location')!);
    expect(destination.pathname).toBe('/invite/expired');
    expect(destination.searchParams.get('error')).toBe('lost');
  });
  it('при потере сессии сохраняет приглашение и показывает ошибку входа', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://family.example');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.example');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'test');
    state.invite = invite;
    vi.mocked(createAuthClient).mockResolvedValueOnce({
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    } as unknown as Awaited<ReturnType<typeof createAuthClient>>);
    const response = await GET(
      new NextRequest('https://family.example/auth/telegram-bind/callback?code=test&state=test'),
    );
    const destination = new URL(response.headers.get('location')!);
    expect(destination.pathname).toBe('/login');
    expect(destination.searchParams.get('next')).toBe(invite);
    expect(destination.searchParams.get('error')).toBe('callback');
  });
});
