import { NextResponse, type NextRequest } from 'next/server';
import { AccessDeniedError } from '@/server/access/index.server';
import { updateShoppingItem } from '@/server/shopping/index.server';

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  let originHost: string | null = null;
  try {
    originHost = origin ? new URL(origin).host : null;
  } catch {
    return new Response('Invalid origin', { status: 403 });
  }
  if (!originHost || originHost !== request.headers.get('host'))
    return new Response('Invalid origin', { status: 403 });
  const form = await request.formData();
  const scope = form.get('scope') === 'private' ? 'private' : 'family';
  let result: Awaited<ReturnType<typeof updateShoppingItem>>;
  try {
    result = await updateShoppingItem(form);
  } catch (error) {
    if (error instanceof AccessDeniedError) return new Response('Access denied', { status: 403 });
    throw error;
  }
  if (result === 'conflict') {
    return new Response(
      `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Покупка изменилась</title></head><body><main><h1>Покупка изменилась</h1><p>Другой участник изменил или удалил покупку. Вернитесь к списку и проверьте актуальные данные.</p><a href="/shopping?scope=${scope}">Вернуться к покупкам</a></main></body></html>`,
      {
        status: 409,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'private, no-store',
        },
      },
    );
  }
  if (request.headers.get('accept')?.includes('application/json')) {
    return NextResponse.json(
      { ok: result === 'updated' },
      { status: result === 'updated' ? 200 : result === 'invalid' ? 400 : 500 },
    );
  }
  const url = new URL('/shopping', origin!);
  url.searchParams.set('scope', scope);
  if (result !== 'updated') url.searchParams.set('error', result === 'invalid' ? 'fields' : 'save');
  return NextResponse.redirect(url, 303);
}
