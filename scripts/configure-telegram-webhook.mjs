const {
  NEXT_PUBLIC_APP_URL: appUrl,
  TELEGRAM_BOT_TOKEN: token,
  TELEGRAM_WEBHOOK_SECRET: secret,
} = process.env;
if (!appUrl || !token || !secret || !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
  console.error('Заполните публичный HTTPS-адрес, токен бота и секрет webhook в .env.local.');
  process.exit(1);
}
let webhookUrl;
try {
  const url = new URL(appUrl);
  if (url.protocol !== 'https:' || ['localhost', '127.0.0.1'].includes(url.hostname))
    throw new Error();
  webhookUrl = new URL('/api/telegram/webhook', url).toString();
} catch {
  console.error('NEXT_PUBLIC_APP_URL должен быть публичным HTTPS-адресом приложения.');
  process.exit(1);
}
try {
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl, secret_token: secret, allowed_updates: ['message'] }),
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json();
  if (!response.ok || result.ok !== true) {
    console.error('Telegram не принял настройки webhook.', response.status);
    process.exit(1);
  }
  console.log('Webhook бота установлен для', webhookUrl);
} catch {
  console.error('Не удалось подключиться к Telegram.');
  process.exit(1);
}
