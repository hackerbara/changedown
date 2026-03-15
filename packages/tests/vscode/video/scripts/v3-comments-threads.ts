/**
 * Video Script: Comments & Threads
 *
 * Demonstrates comment threads on tracked changes. Starts with threads
 * collapsed for a clean view, opens the sidebar panel, then clicks into
 * a change to expand its thread and show the alice/bob conversation.
 *
 * ~10 seconds runtime.
 */

import { registerVideoScript, beat, command, positionCursor } from '../record';

registerVideoScript('v3-comments-threads', 'v3-comments-threads.md', async ({ page }) => {
    // 1. Open the ChangeTracks sidebar panel
    await command(page, 'changetracksReview.focus');
    await beat(page, 300);

    // Click editor to regain focus (sidebar steals it)
    const editorEl = await page.$('.view-lines');
    if (editorEl) {
        await editorEl.click({ position: { x: 300, y: 50 } });
        await beat(page, 200);
    }

    // 2. Show clean document with collapsed threads + sidebar
    await beat(page, 2000);

    // 3. Click into alice's insertion to expand its comment thread
    await positionCursor(page, 'Envoy sidecars', 'before');
    await beat(page, 3000);

    // 4. Final beat — thread visible with alice/bob conversation + sidebar
    await beat(page, 1500);
}, { 'changetracks.clickToShowComments': false });
