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
  test('authenticated user can traverse native dashboard shell routes', async ({ browser, baseURL }) => {
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
    await expect(page.locator('#topicsContainer')).toBeVisible();
    await expect(page.locator('iframe.user-shell-frame[title=\"Dersler\"]')).toHaveCount(0);
    await expect(page).toHaveTitle(/Dersler \| GOLD GYS/i);

    // Scroll restore + focus transfer (native shell behavior)
    await page.evaluate(() => {
      document.documentElement.style.minHeight = '3200px';
      document.body.style.minHeight = '3200px';
      window.scrollTo({ top: 900, behavior: 'auto' });
    });

    const analysisNav = page.locator('.sidebar-nav .nav-item[data-shell-route="analiz"]').first();
    await expect(analysisNav).toBeVisible();
    await analysisNav.click();
    await expect(page).toHaveURL(/\/dashboard#analiz/i);

    await lessonsNav.click();
    await expect(page).toHaveURL(/\/dashboard#konular/i);

    const restoredScrollY = await page.evaluate(() => window.scrollY || 0);
    expect(restoredScrollY).toBeGreaterThan(700);
    await expect.poll(async () => {
      return page.evaluate(() => document.activeElement?.id || '');
    }).toBe('searchInput');

    // Native profile route (iframe'siz)
    await page.goto('/dashboard#profil');
    await expect(page).toHaveURL(/\/dashboard#profil/i);
    await expect(page.locator('#profileForm')).toBeVisible();
    await expect(page.locator('iframe.user-shell-frame')).toHaveCount(0);

    // Native analysis route (iframe'siz)
    await page.goto('/dashboard#analiz');
    await expect(page).toHaveURL(/\/dashboard#analiz/i);
    await expect(page.locator('#lastUpdate')).toBeVisible();
    await expect(page.locator('iframe.user-shell-frame')).toHaveCount(0);

    // Native denemeler route (iframe'siz)
    await page.goto('/dashboard#denemeler');
    await expect(page).toHaveURL(/\/dashboard#denemeler/i);
    await expect(page.locator('#examsGrid')).toBeVisible();
    await expect(page.locator('iframe.user-shell-frame')).toHaveCount(0);

    // Native favoriler route (iframe'siz)
    await page.goto('/dashboard#favoriler');
    await expect(page).toHaveURL(/\/dashboard#favoriler/i);
    await expect(page.locator('#favoritesList')).toBeVisible();
    await expect(page.locator('iframe.user-shell-frame')).toHaveCount(0);

    // Native yanlışlarım route (iframe'siz)
    await page.goto('/dashboard#yanlislarim');
    await expect(page).toHaveURL(/\/dashboard#yanlislarim/i);
    await expect(page.locator('#mistakesList')).toBeVisible();
    await expect(page.locator('iframe.user-shell-frame')).toHaveCount(0);

    // Rollback: shellV2 kapalıyken legacy full-page geçiş devam etmeli
    await page.goto('/dashboard?shellV2=0');
    await expect(page).not.toHaveURL(/\/dashboard#/i);
    const legacyLessonsNav = page.locator('.sidebar-nav .nav-item[data-page="lessons"], .sidebar-nav .nav-item[data-shell-route="konular"]').first();
    await expect(legacyLessonsNav).toBeVisible();
    await legacyLessonsNav.click();
    await expect(page).toHaveURL(/\/konular(\?.*)?$/i);

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
