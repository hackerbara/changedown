/**
 * Video Script: Accept & Reject Changes
 *
 * Demonstrates multi-author tracked changes: hover to see author info
 * and reasons, then accept/reject changes one by one.
 * Fixture has 4 changes from 3 different authors with footnote metadata.
 *
 * ~11 seconds runtime.
 */

import { registerVideoScript, beat, command, positionCursor } from '../record';

registerVideoScript('v2-accept-reject', 'v2-accept-reject.md', async ({ page }) => {
    // 1. Brief view of document with colored multi-author changes
    await beat(page, 500);

    // 2. Hover over alice's insertion to show author + reason
    await positionCursor(page, 'now supports', 'before');
    await command(page, 'editor.action.showHover');
    await beat(page, 1800);

    // 3. Hover over bob's deletion — different author
    await positionCursor(page, 'should be disabled', 'before');
    await command(page, 'editor.action.showHover');
    await beat(page, 1800);

    // 4. Accept bob's deletion (cursor is already in it)
    await command(page, 'changetracks.acceptChange');
    await beat(page, 600);

    // 5. Navigate to next change (alice's substitution) and reject it
    await command(page, 'changetracks.nextChange');
    await beat(page, 600);
    await command(page, 'changetracks.rejectChange');
    await beat(page, 600);

    // 6. Navigate to highlight and accept it
    await command(page, 'changetracks.nextChange');
    await beat(page, 600);
    await command(page, 'changetracks.acceptChange');
    await beat(page, 1000);
}, { 'changetracks.commentsExpandedByDefault': false });
