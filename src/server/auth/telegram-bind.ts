import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';

const cookieName = '__Secure-family-telegram-bind';
const claimsSchema = z.object({
  state: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  handoff: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
  issuedAt: z.number().int(),
});
const telegramKeys = createRemoteJWKSet(
  new URL('https://oauth.telegram.org/.well-known/jwks.json'),
);

export class TelegramBindingError extends Error {
  constructor(
    readonly diagnostic: string,
    message: string,
  ) {
    super(message);
    this.name = 'TelegramBindingError';
  }
}

function signature(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export async function beginTelegramBinding(handoff: string) {
  const clientId = process.env.TELEGRAM_OIDC_CLIENT_ID;
  const secret = process.env.TELEGRAM_OIDC_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!clientId || !secret || !appUrl || !/^[A-Za-z0-9_-]{32}$/.test(handoff))
    throw new Error('Telegram не настроен');
  const state = randomBytes(24).toString('base64url');
  const nonce = randomBytes(24).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const payload = Buffer.from(
    JSON.stringify({ state, nonce, verifier, handoff, issuedAt: Date.now() }),
  ).toString('base64url');
  const store = await cookies();
  store.set(cookieName, `${payload}.${signature(payload, secret)}`, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/auth/telegram-bind',
    maxAge: 300,
  });
  const url = new URL('https://oauth.telegram.org/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: new URL('/auth/telegram-bind/callback', appUrl).toString(),
    response_type: 'code',
    scope: 'openid profile',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

export async function finishTelegramBinding(code: string, receivedState: string) {
  const clientId = process.env.TELEGRAM_OIDC_CLIENT_ID;
  const secret = process.env.TELEGRAM_OIDC_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!clientId || !secret || !appUrl || !code || code.length > 4096)
    throw new TelegramBindingError('configuration', 'Не удалось подтвердить Telegram');
  const store = await cookies();
  const cookie = store.get(cookieName)?.value;
  store.set(cookieName, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/auth/telegram-bind',
    maxAge: 0,
  });
  const [payload, mac, extra] = cookie?.split('.') ?? [];
  if (
    !payload ||
    !mac ||
    extra ||
    !/^[A-Za-z0-9_-]+$/.test(payload) ||
    !/^[A-Za-z0-9_-]+$/.test(mac)
  )
    throw new TelegramBindingError(
      cookie ? 'cookie_format' : 'cookie_missing',
      'Ссылка подтверждения недействительна',
    );
  const expectedMac = Buffer.from(signature(payload, secret));
  const actualMac = Buffer.from(mac);
  if (expectedMac.length !== actualMac.length || !timingSafeEqual(expectedMac, actualMac))
    throw new TelegramBindingError('cookie_signature', 'Ссылка подтверждения недействительна');
  const parsed = claimsSchema.safeParse(
    JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
  );
  if (
    !parsed.success ||
    !/^[A-Za-z0-9_-]{32}$/.test(receivedState) ||
    !timingSafeEqual(Buffer.from(parsed.data.state), Buffer.from(receivedState)) ||
    parsed.data.issuedAt > Date.now() + 30_000 ||
    Date.now() - parsed.data.issuedAt > 300_000
  )
    throw new TelegramBindingError('state_or_expiry', 'Ссылка подтверждения истекла');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: new URL('/auth/telegram-bind/callback', appUrl).toString(),
    client_id: clientId,
    code_verifier: parsed.data.verifier,
  });
  let response: Response;
  try {
    response = await fetch('https://oauth.telegram.org/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new TelegramBindingError('token_network', 'Telegram не подтвердил вход');
  }
  if (!response.ok)
    throw new TelegramBindingError(`token_http_${response.status}`, 'Telegram не подтвердил вход');
  const tokenResponse = z
    .object({ id_token: z.string().min(1).max(16_384) })
    .safeParse(await response.json());
  if (!tokenResponse.success)
    throw new TelegramBindingError('token_response', 'Telegram не подтвердил вход');
  const verified = await verifyTelegramIdToken(
    tokenResponse.data.id_token,
    clientId,
    parsed.data.nonce,
    telegramKeys,
  );
  return { ...verified, handoff: parsed.data.handoff };
}

export async function verifyTelegramIdToken(
  token: string,
  clientId: string,
  nonce: string,
  keys: JWTVerifyGetKey,
) {
  let verified;
  try {
    ({ payload: verified } = await jwtVerify(token, keys, {
      issuer: 'https://oauth.telegram.org',
      audience: clientId,
      algorithms: ['RS256'],
      requiredClaims: ['iss', 'aud', 'sub', 'exp', 'iat'],
      maxTokenAge: '5m',
    }));
  } catch {
    throw new TelegramBindingError('token_signature_or_claims', 'Telegram не подтвердил аккаунт');
  }
  if (verified.nonce !== nonce)
    throw new TelegramBindingError('token_nonce', 'Telegram не подтвердил аккаунт');
  if (typeof verified.sub !== 'string' || verified.sub.length === 0 || verified.sub.length > 255)
    throw new TelegramBindingError('token_subject_invalid', 'Telegram не подтвердил аккаунт');
  if (verified.id === undefined || verified.id === null)
    throw new TelegramBindingError('token_id_missing', 'Telegram не подтвердил аккаунт');
  const telegramId =
    typeof verified.id === 'number' && Number.isSafeInteger(verified.id) && verified.id > 0
      ? String(verified.id)
      : typeof verified.id === 'string' &&
          /^[1-9][0-9]{0,15}$/.test(verified.id) &&
          BigInt(verified.id) <= BigInt(Number.MAX_SAFE_INTEGER)
        ? verified.id
        : null;
  if (!telegramId)
    throw new TelegramBindingError('token_id_invalid', 'Telegram не подтвердил аккаунт');
  return { subject: verified.sub, telegramId };
}
