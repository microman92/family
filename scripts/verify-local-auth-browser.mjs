import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const local = (url) => url && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname);
const api = process.env.API_URL;
const mail = process.env.MAILPIT_URL || process.env.INBUCKET_URL;
if (!local(api) || !local(mail) || !process.env.ANON_KEY || !process.env.SERVICE_ROLE_KEY)
  throw new Error('This test requires local Supabase credentials and local Mailpit.');

await new Promise((resolve, reject) => {
  const socket = createServer();
  socket.once('error', reject);
  socket.listen(3000, '127.0.0.1', () => socket.close(resolve));
});

const origin = 'http://127.0.0.1:3000';
const email = `family-browser-${randomBytes(12).toString('hex')}@example.test`;
const oldPassword = randomBytes(24).toString('base64url');
const newPassword = randomBytes(24).toString('base64url');
const admin = createClient(api, process.env.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const env = {
  ...process.env,
  FAMILY_AUTH_E2E_BUILD: '1',
  NEXT_PUBLIC_SUPABASE_URL: api,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.ANON_KEY,
  NEXT_PUBLIC_APP_URL: origin,
  TELEGRAM_BOT_TOKEN: '',
  TELEGRAM_WEBHOOK_SECRET: '',
  TELEGRAM_OIDC_CLIENT_ID: '',
  TELEGRAM_OIDC_CLIENT_SECRET: '',
  SUPABASE_SECRET_KEY: '',
};
const generated = ['next-env.d.ts', 'tsconfig.json'].map((path) => [path, readFileSync(path)]);
const build = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  env,
  stdio: 'ignore',
});
for (const [path, contents] of generated) writeFileSync(path, contents);
if (build.status !== 0) throw new Error('Local browser test build failed');
const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3000'],
  {
    env,
    stdio: ['ignore', 'ignore', 'ignore'],
  },
);
let browser;
let messageId;
try {
  let ready = false;
  for (let i = 0; i < 90; i++) {
    if (server.exitCode !== null) throw new Error('Local application failed to start');
    try {
      if ((await fetch(`${origin}/login`, { signal: AbortSignal.timeout(2000) })).ok) {
        ready = true;
        break;
      }
    } catch {
      /* server is still starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error('Local application start timed out');
  browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome' } : {});
  const page = await browser.newPage();
  await page.goto(`${origin}/register`);
  await page.getByLabel('Электронная почта').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(oldPassword);
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await page.waitForURL('**/onboarding');
  await page.getByLabel('Название семьи').fill('Временная проверка');
  await page.getByRole('button', { name: 'Создать семью' }).click();
  await page.waitForURL('**/dashboard');
  async function logout() {
    await page.getByRole('button', { name: 'Меню пользователя' }).click();
    await page.getByRole('menuitem', { name: 'Выйти' }).click();
    await page.waitForURL('**/login');
  }
  await logout();
  await page.getByLabel('Электронная почта').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(oldPassword);
  await page.getByRole('button', { name: 'Войти по почте' }).click();
  await page.waitForURL('**/dashboard');
  await logout();
  await page.goto(`${origin}/reset-password`);
  await page.getByLabel('Электронная почта').fill(email);
  await page.getByRole('button', { name: 'Отправить письмо' }).click();
  await page.getByRole('status').waitFor();
  for (let i = 0; i < 20; i++) {
    const inbox = await (await fetch(new URL('/api/v1/messages', mail))).json();
    const item = inbox.messages?.find((entry) => entry.To?.some((to) => to.Address === email));
    if (item) {
      messageId = item.ID;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!messageId) throw new Error('Recovery email was not delivered to local Mailpit');
  const message = await (await fetch(new URL(`/api/v1/message/${messageId}`, mail))).json();
  const link = (message.Text || message.HTML || '')
    .match(/https?:\/\/[^\s"<>]+\/auth\/v1\/verify\?[^\s"<>]+/)?.[0]
    ?.replaceAll('&amp;', '&');
  if (!link || new URL(link).origin !== new URL(api).origin)
    throw new Error('Unexpected recovery link');
  await page.goto(link);
  await page.waitForURL('**/update-password');
  await page.locator('input#password').fill(newPassword);
  await page.getByRole('button', { name: 'Сохранить пароль' }).click();
  await page.waitForURL('**/dashboard');
  await logout();
  await page.getByLabel('Электронная почта').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Войти по почте' }).click();
  await page.waitForURL('**/dashboard');
  console.log(
    'PASS: browser signup, family creation, logout, login, recovery email and password reset',
  );
} finally {
  try {
    if (browser) await browser.close();
    const { data, error } = await admin.auth.admin.listUsers();
    if (error) throw new Error('Failed to locate local test user for cleanup');
    const user = data.users.find((item) => item.email === email);
    if (user) {
      if (!/^[0-9a-f-]{36}$/i.test(user.id)) throw new Error('Unexpected test user ID');
      const deletion = spawnSync(
        'docker',
        [
          'exec',
          '-i',
          'supabase_db_family-space',
          'psql',
          '-U',
          'postgres',
          '-d',
          'postgres',
          '-v',
          'ON_ERROR_STOP=1',
          '-c',
          `delete from public.families where created_by='${user.id}'::uuid`,
        ],
        { stdio: 'ignore' },
      );
      if (deletion.status !== 0) throw new Error('Failed to clean up local test family');
      const removed = await admin.auth.admin.deleteUser(user.id);
      if (removed.error) throw new Error('Failed to clean up local test user');
    }
    if (messageId)
      await fetch(new URL('/api/v1/messages', mail), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ IDs: [messageId] }),
      });
  } finally {
    if (process.platform === 'win32' && server.pid)
      spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
    else server.kill();
  }
}
