import { NextResponse, type NextRequest } from 'next/server';
import { createAuthClient, getSupabaseConfig } from '@/server/auth/index.server';
import { safeAuthDestination } from '@/shared/lib/auth';
import { getRememberedInvite } from '@/server/auth/invite-cookie';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const next =
    (await getRememberedInvite()) ?? safeAuthDestination(request.nextUrl.searchParams.get('next'));
  if (code && getSupabaseConfig()) {
    const client = await createAuthClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) {
      const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000').origin;
      const response = NextResponse.redirect(new URL(next, origin));
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
