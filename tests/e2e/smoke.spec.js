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

function resolveStorageStatePath(envVarValue, defaultRelativePath) {
  const candidates = [];
  if (envVarValue) candidates.push(envVarValue);
  if (defaultRelativePath) candidates.push(defaultRelativePath);

  for (const candidate of candidates) {
    const absPath = path.resolve(process.cwd(), candidate);
    if (!fs.existsSync(absPath)) continue;

    try {
      const raw = fs.readFileSync(absPath, "utf8").replace(/^\uFEFF/, "");
      const parsed = JSON.parse(raw);
      const hasCookies = Array.isArray(parsed?.cookies);
      const hasOrigins = Array.isArray(parsed?.origins);
      if (hasCookies && hasOrigins) {
        return absPath;
      }
    } catch (_) {
      // invalid file -> try next candidate
    }
  }
  return null;
}

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
  test('authenticated user can traverse dashboard -> konular -> konu -> test', async ({ browser, baseURL }) => {
    const storageStatePath = resolveStorageStatePath(
      process.env.E2E_AUTH_STORAGE_STATE,
      'tests/e2e/.auth/user.json'
    );
    test.skip(
      !storageStatePath,
      'Provide E2E_AUTH_STORAGE_STATE or create tests/e2e/.auth/user.json to enable authenticated smoke coverage.'
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

test.describe('Gold GYS admin authenticated smoke (optional)', () => {
  test('authenticated admin can access admin dashboard and importer', async ({ browser, baseURL }) => {
    const storageStatePath = resolveStorageStatePath(
      process.env.E2E_ADMIN_AUTH_STORAGE_STATE,
      'tests/e2e/.auth/admin.json'
    );
    test.skip(
      !storageStatePath,
      'Provide E2E_ADMIN_AUTH_STORAGE_STATE or create tests/e2e/.auth/admin.json to enable admin authenticated smoke coverage.'
    );

    const context = await browser.newContext({
      baseURL,
      storageState: storageStatePath,
    });
    const page = await context.newPage();

    await page.goto('/admin');
    await expect(page).not.toHaveURL(/login(\.html)?/i);
    await expect(page.locator('#section-dashboard')).toBeVisible();
    await expect(page.locator('#statsGrid')).toBeVisible();

    await page.goto('/admin/importer');
    await expect(page).not.toHaveURL(/login(\.html)?/i);
    await expect(page.locator('#section-importer')).toBeVisible();

    await context.close();
  });
});
