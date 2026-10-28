import { createClient } from '@supabase/supabase-js';

const {
  NEXT_PUBLIC_SUPABASE_URL: url,
  SUPABASE_SECRET_KEY: key,
  TELEGRAM_OIDC_CLIENT_ID: clientId,
  TELEGRAM_OIDC_CLIENT_SECRET: clientSecret,
} = process.env;
if (!url || !key || !clientId || !clientSecret) {
  console.error(
    'Заполните Supabase и Telegram OIDC в .env.local. Не передавайте секреты через аргументы командной строки.',
  );
  process.exit(1);
}

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: existing, error: listError } =
  await client.auth.admin.customProviders.listProviders();
if (listError) {
  console.error('Не удалось прочитать настройки Supabase Auth.', listError.status ?? '');
  process.exit(1);
}
if (existing.providers.some((provider) => provider.identifier === 'custom:telegram')) {
  console.error(
    'Провайдер custom:telegram уже существует. Проверьте его настройки вручную; они не изменены.',
  );
  process.exit(1);
}
const { error } = await client.auth.admin.customProviders.createProvider({
  provider_type: 'oidc',
  identifier: 'custom:telegram',
  name: 'Telegram',
  client_id: clientId,
  client_secret: clientSecret,
  issuer: 'https://oauth.telegram.org',
  scopes: ['openid', 'profile'],
  email_optional: true,
  pkce_enabled: true,
  enabled: true,
});
if (error) {
  console.error('Не удалось создать Telegram OIDC в Supabase.', error.status ?? '');
  process.exit(1);
}
console.log('Провайдер custom:telegram создан. Проверьте вход через Telegram.');
