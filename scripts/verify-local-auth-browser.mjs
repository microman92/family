import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const local = (url) => url && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname);
const api = process.env.API_URL;
const mail = process.env.MAILPIT_URL || process.env.INBUCKET_URL;
const titlesOnly = process.env.FAMILY_TITLE_TEST_ONLY === '1';
const port = titlesOnly ? 3109 : 3000;
if (!local(api) || !local(mail) || !process.env.ANON_KEY || !process.env.SERVICE_ROLE_KEY)
  throw new Error('This test requires local Supabase credentials and local Mailpit.');

await new Promise((resolve, reject) => {
  const socket = createServer();
  socket.once('error', reject);
  socket.listen(port, '127.0.0.1', () => socket.close(resolve));
});

const origin = `http://127.0.0.1:${port}`;
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
  ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
  {
    env,
    stdio: ['ignore', 'ignore', 'ignore'],
  },
);
let browser;
let messageId;
let memberId;
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
  await page.goto(`${origin}/family`);
  await page.getByText('Изменить титул', { exact: true }).first().click();
  await page.locator('select[name="title"]').first().selectOption('king');
  await page.getByRole('button', { name: 'Сохранить титул' }).first().click();
  await page.locator('small').getByText('Король семьи', { exact: true }).waitFor();
  const ownerRow = page.locator('li').filter({ hasText: 'Король семьи' });
  await ownerRow.getByText('Изменить титул').waitFor();
  if (await ownerRow.locator('select[name="title"]').isVisible())
    throw new Error('Title form stayed open');
  await ownerRow.getByText('Изменить титул').click();
  if ((await ownerRow.locator('select[name="title"]').inputValue()) !== 'king')
    throw new Error('Saved title not selected');
  await ownerRow.getByRole('button', { name: 'Сохранить титул' }).click();
  await ownerRow.locator('select[name="title"]').waitFor({ state: 'hidden' });
  await ownerRow.getByText('Права доступа').click();
  await ownerRow.locator('select[name="role"]').selectOption('member');
  await ownerRow.getByRole('button', { name: 'Сохранить роль' }).click();
  await ownerRow
    .getByRole('alert')
    .filter({ hasText: 'Назначьте другого администратора' })
    .waitFor();
  if (!(await ownerRow.locator('select[name="role"]').isVisible()))
    throw new Error('Role error closed the form');
  await ownerRow.locator('select[name="role"]').selectOption('admin');
  await ownerRow.getByRole('button', { name: 'Сохранить роль' }).click();
  await ownerRow.locator('select[name="role"]').waitFor({ state: 'hidden' });
  await ownerRow.getByText('Права доступа').click();
  if ((await ownerRow.locator('select[name="role"]').inputValue()) !== 'admin')
    throw new Error('Saved role not selected');
  await ownerRow.getByText('Права доступа').click();
  await page.getByLabel('Имя ребёнка').fill('Временный профиль');
  await page.getByRole('button', { name: 'Добавить профиль' }).click();
  await page.getByRole('status').filter({ hasText: 'Профиль добавлен' }).waitFor();
  const childRow = page.locator('li').filter({ hasText: 'Временный профиль' });
  await childRow.getByText('Изменить титул').click();
  await childRow.locator('select[name="title"]').selectOption('princess');
  await childRow.getByRole('button', { name: 'Сохранить титул' }).click();
  await childRow.locator('small').filter({ hasText: 'Принцесса семьи' }).waitFor();
  if (await childRow.locator('select[name="title"]').isVisible())
    throw new Error('Child title form stayed open');
  await childRow.getByText('Изменить титул').click();
  if ((await childRow.locator('select[name="title"]').inputValue()) !== 'princess')
    throw new Error('Saved child title not selected');
  await page.reload();
  await page.locator('small').getByText('Король семьи', { exact: true }).waitFor();
  await page
    .locator('li')
    .filter({ hasText: 'Временный профиль' })
    .locator('small')
    .filter({ hasText: 'Принцесса семьи' })
    .waitFor();
  await page.setViewportSize({ width: 320, height: 800 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
    throw new Error('Family page overflows on mobile');
  if (!titlesOnly) {
    await page.getByRole('button', { name: 'Покинуть семью' }).click();
    await page.getByRole('button', { name: 'Подтвердить', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Последний администратор' }).waitFor();
    const users = await admin.auth.admin.listUsers();
    const owner = users.data?.users.find((item) => item.email === email);
    if (users.error || !owner || !/^[0-9a-f-]{36}$/i.test(owner.id))
      throw new Error('Local test owner unavailable');
    const memberEmail = email.replace('family-browser-', 'family-browser-member-');
    const createdMember = await admin.auth.admin.createUser({
      email: memberEmail,
      password: oldPassword,
      email_confirm: true,
      user_metadata: { name: 'Тестовый участник' },
    });
    if (createdMember.error || !createdMember.data.user)
      throw new Error('Local test member creation failed');
    memberId = createdMember.data.user.id;
    if (!/^[0-9a-f-]{36}$/i.test(memberId)) throw new Error('Unexpected local member ID');
    const inserted = spawnSync(
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
        '-qtAc',
        `insert into public.family_members (family_id,user_id,role) select id,'${memberId}'::uuid,'member' from public.families where created_by='${owner.id}'::uuid returning id`,
      ],
      { encoding: 'utf8' },
    );
    if (inserted.status !== 0 || !/^[0-9a-f-]{36}$/i.test(inserted.stdout.trim()))
      throw new Error('Local test membership creation failed');
    const memberClient = createClient(api, process.env.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (
      (await memberClient.auth.signInWithPassword({ email: memberEmail, password: oldPassword }))
        .error
    )
      throw new Error('Local member login failed');
    const beforeRemoval = await memberClient.from('families').select('id');
    if (beforeRemoval.error || beforeRemoval.data.length !== 1)
      throw new Error('Local member cannot see family');
    await page.reload();
    const memberRow = page.locator('li').filter({ hasText: 'Тестовый участник' });
    await memberRow.getByRole('button', { name: 'Исключить' }).click();
    await memberRow.getByRole('button', { name: 'Подтвердить', exact: true }).click();
    await memberRow.waitFor({ state: 'detached' });
    const afterRemoval = await memberClient.from('families').select('id');
    if (afterRemoval.error || afterRemoval.data.length !== 0)
      throw new Error('Removed member retains family access');
    await memberClient.auth.signOut({ scope: 'local' });
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
  }
  console.log(
    titlesOnly
      ? 'PASS: browser family title changes for adult and child'
      : 'PASS: browser signup, family creation, admin actions, member removal, revoked access, login and recovery',
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
    if (memberId) {
      const removedMember = await admin.auth.admin.deleteUser(memberId);
      if (removedMember.error) throw new Error('Failed to clean up local test member');
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
