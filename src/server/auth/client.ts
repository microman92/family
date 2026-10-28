import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseConfig } from './config';

export async function createAuthClient(canWriteCookies = true) {
  const config = getSupabaseConfig();
  if (!config) throw new Error('Supabase не настроен');
  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        if (!canWriteCookies) return;
        for (const { name, value, options } of values) cookieStore.set(name, value, options);
      },
    },
  });
}
