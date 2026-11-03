import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';

const api = process.env.API_URL;
if (!api || !['localhost', '127.0.0.1'].includes(new URL(api).hostname))
  throw new Error('Responsive checks require local Supabase.');
if (!process.env.ANON_KEY || !process.env.SERVICE_ROLE_KEY)
  throw new Error('Missing local Supabase credentials.');

const origin = 'http://127.0.0.1:3110';
const output = 'test-results/responsive';
mkdirSync(output, { recursive: true });
const env = {
  ...process.env,
  FAMILY_AUTH_E2E_BUILD: '1',
  NEXT_PUBLIC_SUPABASE_URL: api,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.ANON_KEY,
  // Invitation creation only builds a link and QR. These fixtures never contact Telegram.
  NEXT_PUBLIC_APP_URL: 'https://family-responsive.example.test',
  SUPABASE_SECRET_KEY: process.env.SERVICE_ROLE_KEY,
  TELEGRAM_BOT_USERNAME: 'family_ui_fixture_bot',
  TELEGRAM_BOT_TOKEN: 'local-ui-fixture',
  TELEGRAM_WEBHOOK_SECRET: 'local-ui-fixture',
  TELEGRAM_OIDC_CLIENT_ID: 'local-ui-fixture',
  TELEGRAM_OIDC_CLIENT_SECRET: 'local-ui-fixture',
};
const generated = ['next-env.d.ts', 'tsconfig.json'].map((path) => [path, readFileSync(path)]);
const build = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  env,
  stdio: 'inherit',
});
for (const [path, contents] of generated) writeFileSync(path, contents);
if (build.status !== 0) throw new Error('Responsive test build failed');

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(api, process.env.SERVICE_ROLE_KEY, options);
const client = createClient(api, process.env.ANON_KEY, options);
const email = `family-responsive-${randomBytes(12).toString('hex')}@example.test`;
const password = randomBytes(24).toString('base64url');
const displayName = 'Александра-Екатерина '.repeat(5).slice(0, 100);
const title = 'ОченьДлинноеНазваниеБезПробелов'.repeat(7).slice(0, 200);
const failures = [];
let ownerId;
let browser;
let server;

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

try {
  const created = checked(
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    }),
    'Create local user',
  );
  ownerId = created.user.id;
  checked(await client.auth.signInWithPassword({ email, password }), 'Local sign in');
  checked(
    await client.from('profiles').update({ display_name: displayName }).eq('user_id', ownerId),
    'Set name',
  );
  const familyId = checked(
    await client.rpc('create_family', { family_name: 'СемьяБезПробелов'.repeat(6) }),
    'Create local family',
  );
  checked(
    await client.from('shopping_items').insert({
      visibility: 'family',
      family_id: familyId,
      title,
      planned_qty: '999999999.999',
      unit: 'большая упаковка',
      planned_unit_price: '999999999999',
      priority: 'urgent',
      big_purchase: true,
      location: 'market',
      due_date: '2027-12-31',
    }),
    'Create long shopping item',
  );
  checked(
    await client.from('shopping_categories').insert({
      visibility: 'family',
      family_id: familyId,
      name: 'ДлиннаяКатегория'.repeat(5),
      icon: 'home',
      color: '#7d2944',
    }),
    'Create long category',
  );
  server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3110'],
    { env, stdio: 'ignore' },
  );
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error('Responsive server failed to start');
    try {
      if ((await fetch(`${origin}/login`, { signal: AbortSignal.timeout(2000) })).ok) {
        ready = true;
        break;
      }
    } catch {
      /* server is starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error('Responsive server timed out');
  browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome' } : {});
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto(`${origin}/login`);
  await page.getByLabel('Электронная почта или логин').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.waitForURL('**/dashboard');

  const routes = [
    '/dashboard',
    '/family',
    '/shopping',
    '/settings',
    '/finance',
    '/finance/transactions',
    '/finance/budgets',
    '/finance/debts',
    '/finance/goals',
    '/finance/recurring',
    '/calendar',
    '/tasks',
    '/notes',
    '/analytics',
    '/notifications',
  ];
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => localStorage.setItem('theme', value), theme);
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of routes) {
        await page.goto(`${origin}${route}`);
        await page.getByRole('heading', { level: 1 }).waitFor();
        if (route === '/family') {
          await page
            .locator('summary')
            .filter({ hasText: /Изменить титул|Права доступа/ })
            .evaluateAll((nodes) => {
              for (const node of nodes) node.parentElement.open = true;
            });
        }
        if (route === '/shopping') {
          await page.locator('details').evaluateAll((nodes) => {
            for (const node of nodes) node.open = true;
          });
        }
        const overflow = await page.evaluate(() =>
          [...document.querySelectorAll('main *')]
            .filter((element) => {
              const box = element.getBoundingClientRect();
              return box.width > 0 && (box.right > innerWidth + 1 || box.left < -1);
            })
            .slice(0, 8)
            .map((element) => `${element.tagName}.${element.className}`),
        );
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))
          failures.push(`${theme} ${width}px ${route}: document overflow`);
        if (overflow.length) failures.push(`${theme} ${width}px ${route}: ${overflow.join(', ')}`);
        if (
          ['/dashboard', '/family', '/shopping', '/settings'].includes(route) &&
          [320, 1440].includes(width)
        ) {
          await page.screenshot({
            path: `${output}/${theme}-${width}-${route.slice(1)}.png`,
            fullPage: true,
          });
          const axe = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze();
          for (const violation of axe.violations)
            failures.push(`${theme} ${width}px ${route}: axe ${violation.id}`);
        }
      }
    }
  }
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`${origin}/dashboard`);
  await page.getByRole('button', { name: 'Ещё', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Семья', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Меню пользователя' }).click();
  await page.getByRole('menuitem', { name: 'Настройки', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.goto(`${origin}/family`);
  await page.getByRole('button', { name: 'Создать приглашение', exact: true }).click();
  await page.getByLabel('Ссылка на бота', { exact: true }).waitFor();
  const invitationUrl = await page.getByLabel('Ссылка на бота', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'Скопировать ссылку', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Ссылка скопирована.' }).waitFor();
  if ((await page.evaluate(() => navigator.clipboard.readText())) !== invitationUrl)
    failures.push('Invitation clipboard contents differ from the displayed link');
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw new Error('Clipboard denied for fixture');
    };
  });
  await page.getByRole('button', { name: 'Скопировать ссылку', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Скопируйте её вручную' }).waitFor();
  const selection = await page
    .getByLabel('Ссылка на бота', { exact: true })
    .evaluate((input) => input.selectionEnd - input.selectionStart);
  if (selection !== invitationUrl.length)
    failures.push('Clipboard fallback did not select the full link');

  const touchContext = await browser.newContext({
    storageState: await context.storageState(),
    isMobile: true,
    hasTouch: true,
    viewport: { width: 375, height: 812 },
  });
  const touchPage = await touchContext.newPage();
  for (const route of ['/family', '/shopping', '/settings']) {
    await touchPage.goto(`${origin}${route}`);
    await touchPage.locator('details').evaluateAll((nodes) => {
      for (const node of nodes) node.open = true;
    });
    const smallInputs = await touchPage
      .locator(
        'main input:not([type="hidden"]):not([type="checkbox"]):not([type="file"]):not([type="color"]), main select',
      )
      .evaluateAll(
        (nodes) =>
          nodes.filter(
            (node) =>
              node.getBoundingClientRect().width > 0 &&
              parseFloat(getComputedStyle(node).fontSize) < 16,
          ).length,
      );
    if (smallInputs) failures.push(`Touch ${route}: ${smallInputs} fields below 16px`);
  }
  await touchContext.close();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${origin}/dashboard`);
  const card = page.getByRole('link', { name: /Покупки Что нужно для дома/ });
  await card.hover();
  const arrowTransform = await card
    .locator('svg')
    .last()
    .evaluate((element) => getComputedStyle(element).transform);
  if (arrowTransform !== 'none') failures.push('Reduced motion still moves a dashboard arrow');
  await page.getByRole('link', { name: 'Покупки', exact: true }).first().focus();
  await page.keyboard.press('Enter');
  await page.waitForURL('**/shopping');
  writeFileSync(
    `${output}/results.json`,
    JSON.stringify(
      { failures, widths: [320, 375, 768, 1024, 1440], routes, themes: ['light', 'dark'] },
      null,
      2,
    ),
  );
  if (failures.length)
    throw new Error(`Responsive audit found ${failures.length} issues:\n${failures.join('\n')}`);
  console.log(
    'PASS: 150 authenticated route/theme/width checks, long data, axe, menus and keyboard.',
  );
} finally {
  if (browser) await browser.close();
  if (server?.pid) {
    if (process.platform === 'win32')
      spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
    else server.kill();
  }
  if (ownerId) {
    if (!/^[0-9a-f-]{36}$/i.test(ownerId)) throw new Error('Unexpected fixture user ID');
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
        `delete from public.families where created_by='${ownerId}'::uuid`,
      ],
      { stdio: 'ignore' },
    );
    if (deletion.status !== 0) throw new Error('Failed to clean local responsive family');
    checked(await admin.auth.admin.deleteUser(ownerId), 'Clean local responsive user');
  }
}
