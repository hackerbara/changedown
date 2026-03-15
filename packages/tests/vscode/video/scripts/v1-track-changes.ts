/**
 * Video Script: Track Changes
 *
 * Demonstrates live edit tracking: green insertions appear as you type,
 * then crystallize into full CriticMarkup with {++...++} delimiters.
 * Tracking is enabled via settings + fixture header.
 *
 * ~11 seconds runtime.
 */

import { registerVideoScript, typeHuman, beat, positionCursor, selectText } from '../record';

registerVideoScript('v1-track-changes', 'v1-track-changes.md', async ({ page }) => {
    // 1. Brief view of the clean document
    await beat(page, 500);

    // 2. Position cursor and type — green insertion decoration appears in real-time
    await positionCursor(page, 'to staging.', 'after');
    await typeHuman(page, ' All services now require health checks.', 120);
    await beat(page, 300);

    // 3. Wait for crystallization (pauseThresholdMs=800)
    await beat(page, 1300);

    // 4. Close the Comments panel that auto-opened
    const editorLines = await page.$('.view-lines');
    if (editorLines) {
        await editorLines.click({ position: { x: 300, y: 100 } });
        await beat(page, 100);
    }
    await page.keyboard.press('Meta+j');
    await beat(page, 200);

    // 5. Show the crystallized insertion with code lenses
    await beat(page, 800);

    // 6. Select "standard" and delete — tracking creates a deletion
    await selectText(page, 'standard');
    await beat(page, 300);
    await page.keyboard.press('Backspace');

    // 7. Move cursor away from deletion site to trigger crystallization
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await beat(page, 1300);

    // 8. Close Comments panel again if it reopened
    const editorLines2 = await page.$('.view-lines');
    if (editorLines2) {
        await editorLines2.click({ position: { x: 300, y: 100 } });
        await beat(page, 100);
    }
    await page.keyboard.press('Meta+j');
    await beat(page, 200);

    // 9. Final pause to show both tracked changes (green + red)
    await beat(page, 1000);
}, { 'changetracks.clickToShowComments': false, 'changetracks.editBoundary.pauseThresholdMs': 800 });
