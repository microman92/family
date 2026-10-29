import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { createAuthClient, finishTelegramBinding } from '@/server/auth/index.server';
import { getRememberedInvite } from '@/server/auth/invite-cookie';

export async function GET(request: NextRequest) {
  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000').origin;
  const invite = await getRememberedInvite();
  const failure = (reason: 'callback' | 'session' | 'verification' | 'binding') => {
    console.warn('[telegram-bind] confirmation failed:', reason);
    const destination = new URL(
      !invite ? '/invite/expired' : reason === 'session' ? '/login' : invite,
      origin,
    );
    destination.searchParams.set(
      'error',
      !invite ? 'lost' : reason === 'session' ? 'callback' : 'telegram',
    );
    if (invite && reason === 'session') destination.searchParams.set('next', invite);
    if (invite && reason !== 'session') destination.searchParams.set('reason', reason);
    const response = NextResponse.redirect(destination);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  };
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!code || !state || !url || !key) return failure('callback');
  let stage: 'session' | 'verification' | 'binding' = 'session';
  try {
    const client = await createAuthClient();
    const {
      data: { user },
      error: userError,
    } = await client.auth.getUser();
    if (userError || !user) return failure('session');
    stage = 'verification';
    const verified = await finishTelegramBinding(code, state);
    stage = 'binding';
    const service = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await service.rpc('bind_verified_telegram_identity', {
      actor: user.id,
      verified_subject: verified.subject,
      verified_telegram_id: verified.telegramId,
      handoff_hash: createHash('sha256').update(verified.handoff).digest('hex'),
    });
    if (error || !data) return failure('binding');
    const response = NextResponse.redirect(new URL(`/invite/${verified.handoff}`, origin));
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch {
    return failure(stage);
  }
}
