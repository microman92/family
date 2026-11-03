import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';

export function passwordLoginAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Настройте серверный ключ Supabase');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function isTelegramUser(user: User) {
  return user.identities?.some((identity) => identity.provider === 'custom:telegram') ?? false;
}

export async function needsPasswordLogin(user: User) {
  if (!isTelegramUser(user)) return false;
  if (user.email && !internalLoginEmail(user.email)) return false;
  const admin = passwordLoginAdmin();
  const { data, error } = await admin
    .from('account_logins')
    .select('is_ready')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error && ['42P01', 'PGRST205'].includes(error.code)) return false;
  if (error) throw new Error('Не удалось проверить дополнительный вход');
  return !data?.is_ready;
}

export const internalLoginEmail = (email?: string | null) =>
  Boolean(email?.endsWith('@accounts.family.invalid'));
