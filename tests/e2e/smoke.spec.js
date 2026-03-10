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

test.describe('Gold GYS authenticated smoke (@optional)', () => {
  test('authenticated user can traverse dashboard -> konular -> konu -> test and finish flow', async ({ browser, baseURL }) => {
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

    await page.goto('/dashboard?shellV2=1');
    await expect(page).not.toHaveURL(/login(\.html)?/i);
    await expect(page.locator('#welcomeMsg')).toBeVisible();

    const lessonsNav = page.locator('.sidebar-nav .nav-item[data-shell-route="konular"]').first();
    await expect(lessonsNav).toBeVisible();
    await lessonsNav.click();
    await expect(page).toHaveURL(/\/dashboard#konular/i);

    const topicFrame = page.frameLocator('iframe.user-shell-frame[title="Dersler"]');
    const topicLink = topicFrame.locator('.topic-main-link').first();
    await expect(topicLink).toBeVisible();
    await topicLink.click();

    await expect(page).toHaveURL(/\/dashboard#konular/i);
    const topicDetailFrame = page.frameLocator('iframe.user-shell-frame[title="Dersler"]');
    const modeButton = topicDetailFrame.locator('.mode-btn').first();
    await expect(modeButton).toBeVisible();
    await modeButton.click();

    await expect(page).toHaveURL(/\/dashboard#konular/i);
    await expect(topicDetailFrame.locator('#quizContainer')).toBeVisible();
    const firstOption = topicDetailFrame.locator('.sik-btn').first();
    await expect(firstOption).toBeVisible();
    await firstOption.click();

    const finishButton = topicDetailFrame.locator('#btnFinish');
    await expect(finishButton).toBeVisible();
    await finishButton.click();

    const finishConfirmButton = topicDetailFrame.locator('#finishConfirmBtn');
    await expect(finishConfirmButton).toBeVisible();
    await finishConfirmButton.click();

    await expect(topicDetailFrame.locator('#resultModal')).toBeVisible();
    await expect(topicDetailFrame.locator('#resultText')).toBeVisible();

    await context.close();
  });
});

test.describe('Gold GYS admin authenticated smoke (@optional)', () => {
  test('authenticated admin can access dashboard, importer and users tab', async ({ browser, baseURL }) => {
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

    const usersTab = page.locator('.sidebar-nav .nav-item[data-tab="users"]').first();
    await expect(usersTab).toBeVisible();
    await usersTab.click();
    await expect(page.locator('#section-users')).toBeVisible();

    await context.close();
  });
});
