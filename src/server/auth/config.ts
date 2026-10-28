import 'server-only';

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export function isTelegramInviteConfigured() {
  const username = process.env.TELEGRAM_BOT_USERNAME;
  const publicUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (
    !getSupabaseConfig() ||
    !username ||
    !/^[a-zA-Z0-9_]{5,32}$/.test(username) ||
    !process.env.TELEGRAM_BOT_TOKEN ||
    !process.env.TELEGRAM_WEBHOOK_SECRET ||
    !process.env.TELEGRAM_OIDC_CLIENT_ID ||
    !process.env.TELEGRAM_OIDC_CLIENT_SECRET ||
    !process.env.SUPABASE_SECRET_KEY ||
    !publicUrl
  )
    return false;
  try {
    const url = new URL(publicUrl);
    return (
      url.protocol === 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1'
    );
  } catch {
    return false;
  }
}
