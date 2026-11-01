import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('гостю доступны страницы входа, регистрации и помощи без ошибок браузера', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const route of [
    '/login',
    '/register',
    '/reset-password',
    '/help/access',
    '/invite/test-token',
  ]) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('закрытые маршруты перенаправляют гостя на вход', async ({ page }) => {
  for (const route of [
    '/',
    '/dashboard',
    '/shopping',
    '/finance',
    '/finance/transactions',
    '/finance/budgets',
    '/finance/debts',
    '/finance/goals',
    '/finance/recurring',
    '/analytics',
    '/calendar',
    '/tasks',
    '/notes',
    '/notifications',
    '/family',
    '/settings',
    '/onboarding',
    '/does-not-exist',
  ]) {
    await page.goto(route);
    expect(new URL(page.url()).pathname, route).toBe('/login');
  }
});

test('регистрация объясняет создание семьи и помощь сохраняет приглашение', async ({ page }) => {
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Создать новое пространство' })).toBeVisible();
  await expect(
    page.getByText('Зарегистрируйте личный аккаунт, затем создайте новую семью.'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Как это работает?' }).click();
  await expect(page.getByRole('heading', { name: 'Как работает Family' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Присоединиться к семье' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Создать семью' })).toBeVisible();
  const destination = '/invite/' + 'a'.repeat(32);
  await page.goto(`/register?next=${encodeURIComponent(destination)}`);
  await expect(page.getByRole('heading', { name: 'Вход по приглашению' })).toBeVisible();
  await page.getByRole('link', { name: 'Как это работает?' }).click();
  await expect(page.getByRole('link', { name: 'Вход', exact: true })).toHaveAttribute(
    'href',
    `/login?next=${encodeURIComponent(destination)}`,
  );
});

test('адаптивность публичных страниц без горизонтальной прокрутки', async ({ page }) => {
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/login', '/register', '/help/access']) {
      await page.goto(route);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
        `${route} at ${width}px`,
      ).toBe(false);
    }
  }
});

test('доступность публичных страниц в светлой и тёмной системной теме', async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const route of ['/login', '/register', '/help/access']) {
      await page.goto(route);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(results.violations, `${route} (${theme})`).toEqual([]);
    }
  }
});

test('ссылки входа доступны с клавиатуры', async ({ page }) => {
  await page.goto('/login');
  const link = page.getByRole('link', { name: 'Как это работает?' });
  await link.focus();
  await expect(link).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/help\/access/);
});
