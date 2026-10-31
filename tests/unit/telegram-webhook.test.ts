import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../../app/api/telegram/webhook/route';
const service = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => service }));

describe('Telegram webhook', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    service.rpc.mockReset();
  });

  it('повтор Telegram update сохраняет уже отправленную ссылку', async () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'test-secret');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.invalid');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'test-key');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://family.example');
    service.rpc.mockResolvedValue({ data: true, error: null });
    const send = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', send);
    const request = (id: number) =>
      new NextRequest('https://family.example/api/telegram/webhook', {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
        body: JSON.stringify({
          update_id: id,
          message: {
            text: '/start invite_' + 'a'.repeat(32),
            from: { id: 123 },
            chat: { id: 123, type: 'private' },
          },
        }),
      });
    expect((await POST(request(10))).status).toBe(200);
    expect((await POST(request(10))).status).toBe(200);
    expect(service.rpc.mock.calls[0]![1].handoff_hash).toBe(
      service.rpc.mock.calls[1]![1].handoff_hash,
    );
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
    expect((await POST(request(11))).status).toBe(200);
    expect(service.rpc.mock.calls[0]![1].handoff_hash).not.toBe(
      service.rpc.mock.calls[2]![1].handoff_hash,
    );
  });

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
