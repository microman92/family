import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';

const local = (url) => url && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname);
const api = process.env.API_URL;
const mail = process.env.MAILPIT_URL || process.env.INBUCKET_URL;
const titlesOnly = process.env.FAMILY_TITLE_TEST_ONLY === '1';
const loginOnly = process.env.FAMILY_LOGIN_TEST_ONLY === '1';
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
  SUPABASE_SECRET_KEY: loginOnly ? process.env.SERVICE_ROLE_KEY : '',
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
let childId;
let loginOwnerId;
let shoppingMemberId;
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
  const context = await browser.newContext();
  const page = await context.newPage();
  for (const route of ['/dashboard', '/family', '/settings', '/onboarding']) {
    await page.goto(`${origin}${route}`);
    if (new URL(page.url()).pathname !== '/login') throw new Error(`Guest accessed ${route}`);
  }
  await page.goto(`${origin}/register`);
  await page.getByLabel('Электронная почта').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(oldPassword);
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await page.waitForURL('**/login?registered=success');
  await page.getByLabel('Электронная почта').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(oldPassword);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.waitForURL('**/onboarding');
  await page.getByLabel('Название семьи').fill('Временная проверка');
  await page.getByRole('button', { name: 'Создать семью' }).click();
  await page.waitForURL('**/dashboard');
  if (loginOnly) {
    const users = await admin.auth.admin.listUsers();
    const owner = users.data?.users.find((item) => item.email === email);
    if (users.error || !owner || !/^[0-9a-f-]{36}$/i.test(owner.id))
      throw new Error('Missing login test user');
    loginOwnerId = owner.id;
    const identity = spawnSync(
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
        `insert into auth.identities (created_at,updated_at,user_id,provider_id,provider,identity_data) values (now(),now(),'${owner.id}'::uuid,'${owner.id}','custom:telegram',jsonb_build_object('sub','${owner.id}')); update auth.users set email='' where id='${owner.id}'::uuid;`,
      ],
      { stdio: 'ignore' },
    );
    if (identity.status !== 0) throw new Error('Could not simulate Telegram-only identity');
    await page.goto(`${origin}/account-access`);
    try {
      await Promise.race([
        page.locator('#generated-password').waitFor(),
        page
          .locator('p[role="alert"]')
          .waitFor()
          .then(async () => {
            throw new Error(
              `Credential generation failed: ${await page.locator('p[role="alert"]').textContent()}`,
            );
          }),
      ]);
    } catch (error) {
      throw new Error(
        `Credential screen failed at ${new URL(page.url()).pathname}: ${await page.locator('h1').textContent()} (${error.message})`,
      );
    }
    const generatedLogin = await page.locator('#generated-login').inputValue();
    const generatedPassword = await page.locator('#generated-password').inputValue();
    if (!generatedLogin || generatedPassword.length < 24)
      throw new Error('Missing generated credentials');
    await page.getByRole('link', { name: 'Продолжить', exact: true }).click();
    await page.waitForURL('**/dashboard');
    async function passwordLogout() {
      await page.getByRole('button', { name: 'Меню пользователя' }).click();
      await page.getByRole('menuitem', { name: 'Выйти', exact: true }).click();
      await page.waitForURL('**/login');
    }
    async function passwordLogin(username, password) {
      await page.getByLabel('Электронная почта или логин').fill(username);
      await page.getByLabel('Пароль', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Войти', exact: true }).click();
    }
    await passwordLogout();
    await passwordLogin(generatedLogin, generatedPassword);
    await page.waitForURL('**/dashboard');
    await page.goto(`${origin}/settings`);
    const chosenLogin = `user_${randomBytes(6).toString('hex')}`;
    await page.locator('#account-username').fill(chosenLogin);
    await page.locator('#account-password').fill(newPassword);
    await page.getByRole('button', { name: 'Сохранить данные входа' }).click();
    await page.getByRole('status').filter({ hasText: 'Логин и пароль сохранены' }).waitFor();
    await passwordLogout();
    await passwordLogin(generatedLogin, generatedPassword);
    await page.getByRole('alert').waitFor();
    await passwordLogin(chosenLogin, newPassword);
    await page.waitForURL('**/dashboard');
    console.log('PASS: Telegram-only generated credentials, password login and settings changes');
  } else {
    await page.goto(`${origin}/shopping`);
    await page.getByText('Свои категории').click();
    await page.getByLabel('Название категории').fill('Тестовая категория');
    await page.getByRole('button', { name: 'Добавить категорию' }).click();
    await page.getByRole('button', { name: 'Тестовая категория', exact: true }).waitFor();
    await page.getByText('Свои категории').click();
    await page.getByLabel('Название категории').last().fill('Изменённая категория');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await page.getByRole('button', { name: 'Изменённая категория', exact: true }).click();
    await page.getByLabel('Название покупки').fill('Тестовая общая покупка');
    await page.getByText('Дополнительные параметры').click();
    await page.getByLabel('Срочность').selectOption('urgent');
    const assignee = await page
      .locator('select[name="assigned"] option')
      .nth(1)
      .getAttribute('value');
    if (!assignee) throw new Error('Family assignee is unavailable');
    await page.locator('select[name="assigned"]').selectOption(assignee);
    await page.getByLabel('Крупная покупка').check();
    await page.getByRole('button', { name: 'Добавить и завершить', exact: true }).click();
    await page.getByText('Тестовая общая покупка').waitFor();
    await page.getByLabel('Срочные').check();
    await page.getByLabel('Крупные', { exact: true }).check();
    await page.getByRole('button', { name: 'Показать', exact: true }).click();
    await page.getByText('Тестовая общая покупка').waitFor();
    if ((await page.getByText('Тестовая общая покупка').count()) !== 1)
      throw new Error('Shopping filters duplicate an item');
    await page.goto(`${origin}/shopping?scope=family`);
    await page.getByRole('link', { name: 'Личное', exact: true }).click();
    await page.getByRole('heading', { name: 'Личный список' }).waitFor();
    if (await page.getByText('Тестовая общая покупка').count())
      throw new Error('Shared shopping item shown in private list');
    await page.getByRole('button', { name: 'Продукты', exact: true }).click();
    await page.getByLabel('Название покупки').fill('Тестовая личная покупка');
    await page.getByRole('button', { name: 'Добавить и завершить', exact: true }).click();
    await page.getByText('Тестовая личная покупка').waitFor();
    await page.getByRole('link', { name: 'Общее', exact: true }).click();
    await page.getByRole('heading', { name: 'Общий список' }).waitFor();
    if (await page.getByText('Тестовая личная покупка').count())
      throw new Error('Private shopping item shown in shared list');
    await page.getByText('Свои категории').click();
    await page.getByRole('button', { name: 'В архив' }).click();
    await page.getByRole('button', { name: 'В архив' }).waitFor({ state: 'hidden' });
    await page.getByText('Редактировать').waitFor();
    await page.getByText('Редактировать').click();
    await page.getByLabel('Название', { exact: true }).fill('Изменённая общая покупка');
    const editForm = page
      .locator('form')
      .filter({ has: page.getByLabel('Название', { exact: true }) });
    await editForm.locator('input[name="qty"]').fill('2.5');
    await editForm.locator('input[name="price"]').fill('12000');
    const editResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/shopping/item') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    const saved = await editResponse;
    if (saved.status() !== 200)
      throw new Error(`Shopping update returned ${saved.status()}: ${await saved.text()}`);
    await page.getByText('Изменённая общая покупка').waitFor();
    await page.getByText('Известная сумма: 30 000 сум').waitFor();
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
    const owners = await admin.auth.admin.listUsers();
    const ownerForChild = owners.data?.users.find((item) => item.email === email);
    if (owners.error || !ownerForChild || !/^[0-9a-f-]{36}$/i.test(ownerForChild.id))
      throw new Error('Local test owner unavailable');
    const childEmail = email.replace('family-browser-', 'family-browser-child-');
    const child = await admin.auth.admin.createUser({
      email: childEmail,
      password: oldPassword,
      email_confirm: true,
    });
    if (child.error || !child.data.user) throw new Error('Local child creation failed');
    childId = child.data.user.id;
    if (!/^[0-9a-f-]{36}$/i.test(childId)) throw new Error('Unexpected local child ID');
    const childMembership = spawnSync(
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
        `insert into public.family_members (family_id,user_id,role) select id,'${childId}'::uuid,'child' from public.families where created_by='${ownerForChild.id}'::uuid returning id`,
      ],
      { encoding: 'utf8' },
    );
    if (childMembership.status !== 0 || !/^[0-9a-f-]{36}$/i.test(childMembership.stdout.trim()))
      throw new Error('Local child membership creation failed');
    const childPage = await browser.newPage();
    await childPage.goto(`${origin}/login`);
    await childPage.getByLabel('Электронная почта').fill(childEmail);
    await childPage.getByLabel('Пароль', { exact: true }).fill(oldPassword);
    await childPage.getByRole('button', { name: 'Войти', exact: true }).click();
    await childPage.waitForURL('**/dashboard');
    if (await childPage.getByRole('link', { name: 'Финансы', exact: true }).count())
      throw new Error('Child sees finance navigation');
    if (await childPage.getByRole('link', { name: 'Аналитика', exact: true }).count())
      throw new Error('Child sees analytics navigation');
    for (const route of [
      '/finance',
      '/finance/transactions',
      '/finance/budgets',
      '/finance/debts',
      '/finance/goals',
      '/finance/recurring',
      '/analytics',
    ]) {
      await childPage.goto(`${origin}${route}`);
      await childPage.waitForURL('**/dashboard');
    }
    await page.goto(`${origin}/finance`);
    await page.getByRole('heading', { name: 'Финансы', exact: true }).waitFor();
    await page.goto(`${origin}/family`);
    await childPage.close();
    const shoppingEmail = email.replace('family-browser-', 'family-browser-shopping-');
    const shoppingMember = await admin.auth.admin.createUser({
      email: shoppingEmail,
      password: oldPassword,
      email_confirm: true,
    });
    if (shoppingMember.error || !shoppingMember.data.user)
      throw new Error('Shopping test member creation failed');
    shoppingMemberId = shoppingMember.data.user.id;
    if (!/^[0-9a-f-]{36}$/i.test(shoppingMemberId))
      throw new Error('Unexpected shopping member ID');
    const shoppingMembership = spawnSync(
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
        `insert into public.family_members (family_id,user_id,role) select id,'${shoppingMemberId}'::uuid,'member' from public.families where created_by='${ownerForChild.id}'::uuid returning id`,
      ],
      { encoding: 'utf8' },
    );
    if (
      shoppingMembership.status !== 0 ||
      !/^[0-9a-f-]{36}$/i.test(shoppingMembership.stdout.trim())
    )
      throw new Error('Shopping test membership creation failed');
    const memberPage = await browser.newPage();
    await memberPage.goto(`${origin}/login`);
    await memberPage.getByLabel('Электронная почта').fill(shoppingEmail);
    await memberPage.getByLabel('Пароль', { exact: true }).fill(oldPassword);
    await memberPage.getByRole('button', { name: 'Войти', exact: true }).click();
    await memberPage.waitForURL('**/dashboard');
    await memberPage.goto(`${origin}/shopping`);
    await memberPage.getByText('Изменённая общая покупка').waitFor();
    if (await memberPage.getByText('Тестовая личная покупка').count())
      throw new Error('Member sees another user private item');
    await memberPage.getByRole('link', { name: 'Личное' }).click();
    await memberPage.getByRole('heading', { name: 'Личный список' }).waitFor();
    if (await memberPage.getByText('Тестовая личная покупка').count())
      throw new Error('Member sees another user private list');
    await memberPage.getByRole('link', { name: 'Общее' }).click();
    await memberPage.getByRole('heading', { name: 'Общий список' }).waitFor();
    await page.goto(`${origin}/shopping`);
    await page.getByText('Редактировать').click();
    await memberPage.getByText('Редактировать').click();
    await memberPage.getByLabel('Название', { exact: true }).fill('Изменение участника');
    await memberPage.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await memberPage.getByText('Изменение участника').waitFor();
    await page.getByLabel('Название', { exact: true }).fill('Устаревшее изменение');
    const conflictResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/shopping/item') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    if ((await conflictResponse).status() !== 409)
      throw new Error('Stale update did not return 409');
    await page.getByRole('alert').filter({ hasText: 'Покупка изменилась' }).waitFor();
    await page.getByRole('button', { name: 'Обновить список' }).click();
    await page.getByText('Изменение участника').waitFor();
    await page.setViewportSize({ width: 320, height: 800 });
    await page.getByText('Редактировать').click();
    const overflowing = await page.evaluate(() =>
      Array.from(document.querySelectorAll('*'))
        .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
        .map((element) => element.tagName + ':' + element.className)
        .slice(0, 8),
    );
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
      throw new Error(`Shopping edit form overflows on mobile: ${overflowing.join(', ')}`);
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    if (accessibility.violations.length)
      throw new Error(
        `Shopping accessibility violations: ${accessibility.violations.map((v) => v.id).join(', ')}`,
      );
    await page.getByText('Редактировать').focus();
    await page.keyboard.press('Enter');
    const removeShoppingMember = spawnSync(
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
        `update public.family_members set status='removed' where user_id='${shoppingMemberId}'::uuid`,
      ],
      { stdio: 'ignore' },
    );
    if (removeShoppingMember.status !== 0) throw new Error('Could not remove shopping member');
    await memberPage.goto(`${origin}/shopping`);
    await memberPage.waitForURL('**/onboarding');
    await memberPage.close();
    await page.goto(`${origin}/family`);
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
      for (const route of ['/dashboard', '/family', '/settings', '/onboarding']) {
        await page.goto(`${origin}${route}`);
        if (new URL(page.url()).pathname !== '/login') throw new Error(`Guest accessed ${route}`);
      }
      await page.getByLabel('Электронная почта').fill(email);
      await page.getByLabel('Пароль', { exact: true }).fill(oldPassword);
      await page.getByRole('button', { name: 'Войти', exact: true }).click();
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
      await page.getByRole('button', { name: 'Войти', exact: true }).click();
      await page.waitForURL('**/dashboard');
    }
    console.log(
      titlesOnly
        ? 'PASS: browser shopping, two-user isolation, conflict, accessibility and family roles'
        : 'PASS: browser signup, family creation, admin actions, member removal, revoked access, login and recovery',
    );
  }
} finally {
  try {
    if (browser) await browser.close();
    const { data, error } = await admin.auth.admin.listUsers();
    if (error) throw new Error('Failed to locate local test user for cleanup');
    const user = data.users.find((item) => item.email === email || item.id === loginOwnerId);
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
    if (childId) {
      const removedChild = await admin.auth.admin.deleteUser(childId);
      if (removedChild.error) throw new Error('Failed to clean up local test child');
    }
    if (shoppingMemberId) {
      const removed = await admin.auth.admin.deleteUser(shoppingMemberId);
      if (removed.error) throw new Error('Failed to clean up shopping test member');
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
