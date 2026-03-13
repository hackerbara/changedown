import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import type { Page } from 'playwright';

// Paths relative to compiled location: out/visual/
// Package root = 2 levels up from out/visual/
const PACKAGE_ROOT = path.resolve(__dirname, '../../');
const GOLDEN_DIR = path.resolve(PACKAGE_ROOT, 'visual/golden');
const ACTUAL_DIR = path.resolve(PACKAGE_ROOT, 'visual/actual');
const DIFF_DIR = path.resolve(PACKAGE_ROOT, 'visual/diff');

/**
 * Ensure output directories exist.
 */
export function ensureDirectories(): void {
    [GOLDEN_DIR, ACTUAL_DIR, DIFF_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
}

/**
 * Capture a screenshot of the editor area (not the full window).
 * Returns the path to the saved screenshot.
 */
export async function captureEditorScreenshot(
    page: Page,
    name: string
): Promise<string> {
    ensureDirectories();

    // Target the editor content area specifically
    // This excludes the sidebar, status bar, title bar etc.
    const editorSelector = '.editor-instance .monaco-editor .overflow-guard';

    const element = await page.$(editorSelector);
    if (!element) {
        // Fallback: capture the whole editor group
        const fallback = await page.$('.editor-group-container');
        if (!fallback) {
            throw new Error('Could not find editor area for screenshot');
        }
        const screenshotPath = path.join(ACTUAL_DIR, `${name}.png`);
        await fallback.screenshot({ path: screenshotPath });
        return screenshotPath;
    }

    const screenshotPath = path.join(ACTUAL_DIR, `${name}.png`);
    await element.screenshot({ path: screenshotPath });
    return screenshotPath;
}

/**
 * Compare a screenshot against its golden baseline.
 * Returns the number of different pixels.
 *
 * If no golden exists, saves the actual as the new golden and returns 0.
 * (First run creates baselines; subsequent runs compare against them.)
 */
export function compareScreenshot(name: string, tolerancePercent: number = 0.5): {
    diffPixels: number;
    totalPixels: number;
    diffPercent: number;
    isNew: boolean;
    diffPath?: string;
} {
    const goldenPath = path.join(GOLDEN_DIR, `${name}.png`);
    const actualPath = path.join(ACTUAL_DIR, `${name}.png`);

    if (!fs.existsSync(actualPath)) {
        throw new Error(`Actual screenshot not found: ${actualPath}`);
    }

    // If no golden exists, this is the first run — save actual as golden
    if (!fs.existsSync(goldenPath)) {
        fs.copyFileSync(actualPath, goldenPath);
        console.log(`  [GOLDEN] Created new baseline: ${name}.png`);
        return { diffPixels: 0, totalPixels: 0, diffPercent: 0, isNew: true };
    }

    // Read both images
    const golden = PNG.sync.read(fs.readFileSync(goldenPath));
    const actual = PNG.sync.read(fs.readFileSync(actualPath));

    // Handle size differences
    if (golden.width !== actual.width || golden.height !== actual.height) {
        console.log(
            `  [SIZE MISMATCH] golden: ${golden.width}x${golden.height}, ` +
            `actual: ${actual.width}x${actual.height}`
        );
        return {
            diffPixels: golden.width * golden.height,
            totalPixels: golden.width * golden.height,
            diffPercent: 100,
            isNew: false,
        };
    }

    // Compare using pixelmatch
    const { width, height } = golden;
    const diff = new PNG({ width, height });
    const diffPixels = pixelmatch(
        new Uint8Array(golden.data),
        new Uint8Array(actual.data),
        new Uint8Array(diff.data),
        width,
        height,
        {
            threshold: 0.1, // Per-pixel color sensitivity
            alpha: 0.5,
        }
    );

    const totalPixels = width * height;
    const diffPercent = (diffPixels / totalPixels) * 100;

    // Save diff image if there are differences
    let diffPath: string | undefined;
    if (diffPixels > 0) {
        diffPath = path.join(DIFF_DIR, `${name}.png`);
        fs.writeFileSync(diffPath, new Uint8Array(PNG.sync.write(diff)));
    }

    return { diffPixels, totalPixels, diffPercent, isNew: false, diffPath };
}

/**
 * Assert that a screenshot matches its golden baseline within tolerance.
 */
export function assertScreenshotMatches(
    name: string,
    tolerancePercent: number = 0.5
): void {
    const result = compareScreenshot(name, tolerancePercent);

    if (result.isNew) {
        return; // New baseline, nothing to compare against
    }

    if (result.diffPercent > tolerancePercent) {
        throw new Error(
            `Screenshot "${name}" differs from golden by ${result.diffPercent.toFixed(2)}% ` +
            `(${result.diffPixels} pixels). Tolerance: ${tolerancePercent}%. ` +
            `Diff image: ${result.diffPath}`
        );
    }
}

/**
 * Update the golden baseline for a specific test.
 * Call this when you've verified the actual output is correct.
 */
export function updateGolden(name: string): void {
    const actualPath = path.join(ACTUAL_DIR, `${name}.png`);
    const goldenPath = path.join(GOLDEN_DIR, `${name}.png`);

    if (!fs.existsSync(actualPath)) {
        throw new Error(`No actual screenshot to promote: ${actualPath}`);
    }

    fs.copyFileSync(actualPath, goldenPath);
    console.log(`  [GOLDEN UPDATED] ${name}.png`);
}
