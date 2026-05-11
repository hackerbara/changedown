import { test, expect } from '@playwright/test';

const URL = 'http://localhost:4321/';

const viewports = [
  { name: 'mobile-360', width: 360, height: 800 },
  { name: 'mobile-480', width: 480, height: 800 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1024', width: 1024, height: 800 },
  { name: 'desktop-1440', width: 1440, height: 900 },
];

for (const v of viewports) {
  test(`homepage layout @${v.name} (${v.width}x${v.height})`, async ({ page }) => {
    await page.setViewportSize({ width: v.width, height: v.height });
    await page.goto(URL, { waitUntil: 'networkidle' });

    // Hero: two-column on >=768px (CSS: max-width: 768px triggers at <=768px in px,
    // but browsers evaluate max-width as <= so at exactly 768 the query fires).
    // Astro/Chromium: max-width: 768px fires when viewport <= 768px.
    // So 768 → 1 col, 769+ → 2 col. The switch is: width <= 768 = 1 col.
    const hero = page.locator('.hero');
    await expect(hero).toBeVisible();
    const heroColumns = await hero.evaluate((el) =>
      getComputedStyle(el).gridTemplateColumns.split(' ').length
    );
    if (v.width <= 768) {
      expect(heroColumns).toBe(1); // single column on mobile/tablet-768
    } else {
      expect(heroColumns).toBe(2); // two columns on desktop
    }

    // DifferentiatorCards: 3-column on >768px, 1-column at <=768px (same breakpoint)
    const diffGrid = page.locator('.diff-grid');
    const diffCols = await diffGrid.evaluate((el) =>
      getComputedStyle(el).gridTemplateColumns.split(' ').length
    );
    if (v.width <= 768) {
      expect(diffCols).toBe(1);
    } else {
      expect(diffCols).toBe(3);
    }

    // Header nav links collapse at <=640px (CSS: max-width: 640px)
    const navLinks = page.locator('.site-header .nav-links');
    const navDisplay = await navLinks.evaluate((el) => getComputedStyle(el).display);
    if (v.width <= 640) {
      expect(navDisplay).toBe('none');
    } else {
      expect(navDisplay).toBe('flex');
    }

    // InstallCTA wraps via flex-wrap on narrow widths — verify all three children are visible
    await expect(page.locator('.install-cta .mascot-col')).toBeVisible();
    await expect(page.locator('.install-cta .copy-col')).toBeVisible();
    await expect(page.locator('.install-cta .cta-col')).toBeVisible();

    // No horizontal scrollbar on the document (overflow check)
    const docOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(docOverflow).toBeLessThanOrEqual(1); // allow 1px subpixel rounding
  });
}
