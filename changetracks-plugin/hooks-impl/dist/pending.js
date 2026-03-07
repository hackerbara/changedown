import * as fs from 'node:fs/promises';
import * as path from 'node:path';
function pendingPath(projectDir) {
    return path.join(projectDir, '.changetracks', 'pending.json');
}
/**
 * Reads all pending edits from `.changetracks/pending.json`.
 * Returns an empty array if the file does not exist or contains invalid JSON.
 */
export async function readPendingEdits(projectDir) {
    try {
        const raw = await fs.readFile(pendingPath(projectDir), 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return [];
    }
}
/**
 * Appends a single edit to `.changetracks/pending.json`.
 * Creates the `.changetracks/` directory and file if they do not exist.
 */
export async function appendPendingEdit(projectDir, edit) {
    const filePath = pendingPath(projectDir);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const existing = await readPendingEdits(projectDir);
    existing.push(edit);
    await fs.writeFile(filePath, JSON.stringify(existing, null, 2), 'utf-8');
}
/**
 * Removes the pending.json file, clearing all pending edits.
 */
export async function clearPendingEdits(projectDir) {
    try {
        await fs.unlink(pendingPath(projectDir));
    }
    catch {
        // File already absent — nothing to do
    }
}
/**
 * Removes only the specified session's edits from pending.json.
 * If no edits remain after filtering, deletes the file entirely.
 * This prevents one session's Stop hook from wiping another session's pending edits.
 */
export async function clearSessionEdits(projectDir, sessionId) {
    const filePath = pendingPath(projectDir);
    const all = await readPendingEdits(projectDir);
    const remaining = all.filter((e) => e.session_id !== sessionId);
    if (remaining.length === 0) {
        try {
            await fs.unlink(filePath);
        }
        catch {
            // File already absent — nothing to do
        }
    }
    else {
        await fs.writeFile(filePath, JSON.stringify(remaining, null, 2), 'utf-8');
    }
}
//# sourceMappingURL=pending.js.map