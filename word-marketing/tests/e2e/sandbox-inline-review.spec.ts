import { test, expect } from '@playwright/test';

test('inline review: click change, accept via popup, pane mirrors', async ({ page }) => {
  await page.goto('http://localhost:4321/');
  await page.locator('#demo').scrollIntoViewIfNeeded();

  // Jump straight to scene 5 (edits-arriving)
  await page.locator('.scene-dot').nth(4).click();
  // Wait for 3 changes to arrive (600ms stagger × 3)
  // Wait for the third change to arrive (stagger is 600ms × 3)
  await expect(page.locator('.mock-doc .change[data-change-id="ch3"]')).toBeVisible({ timeout: 5000 });

  // Click the first change in the doc
  const firstChange = page.locator('.mock-doc .change[data-change-id="ch1"]').first();
  await expect(firstChange).toBeVisible();
  await firstChange.click();

  // Affordance opens
  const affordance = page.locator('[data-affordance]');
  await expect(affordance).toBeVisible();
  await expect(affordance).toHaveAttribute('role', 'dialog');

  // Accept
  await page.locator('[data-affordance] button.accept').click();

  // Affordance closes
  await expect(affordance).toHaveCount(0);

  // Pane feed-card shows accepted status (status-accepted class)
  await expect(page.locator('.mock-pane .feed-card.status-accepted[data-change-id="ch1"]')).toBeVisible();
});

test('inline review: keyboard-only flow with Enter + Escape', async ({ page }) => {
  await page.goto('http://localhost:4321/');
  await page.locator('#demo').scrollIntoViewIfNeeded();
  await page.locator('.scene-dot').nth(4).click();
  // Wait for the third change to arrive (stagger is 600ms × 3; allow extra for CI load)
  await expect(page.locator('.mock-doc .change[data-change-id="ch3"]')).toBeVisible({ timeout: 8000 });

  // Focus the first change span and activate with keyboard.
  const firstChange = page.locator('.mock-doc .change[data-change-id="ch1"]').first();
  await firstChange.focus();
  await page.keyboard.press('Enter');

  const affordance = page.locator('[data-affordance]');
  await expect(affordance).toBeVisible();

  // Accept button should be focused (autofocus via queueMicrotask)
  await expect(page.locator('[data-affordance] button.accept')).toBeFocused();

  // Escape closes
  await page.keyboard.press('Escape');
  await expect(affordance).toHaveCount(0);
});

test('inline review: reject hides the change span', async ({ page }) => {
  await page.goto('http://localhost:4321/');
  await page.locator('#demo').scrollIntoViewIfNeeded();
  await page.locator('.scene-dot').nth(4).click();
  // Wait for the third change to arrive (stagger is 600ms × 3)
  await expect(page.locator('.mock-doc .change[data-change-id="ch3"]')).toBeVisible({ timeout: 5000 });

  await page.locator('.mock-doc .change[data-change-id="ch1"]').click();
  await page.locator('[data-affordance] button.reject').click();

  // Status class flips to rejected
  await expect(page.locator('.mock-doc .change[data-change-id="ch1"].change-rejected')).toBeAttached();
  // Pane feed mirrors
  await expect(page.locator('.mock-pane .feed-card.status-rejected[data-change-id="ch1"]')).toBeVisible();
});

test('inline review: pane feed-card alternate review path opens same affordance', async ({ page }) => {
  await page.goto('http://localhost:4321/');
  await page.locator('#demo').scrollIntoViewIfNeeded();
  await page.locator('.scene-dot').nth(4).click();
  // Wait for the third change to arrive (stagger is 600ms × 3)
  await expect(page.locator('.mock-doc .change[data-change-id="ch3"]')).toBeVisible({ timeout: 5000 });

  // Click the feed-card for ch2 (pending), not the doc span
  await page.locator('.mock-pane .feed-card[data-change-id="ch2"]').click();
  await expect(page.locator('[data-affordance]')).toBeVisible();
  await page.locator('[data-affordance] button.accept').click();
  await expect(page.locator('.mock-pane .feed-card.status-accepted[data-change-id="ch2"]')).toBeVisible();
});
