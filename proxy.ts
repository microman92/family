import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const publicPages = new Set([
  '/login',
  '/register',
  '/reset-password',
  '/update-password',
  '/help/access',
]);

function isPublic(path: string) {
  return (
    publicPages.has(path) ||
    path === '/auth/callback' ||
    path === '/auth/telegram-bind/callback' ||
    path === '/api/telegram/webhook' ||
    path.startsWith('/invite/')
  );
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const publicRoute = isPublic(path);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    if (publicRoute) return NextResponse.next();
    if (path.startsWith('/api/'))
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.redirect(new URL('/login', request.url));
  }
  let response = NextResponse.next({ request });
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of values) response.cookies.set(name, value, options);
        for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
      },
    },
  });
  const { data, error } = await client.auth.getClaims();
  if (!publicRoute && (error || !data?.claims?.sub)) {
    const denied = path.startsWith('/api/')
      ? NextResponse.json({ error: 'Authentication required' }, { status: 401 })
      : NextResponse.redirect(new URL('/login', request.url));
    for (const cookie of response.cookies.getAll()) denied.cookies.set(cookie);
    denied.headers.set('Cache-Control', 'private, no-store');
    return denied;
  }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|icon.svg|favicon.ico).*)'] };
