import { test, expect } from '@playwright/test';

test('full guided walkthrough advances through 7 scenes', async ({ page }) => {
  await page.goto('http://localhost:4321/');
  await page.locator('#demo').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-sandbox-root]')).toBeVisible();

  // Initial narration shows welcome text
  await expect(page.locator('.scene-narrator .narration')).toContainText("Pull up a seat");

  // Step through 7 user scenes (scenes 2 is collapsed claiming+handoff; need to click
  // continue 7 times to traverse claiming → handoff → paste-into-ai → agent-connected → edits-arriving → reviewing → done)
  for (let i = 0; i < 7; i++) {
    await page.locator('.scene-narrator .continue').click();
    // Allow staggered edits-arriving effect to flush
    await page.waitForTimeout(200);
  }

  // Either reached done OR continue button vanished
  await expect(page.locator('.mock-pane .done-summary h3')).toContainText('Nice work', { timeout: 6000 });
});

test('scene scrubber jumps directly to a scene', async ({ page }) => {
  await page.goto('http://localhost:4321/');
  await page.locator('#demo').scrollIntoViewIfNeeded();
  // Scrubber has 7 dots; click the last (scene 7 / done)
  const dots = page.locator('.scene-dot');
  await expect(dots).toHaveCount(7);
  await dots.nth(6).click();
  await expect(page.locator('.mock-pane .done-summary h3')).toContainText('Nice work');
});

test('escape hatch toggles between guided and free modes', async ({ page }) => {
  await page.goto('http://localhost:4321/');
  await page.locator('#demo').scrollIntoViewIfNeeded();
  await page.locator('.escape-link').click();
  await expect(page.locator('.escape-banner')).toBeVisible();
  await expect(page.locator('.escape-banner')).toContainText('Exploring freely');
  await page.locator('.escape-banner button').click();
  await expect(page.locator('.escape-link')).toBeVisible();
});

test('edits-arriving scene populates 3 changes in doc and pane feed', async ({ page }) => {
  await page.goto('http://localhost:4321/');
  await page.locator('#demo').scrollIntoViewIfNeeded();
  // Jump straight to scene 5
  await page.locator('.scene-dot').nth(4).click();
  // Wait for the third change to arrive (stagger is 600ms × 3)
  await expect(page.locator('.mock-doc .change[data-change-id="ch3"]')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.mock-doc .change[data-change-id="ch1"]')).toBeVisible();
  await expect(page.locator('.mock-doc .change[data-change-id="ch2"]')).toBeVisible();
  await expect(page.locator('.mock-doc .change[data-change-id="ch3"]')).toBeVisible();
  // Pane feed mirrors
  await expect(page.locator('.mock-pane .feed-card[data-change-id="ch1"]')).toBeVisible();
});

test('mock AI chat appears in scene 3 (paste-into-ai)', async ({ page }) => {
  await page.goto('http://localhost:4321/');
  await page.locator('#demo').scrollIntoViewIfNeeded();
  // Scene 3 is the 3rd dot
  await page.locator('.scene-dot').nth(2).click();
  await expect(page.locator('.mock-ai-chat')).toBeVisible();
  await expect(page.locator('.mock-ai-chat .chat-name')).toContainText('Claude');
});
