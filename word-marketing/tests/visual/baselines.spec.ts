import { test, expect } from '@playwright/test';

// Visual regression: generates baseline screenshots on first run with
// --update-snapshots, then asserts equivalence on subsequent runs.
// Tolerance is 2% diff to allow font subpixel variance across machines.

test.describe('visual regression baselines', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure fonts are loaded before screenshotting to avoid swap flicker
    await page.addInitScript(() => {
      document.documentElement.classList.add('test-no-animation');
    });
  });

  test('homepage hero', async ({ page }) => {
    await page.goto('http://localhost:4321/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('#hero')).toHaveScreenshot('hero.png', { maxDiffPixelRatio: 0.02 });
  });

  test('sandbox scene 1 — welcome', async ({ page }) => {
    await page.goto('http://localhost:4321/');
    await page.locator('#demo').scrollIntoViewIfNeeded();
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    // Wait for sandbox hydration
    await expect(page.locator('[data-sandbox-root]')).toBeVisible();
    await expect(page.locator('[data-sandbox-root]')).toHaveScreenshot('sandbox-welcome.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('sandbox scene 7 — done', async ({ page }) => {
    await page.goto('http://localhost:4321/');
    await page.locator('#demo').scrollIntoViewIfNeeded();
    await page.locator('.scene-dot').nth(6).click();
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('[data-sandbox-root]')).toHaveScreenshot('sandbox-done.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('install page', async ({ page }) => {
    await page.goto('http://localhost:4321/install');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('install.png', { fullPage: true, maxDiffPixelRatio: 0.02 });
  });

  test('security page', async ({ page }) => {
    await page.goto('http://localhost:4321/security');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('security.png', { fullPage: true, maxDiffPixelRatio: 0.02 });
  });

  test('404 page', async ({ page }) => {
    const response = await page.goto('http://localhost:4321/no-such-page', { waitUntil: 'networkidle' });
    // Cloudflare Pages serves 404.html for unknown routes in production; in local preview
    // Astro's preview server returns 404 with the 404 page body.
    expect([200, 404]).toContain(response?.status() ?? 0);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('404.png', { fullPage: true, maxDiffPixelRatio: 0.02 });
  });
});
