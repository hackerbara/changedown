/**
 * Video Script: View Modes
 *
 * Demonstrates cycling through view modes with the ChangeDown
 * sidebar panel visible alongside the editor. The panel shows the
 * change list and view mode selector while the editor content updates.
 *
 * ~11 seconds runtime.
 */

import { registerVideoScript, beat, command } from '../record';

registerVideoScript('v4-view-modes', 'v4-view-modes.md', async ({ page }) => {
    // 1. Open the ChangeDown sidebar panel
    await command(page, 'changedownReview.focus');
    await beat(page, 300);

    // Click back on editor to keep it active (sidebar steals focus)
    const editorEl = await page.$('.view-lines');
    if (editorEl) {
        await editorEl.click({ position: { x: 300, y: 100 } });
        await beat(page, 200);
    }

    // 2. Show All Markup view — full CriticMarkup visible + sidebar panel
    await beat(page, 1500);

    // 3. Toggle to Simple Markup — delimiters hidden, colors remain
    await command(page, 'changedown.toggleView');
    await beat(page, 1500);

    // 4. Toggle to Final — shows settled document
    await command(page, 'changedown.toggleView');
    await beat(page, 1500);

    // 5. Toggle to Original — shows document before changes
    await command(page, 'changedown.toggleView');
    await beat(page, 1500);

    // 6. Toggle back to All Markup
    await command(page, 'changedown.toggleView');
    await beat(page, 1000);
});
