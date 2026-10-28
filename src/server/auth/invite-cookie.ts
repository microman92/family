import 'server-only';
import { cookies } from 'next/headers';

const cookieName = 'family-invite-return';
const invitePattern = /^\/invite\/[A-Za-z0-9_-]{32}$/;

export async function rememberInvite(destination: string) {
  if (!invitePattern.test(destination)) return false;
  const store = await cookies();
  const secure = (process.env.NEXT_PUBLIC_APP_URL || '').startsWith('https://');
  store.set(cookieName, destination, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 900,
  });
  return true;
}

export async function getRememberedInvite() {
  const store = await cookies();
  const value = store.get(cookieName)?.value;
  return value && invitePattern.test(value) ? value : null;
}

export async function clearRememberedInvite() {
  const store = await cookies();
  store.delete(cookieName);
}
