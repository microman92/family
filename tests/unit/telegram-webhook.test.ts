import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../../app/api/telegram/webhook/route';

describe('Telegram webhook', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('отклоняет запрос с неверным секретом до обращения к сервисам', async () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'test-secret');
    const response = await POST(
      new NextRequest('http://localhost/api/telegram/webhook', {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': 'wrong-secret' },
        body: '{}',
      }),
    );
    expect(response.status).toBe(401);
  });

  it('не обрабатывает произвольный или групповой update', async () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'test-secret');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.invalid');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'test-key');
    const response = await POST(
      new NextRequest('http://localhost/api/telegram/webhook', {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
        body: JSON.stringify({
          update_id: 1,
          message: { text: '/start invite_foo', from: { id: 1 }, chat: { id: 1, type: 'group' } },
        }),
      }),
    );
    expect(response.status).toBe(200);
  });
});
