import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const invite = '/invite/' + 'a'.repeat(32);
vi.mock('@/server/auth/invite-cookie', () => ({ getRememberedInvite: async () => invite }));
vi.mock('@/server/auth/index.server', () => ({
  createAuthClient: vi.fn(),
  finishTelegramBinding: vi.fn(),
}));
import { GET } from '../../app/auth/telegram-bind/callback/route';

describe('Ошибка подтверждения Telegram', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('возвращает пользователя к исходному приглашению', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://family.example');
    const response = await GET(
      new NextRequest('https://family.example/auth/telegram-bind/callback'),
    );
    const destination = new URL(response.headers.get('location')!);
    expect(destination.pathname).toBe(invite);
    expect(destination.searchParams.get('error')).toBe('telegram');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });
});
