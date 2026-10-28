import { describe, expect, it, vi } from 'vitest';
import { generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';

vi.mock('server-only', () => ({}));
import { verifyTelegramIdToken } from '@/server/auth/telegram-bind';

describe('Подтверждение Telegram OIDC', () => {
  it('проверяет подпись, issuer, audience, nonce и срок; subject и Telegram ID различны', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const keys: JWTVerifyGetKey = async () => publicKey;
    const token = await new SignJWT({ id: 22222, nonce: 'expected-nonce' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://oauth.telegram.org')
      .setAudience('bot-client-id')
      .setSubject('opaque-subject')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    expect(await verifyTelegramIdToken(token, 'bot-client-id', 'expected-nonce', keys)).toEqual({
      subject: 'opaque-subject',
      telegramId: '22222',
    });
    await expect(
      verifyTelegramIdToken(token, 'another-client', 'expected-nonce', keys),
    ).rejects.toThrow();
    await expect(
      verifyTelegramIdToken(token, 'bot-client-id', 'wrong-nonce', keys),
    ).rejects.toThrow();
    const wrongIssuer = await new SignJWT({ id: 22222, nonce: 'expected-nonce' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://example.invalid')
      .setAudience('bot-client-id')
      .setSubject('opaque-subject')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    await expect(
      verifyTelegramIdToken(wrongIssuer, 'bot-client-id', 'expected-nonce', keys),
    ).rejects.toThrow();
    await expect(
      verifyTelegramIdToken(`${token}x`, 'bot-client-id', 'expected-nonce', keys),
    ).rejects.toThrow();
    const expired = await new SignJWT({ id: 22222, nonce: 'expected-nonce' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://oauth.telegram.org')
      .setAudience('bot-client-id')
      .setSubject('opaque-subject')
      .setIssuedAt()
      .setExpirationTime('1 second ago')
      .sign(privateKey);
    await expect(
      verifyTelegramIdToken(expired, 'bot-client-id', 'expected-nonce', keys),
    ).rejects.toThrow();
  });
});
