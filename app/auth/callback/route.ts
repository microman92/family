import { NextResponse, type NextRequest } from 'next/server';
import { createAuthClient, getSupabaseConfig } from '@/server/auth/index.server';
import { safeAuthDestination } from '@/shared/lib/auth';
import { getRememberedInvite } from '@/server/auth/invite-cookie';
import { needsPasswordLogin } from '@/server/auth/password-login';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const next =
    (await getRememberedInvite()) ?? safeAuthDestination(request.nextUrl.searchParams.get('next'));
  if (code && getSupabaseConfig()) {
    const client = await createAuthClient();
    const { data: sessionData, error } = await client.auth.exchangeCodeForSession(code);
    if (!error) {
      const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000').origin;
      if (
        request.nextUrl.searchParams.get('registered') === 'email' &&
        !next.startsWith('/invite/')
      ) {
        const { error: signOutError } = await client.auth.signOut({ scope: 'local' });
        const response = NextResponse.redirect(
          new URL(signOutError ? '/login?error=callback' : '/login?registered=confirmed', origin),
        );
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
      }
      const user = sessionData?.user;
      const destination =
        user && (await needsPasswordLogin(user))
          ? `/account-access?next=${encodeURIComponent(next)}`
          : next;
      const response = NextResponse.redirect(new URL(destination, origin));
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    }
  }
  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000').origin;
  const login = new URL('/login', origin);
  login.searchParams.set('error', 'callback');
  if (next.startsWith('/invite/')) login.searchParams.set('next', next);
  const response = NextResponse.redirect(login);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
