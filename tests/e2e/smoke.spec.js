const { test, expect } = require('@playwright/test');

const PUBLIC_ROUTES = ['/', '/login.html', '/yardim', '/yasal'];
const PROTECTED_ROUTES = [
  '/dashboard',
  '/konular',
  '/analiz',
  '/profil',
  '/yanlislarim',
  '/favoriler',
  '/denemeler',
];

test.describe('Gold GYS smoke', () => {
  test('public routes respond and render', async ({ page, request }) => {
    for (const route of PUBLIC_ROUTES) {
      const response = await request.get(route);
      expect(response.ok(), `request failed for ${route}`).toBeTruthy();
    }

    await page.goto('/');
    await expect(page).toHaveTitle(/GOLD|GYS/i);
  });

  test('login page has Google sign-in entrypoint', async ({ page }) => {
    await page.goto('/login.html');
    await expect(page.locator('#googleLogin')).toBeVisible();
    await expect(page.locator('#statusBox')).toBeHidden();
  });

  test('protected routes redirect unauthenticated users to login', async ({ page }) => {
    for (const route of PROTECTED_ROUTES) {
      await page.goto(route);
      await expect(page, `route should redirect to login: ${route}`).toHaveURL(/login(\.html)?/i);
    }
  });
});

test.describe('Gold GYS authenticated smoke (optional)', () => {
  test.skip(
    !process.env.E2E_AUTH_EMAIL || !process.env.E2E_AUTH_PASSWORD,
    'Set E2E_AUTH_EMAIL and E2E_AUTH_PASSWORD to enable auth smoke coverage.'
  );

  test('authenticated critical flow placeholder', async ({ page }) => {
    test.info().annotations.push({
      type: 'todo',
      description:
        'Implement deterministic auth flow for dashboard -> konu -> test -> sonuc + admin list/save.',
    });

    await page.goto('/login.html');
    await expect(page.locator('#googleLogin')).toBeVisible();
  });
});
