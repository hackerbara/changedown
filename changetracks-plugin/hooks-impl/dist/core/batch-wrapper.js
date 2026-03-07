// core/batch-wrapper.ts — Platform-neutral batch CriticMarkup wrapper
//
// Reads pending edits, groups by file, allocates IDs, applies CriticMarkup
// wrapping + footnotes. This is the "log-then-batch" engine: PostToolUse
// logged raw edits during the agent's turn, and this function applies
// markup after the turn is complete (no offset drift during execution).
import * as fs from 'node:fs/promises';
import { generateFootnoteDefinition, scanMaxCtId, insertTrackingHeader, nowTimestamp } from '@changetracks/core';
import { readPendingEdits, clearSessionEdits } from '../pending.js';
import { findEditPosition, findDeletionInsertionPoint } from './edit-positioning.js';
/**
 * Determines if a pending edit should be treated as a file creation.
 *
 * Returns true when:
 * - edit_class is explicitly 'creation', OR
 * - edit is an insertion (old_text empty, new_text non-empty) where
 *   new_text covers >=95% of the file content (full-file safety guard)
 */
function isCreationEdit(edit, fileContent) {
    if (edit.edit_class === 'creation')
        return true;
    // Full-file safety guard: if old_text is empty and new_text is essentially
    // the entire file, this is a creation regardless of classification
    if (edit.old_text === '' && edit.new_text !== '' && fileContent.length > 0) {
        const ratio = edit.new_text.length / fileContent.length;
        if (ratio >= 0.95)
            return true;
    }
    return false;
}
/**
 * Core batch-wrapping engine. Reads all pending edits for a session,
 * groups them by file, allocates SC-IDs, applies CriticMarkup wrapping
 * and appends footnotes. Clears the session's edits when done.
 *
 * This function is platform-neutral: it does filesystem I/O directly
 * and does not depend on any hook protocol format. Platform adapters
 * (Claude Code Stop hook, Cursor hook, etc.) call this function and
 * translate the BatchResult into their specific output format.
 */
export async function applyPendingEdits(projectDir, sessionId, config) {
    const emptyResult = { editsApplied: 0, changeIds: [], message: '' };
    const pending = await readPendingEdits(projectDir);
    if (pending.length === 0) {
        return emptyResult;
    }
    // Filter to current session's edits
    const sessionEdits = pending.filter((e) => e.session_id === sessionId);
    if (sessionEdits.length === 0) {
        return emptyResult;
    }
    // Group edits by file
    const editsByFile = new Map();
    for (const edit of sessionEdits) {
        const existing = editsByFile.get(edit.file) || [];
        existing.push(edit);
        editsByFile.set(edit.file, existing);
    }
    const totalEdits = sessionEdits.length;
    const needsGroup = totalEdits > 1;
    const author = config.author.default || 'unknown';
    const date = nowTimestamp().date;
    // Scan ALL files for max ID before allocating any IDs
    let globalMaxId = 0;
    for (const [filePath] of editsByFile) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            globalMaxId = Math.max(globalMaxId, scanMaxCtId(content));
        }
        catch { /* skip unreadable files */ }
    }
    const parentId = needsGroup ? globalMaxId + 1 : 0;
    let nextFlatId = globalMaxId;
    const allEditsWithIds = [];
    let childCounter = 0;
    for (const [, edits] of editsByFile) {
        for (const edit of edits) {
            let changeId;
            if (needsGroup) {
                childCounter++;
                changeId = `ct-${parentId}.${childCounter}`;
            }
            else {
                nextFlatId++;
                changeId = `ct-${nextFlatId}`;
            }
            allEditsWithIds.push({ ...edit, changeId });
        }
    }
    const allChangeIds = allEditsWithIds.map((e) => e.changeId);
    // Re-group edits with IDs by file for processing
    const editsWithIdsByFile = new Map();
    for (const edit of allEditsWithIds) {
        const existing = editsWithIdsByFile.get(edit.file) || [];
        existing.push(edit);
        editsWithIdsByFile.set(edit.file, existing);
    }
    let isFirstFile = true;
    // Process each file
    for (const [filePath, edits] of editsWithIdsByFile) {
        let fileContent;
        try {
            fileContent = await fs.readFile(filePath, 'utf-8');
        }
        catch {
            // File no longer exists - skip
            continue;
        }
        // Collect footnotes, append as a single block
        const footnotes = [];
        // Generate parent footnote for groups (once, on the first file)
        if (needsGroup && isFirstFile) {
            const parentFootnote = generateFootnoteDefinition(`ct-${parentId}`, 'group', author, date);
            footnotes.push(parentFootnote);
            isFirstFile = false;
        }
        else if (isFirstFile) {
            isFirstFile = false;
        }
        // Process edits in REVERSE order to preserve string positions
        const sortedEdits = [...edits].reverse();
        for (const edit of sortedEdits) {
            const changeId = edit.changeId;
            // -- Creation path: footnote-only, no inline wrapping --
            if (isCreationEdit(edit, fileContent)) {
                const creationMode = config.policy.creation_tracking;
                if (creationMode === 'none') {
                    // Don't track at all - skip this edit entirely
                    continue;
                }
                if (creationMode === 'footnote') {
                    // Add tracking header if not present
                    const { newText, headerInserted } = insertTrackingHeader(fileContent);
                    if (headerInserted) {
                        fileContent = newText;
                    }
                    // Collect creation footnote (no inline markup)
                    const footnote = generateFootnoteDefinition(changeId, 'creation', author, date);
                    footnotes.push(footnote);
                    continue;
                }
                // creationMode === 'inline': fall through to existing wrapping logic below
            }
            // -- Existing wrapping logic (insertion/deletion/substitution) --
            let changeType;
            if (edit.old_text === '' && edit.new_text !== '') {
                // Insertion: new_text is already in the file. Wrap it with markup.
                changeType = 'ins';
                const markup = `{++${edit.new_text}++}[^${changeId}]`;
                const { start: pos } = findEditPosition(fileContent, edit.new_text, edit.context_before, edit.context_after);
                if (pos >= 0) {
                    fileContent =
                        fileContent.slice(0, pos) +
                            markup +
                            fileContent.slice(pos + edit.new_text.length);
                }
            }
            else if (edit.new_text === '' && edit.old_text !== '') {
                // Deletion: old_text was already removed from the file.
                changeType = 'del';
                const markup = `{--${edit.old_text}--}[^${changeId}]`;
                const insertPos = findDeletionInsertionPoint(fileContent, edit);
                if (insertPos >= 0) {
                    fileContent =
                        fileContent.slice(0, insertPos) +
                            markup +
                            fileContent.slice(insertPos);
                }
            }
            else {
                // Substitution: new_text is already in the file. Replace with markup.
                changeType = 'sub';
                const markup = `{~~${edit.old_text}~>${edit.new_text}~~}[^${changeId}]`;
                const { start: pos } = findEditPosition(fileContent, edit.new_text, edit.context_before, edit.context_after);
                if (pos >= 0) {
                    fileContent =
                        fileContent.slice(0, pos) +
                            markup +
                            fileContent.slice(pos + edit.new_text.length);
                }
            }
            // Collect footnote for batch append
            const footnote = generateFootnoteDefinition(changeId, changeType, author, date);
            footnotes.push(footnote);
        }
        // Append all footnotes as a single block (no double blank lines)
        if (footnotes.length > 0) {
            const footnoteBlock = footnotes.map((f) => f.trimStart()).join('\n');
            fileContent = fileContent.trimEnd() + '\n\n' + footnoteBlock + '\n';
        }
        await fs.writeFile(filePath, fileContent, 'utf-8');
        footnotes.length = 0; // Reset for next file
    }
    // Clear only this session's edits (not all sessions)
    await clearSessionEdits(projectDir, sessionId);
    // Build summary
    const summary = allChangeIds.map((id) => `  [^${id}]`).join('\n');
    const message = `ChangeTracks recorded ${totalEdits} edit(s) this turn:\n${summary}\n` +
        'Consider adding reasoning with review_changes for non-obvious changes.';
    return {
        editsApplied: totalEdits,
        changeIds: allChangeIds,
        message,
    };
}
//# sourceMappingURL=batch-wrapper.js.map