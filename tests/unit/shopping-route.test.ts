import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const update = vi.hoisted(() => vi.fn());
vi.mock('@/server/shopping/index.server', () => ({ updateShoppingItem: update }));
vi.mock('@/server/access/index.server', () => ({ AccessDeniedError: class extends Error {} }));
import { POST } from '../../app/api/shopping/item/route';

function request(origin: string | null) {
  const form = new FormData();
  form.set('scope', 'family');
  return new NextRequest('https://family.example/api/shopping/item', {
    method: 'POST',
    headers: origin ? { origin, host: 'family.example' } : { host: 'family.example' },
    body: form,
  });
}

beforeEach(() => update.mockReset());

describe('Изменение покупки', () => {
  it('возвращает 409 при устаревшей версии', async () => {
    update.mockResolvedValue('conflict');
    const response = await POST(request('https://family.example'));
    expect(response.status).toBe(409);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('отклоняет запросы с чужого origin до изменения данных', async () => {
    expect((await POST(request('https://other.example'))).status).toBe(403);
    expect((await POST(request(null))).status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });
  it('после успешного сохранения возвращает пользователя к списку', async () => {
    update.mockResolvedValue('updated');
    const response = await POST(request('https://family.example'));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://family.example/shopping?scope=family');
  });
});
