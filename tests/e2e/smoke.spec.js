const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const PUBLIC_ROUTES = ['/', '/login.html', '/yardim', '/yasal'];
const PUBLIC_BROWSER_ROUTES = ['/yardim', '/yasal'];
const PROTECTED_ROUTES = [
  '/dashboard',
  '/konular',
  '/analiz',
  '/profil',
  '/yanlislarim',
  '/favoriler',
  '/denemeler',
  '/admin/index.html',
  '/admin/importer.html',
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

  test('public content pages remain accessible without auth redirect', async ({ page }) => {
    for (const route of PUBLIC_BROWSER_ROUTES) {
      await page.goto(route);
      await expect(page, `public route should stay accessible: ${route}`).not.toHaveURL(/login(\.html)?/i);
    }
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
    !process.env.E2E_AUTH_STORAGE_STATE,
    'Set E2E_AUTH_STORAGE_STATE to enable authenticated smoke coverage.'
  );

  test('authenticated user can traverse dashboard -> konular -> konu -> test', async ({ browser, baseURL }) => {
    const rawStorageStatePath = process.env.E2E_AUTH_STORAGE_STATE;
    const storageStatePath = path.resolve(process.cwd(), rawStorageStatePath);
    test.skip(
      !fs.existsSync(storageStatePath),
      `E2E auth storage state file not found: ${storageStatePath}`
    );

    const context = await browser.newContext({
      baseURL,
      storageState: storageStatePath,
    });
    const page = await context.newPage();

    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/login(\.html)?/i);
    await expect(page.locator('#welcomeMsg')).toBeVisible();

    await page.goto('/konular');
    await expect(page).not.toHaveURL(/login(\.html)?/i);
    const topicLink = page.locator('.topic-main-link').first();
    await expect(topicLink).toBeVisible();
    await topicLink.click();

    await expect(page).toHaveURL(/\/konu\//i);
    const modeButton = page.locator('.mode-btn').first();
    await expect(modeButton).toBeVisible();
    await modeButton.click();

    await expect(page).toHaveURL(/\/test-coz\//i);
    await expect(page.locator('#quizContainer')).toBeVisible();

    await context.close();
  });
});
