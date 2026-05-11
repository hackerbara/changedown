import { test, expect } from '@playwright/test';

test('sandbox mounts when scrolled into view', async ({ page }) => {
  await page.goto('http://localhost:4321/');
  await page.locator('#demo').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-sandbox-root]')).toBeVisible({ timeout: 5000 });
});

test('sandbox has aria region label', async ({ page }) => {
  await page.goto('http://localhost:4321/');
  await page.locator('#demo').scrollIntoViewIfNeeded();
  const region = page.locator('[data-sandbox-root]');
  await expect(region).toHaveAttribute('role', 'region');
  await expect(region).toHaveAttribute('aria-label', 'ChangeDown for Word interactive demo');
});

test('sandbox arrow-right keyboard advances scene', async ({ page }) => {
  await page.goto('http://localhost:4321/');
  await page.locator('#demo').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-sandbox-root]')).toBeVisible();
  // Wait for Solid hydration: scrubber dots must be present and narrator renders
  await expect(page.locator('.scene-dot').first()).toBeEnabled();
  // Initial narration shows welcome text
  await expect(page.locator('.scene-narrator .narration')).toContainText('Pull up a seat');
  // Click the sandbox body to ensure page focus before keyboard events
  await page.locator('[data-sandbox-root]').click();
  await page.keyboard.press('ArrowRight');
  // Advancing from welcome → claiming; narrator shows claiming narration
  await expect(page.locator('.scene-narrator .narration')).toContainText('Opening your seat');
});

test('sandbox renders MockDoc and MockPane', async ({ page }) => {
  await page.goto('http://localhost:4321/');
  await page.locator('#demo').scrollIntoViewIfNeeded();
  await expect(page.locator('[aria-label="Mock Word document"]')).toBeVisible();
  await expect(page.locator('[aria-label="Mock ChangeDown for Word task pane"]')).toBeVisible();
});

test('welcome state shows CTA in pane', async ({ page }) => {
  await page.goto('http://localhost:4321/');
  await page.locator('#demo').scrollIntoViewIfNeeded();
  await expect(page.locator('.mock-pane .welcome h3')).toContainText('Pull up a seat.');
  await expect(page.locator('.mock-pane .welcome .cta')).toContainText('Try a free slot');
});
