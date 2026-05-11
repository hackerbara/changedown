import { test, expect } from '@playwright/test';

test('homepage above-fold JS stays below budget', async ({ page }) => {
  let jsBytes = 0;
  page.on('response', async (response) => {
    // Exclude third-party analytics (Plausible) — it's conditionally loaded
    // only when PUBLIC_ANALYTICS_DOMAIN is set, and is deferred so it does
    // not block initial render. We measure only first-party JS.
    if (response.url().includes('plausible.io')) return;
    const ct = response.headers()['content-type'] ?? '';
    if (ct.includes('javascript') || ct.includes('module')) {
      try {
        const body = await response.body();
        jsBytes += body.length;
      } catch {
        // body may be unavailable for redirects, etc.
      }
    }
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });

  // Plan threshold: 3000 bytes. Once Tranche 5 lands SandboxRoot with
  // client:visible, this number will rise — but the sandbox is below the
  // fold so its JS shouldn't load until scroll.
  expect(jsBytes).toBeLessThan(3000);
});
