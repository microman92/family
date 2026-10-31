import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

const cookieValues = vi.hoisted(() => new Map<string, string>());
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieValues.has(name) ? { value: cookieValues.get(name) } : undefined),
    set: (name: string, value: string) => cookieValues.set(name, value),
  }),
}));
import { beginTelegramBinding, finishTelegramBinding } from '@/server/auth/telegram-bind';

describe('Связывание Telegram с приглашением', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    cookieValues.clear();
  });

  it('различает отсутствие cookie и отказ Telegram без записи токенов', async () => {
    vi.stubEnv('TELEGRAM_OIDC_CLIENT_ID', 'test-client');
    vi.stubEnv('TELEGRAM_OIDC_CLIENT_SECRET', 'test-server-secret');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://family.example');
    await expect(finishTelegramBinding('code', 'x'.repeat(32))).rejects.toMatchObject({
      diagnostic: 'cookie_missing',
    });
    const authorization = new URL(await beginTelegramBinding('H'.repeat(32)));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 401 })),
    );
    await expect(
      finishTelegramBinding('code', authorization.searchParams.get('state')!),
    ).rejects.toMatchObject({ diagnostic: 'token_http_401' });
  });

  it('отклоняет неверный state и проверяет PKCE, nonce и подписанный токен', async () => {
    vi.stubEnv('TELEGRAM_OIDC_CLIENT_ID', 'test-client');
    vi.stubEnv('TELEGRAM_OIDC_CLIENT_SECRET', 'test-server-secret');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://family.example');
    const handoff = 'H'.repeat(32);
    const first = new URL(await beginTelegramBinding(handoff));
    expect(first.searchParams.get('redirect_uri')).toBe(
      'https://family.example/auth/telegram-bind/callback',
    );
    await expect(finishTelegramBinding('code', 'x'.repeat(32))).rejects.toThrow();

    const authorization = new URL(await beginTelegramBinding(handoff));
    const nonce = authorization.searchParams.get('nonce')!;
    const challenge = authorization.searchParams.get('code_challenge')!;
    const state = authorization.searchParams.get('state')!;
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
    const token = await new SignJWT({ id: '22222', nonce })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer('https://oauth.telegram.org')
      .setAudience('test-client')
      .setSubject('opaque-subject')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    const mockFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://oauth.telegram.org/token') {
        const form = new URLSearchParams(String(init?.body));
        expect(createHash('sha256').update(form.get('code_verifier')!).digest('base64url')).toBe(
          challenge,
        );
        expect(form.get('redirect_uri')).toBe('https://family.example/auth/telegram-bind/callback');
        return Response.json({ id_token: token });
      }
      if (url === 'https://oauth.telegram.org/.well-known/jwks.json')
        return Response.json({ keys: [jwk] });
      throw new Error('Unexpected external request');
    });
    vi.stubGlobal('fetch', mockFetch);
    expect(await finishTelegramBinding('one-time-code', state)).toEqual({
      subject: 'opaque-subject',
      telegramId: '22222',
      handoff,
    });
    await expect(finishTelegramBinding('one-time-code', state)).rejects.toThrow();
  });
});
