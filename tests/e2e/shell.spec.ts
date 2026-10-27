import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('главная, навигация и отсутствие ошибок браузера', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Главная', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true });
  const nav = page.getByRole('navigation', {
    name: testInfo.project.name === 'mobile' ? 'Мобильная навигация' : 'Основная навигация',
    exact: true,
  });
  await nav.getByRole('link', { name: 'Покупки', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Покупки', exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Покупки', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  if (testInfo.project.name === 'mobile') {
    await nav.getByRole('button', { name: 'Ещё', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Семья', exact: true }).click();
    await expect(page).toHaveURL(/\/family$/);
  } else {
    await page.getByRole('button', { name: 'Свернуть меню', exact: true }).click();
    await expect(nav.getByRole('link', { name: 'Календарь', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Развернуть меню', exact: true }).click();
  }
  expect(errors).toEqual([]);
});

test('темы сохраняются и системная тема следует устройству', async ({ page }, testInfo) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Тёмная', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: testInfo.outputPath('settings-dark.png'), fullPage: true });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Тёмная', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Светлая', exact: true }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByRole('button', { name: 'Системная', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

test('все маршруты доступны без фиктивной авторизации и мутаций', async ({ page }) => {
  for (const route of [
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
    '/login',
    '/register',
    '/reset-password',
    '/onboarding',
    '/invite/test-token',
  ]) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Войти через Telegram' })).toBeDisabled();
  const missing = await page.goto('/does-not-exist');
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Такой страницы нет' })).toBeVisible();
});

test('адаптивность на 320/375/768/1440 без горизонтальной прокрутки', async ({ page }) => {
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/dashboard', '/finance', '/settings', '/login']) {
      await page.goto(route);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow, `${route} at ${width}px`).toBe(false);
    }
  }
});

test('доступность основных экранов в светлой и тёмной теме', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.goto('/settings');
    await page
      .getByRole('button', { name: theme === 'light' ? 'Светлая' : 'Тёмная', exact: true })
      .click();
    for (const route of ['/dashboard', '/settings', '/finance', '/login']) {
      await page.goto(route);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(results.violations, `${route} (${theme})`).toEqual([]);
    }
  }
});

test('клавиатура: ссылка пропуска и меню пользователя', async ({ page }) => {
  await page.goto('/dashboard');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'К содержимому' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await page.getByRole('button', { name: 'Меню пользователя' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Меню пользователя' })).toBeFocused();
});
