import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
const updateSchema = z.object({
  update_id: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  message: z.object({
    text: z.string().max(512),
    from: z.object({ id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }),
    chat: z.object({
      id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      type: z.literal('private'),
    }),
  }),
});

export async function POST(request: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const supplied = request.headers.get('x-telegram-bot-api-secret-token');
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  if (
    !secret ||
    !supplied ||
    Buffer.byteLength(secret) !== Buffer.byteLength(supplied) ||
    !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))
  )
    return new NextResponse(null, { status: 401 });
  if (!token || !supabaseUrl || !serviceKey) return new NextResponse(null, { status: 503 });
  const size = Number(request.headers.get('content-length') ?? 0);
  if (size > 16_384) return new NextResponse(null, { status: 413 });
  const body = await request.text();
  if (Buffer.byteLength(body) > 16_384) return new NextResponse(null, { status: 413 });
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const update = updateSchema.safeParse(parsed);
  if (!update.success) return new NextResponse(null, { status: 200 });
  const message = update.data.message;
  if (message.from.id !== message.chat.id) return new NextResponse(null, { status: 200 });
  const invite = /^\/start(?:@[A-Za-z0-9_]+)?\s+invite_([A-Za-z0-9_-]{32})$/.exec(message.text);
  if (!invite?.[1]) return new NextResponse(null, { status: 200 });
  const handoff = randomBytes(24).toString('base64url');
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  const client = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.rpc('prepare_telegram_invite', {
    invite_hash: hash(invite[1]),
    handoff_hash: hash(handoff),
    telegram_id: String(message.from.id),
    chat_id: String(message.chat.id),
    telegram_update: update.data.update_id,
  });
  if (error) return new NextResponse(null, { status: 500 });
  const appUrl = new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000');
  const invitationUrl = new URL(`/invite/${handoff}`, appUrl).toString();
  const payload = data
    ? {
        chat_id: message.chat.id,
        text: 'Вас приглашают в Family. Откройте ссылку и подтвердите вход через этот Telegram-аккаунт.',
        reply_markup: { inline_keyboard: [[{ text: 'Открыть приглашение', url: invitationUrl }]] },
      }
    : {
        chat_id: message.chat.id,
        text: 'Приглашение недоступно или истекло. Попросите новую ссылку.',
      };
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    if (!response.ok) return new NextResponse(null, { status: 500 });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
  return new NextResponse(null, { status: 200 });
}
