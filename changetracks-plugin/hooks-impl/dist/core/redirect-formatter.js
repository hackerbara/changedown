// core/redirect-formatter.ts — Format warm redirect messages for hook blocks
//
// When a raw Edit/Write is blocked in strict mode, this module generates
// a pre-formatted propose_change call that the agent can copy-paste.
// Supports both classic (old_text/new_text) and compact (at+op) protocols.
import { computeLineHash } from '@changetracks/core';
export function formatRedirect(input) {
    const { toolName, filePath, oldText, newText, fileContent, config } = input;
    if (toolName === 'Write') {
        return formatWriteRedirect(filePath, fileContent, newText, config);
    }
    if (config.protocol.mode === 'compact' && config.hashline.enabled) {
        return formatCompactRedirect(filePath, oldText, newText, fileContent);
    }
    return formatClassicRedirect(filePath, oldText, newText);
}
function formatClassicRedirect(filePath, oldText, newText) {
    const escOld = oldText.replace(/"/g, '\\"');
    const escNew = newText.replace(/"/g, '\\"');
    return `This file is tracked (strict mode). Your edit, ready to submit:

  propose_change(
    file="${filePath}",
    old_text="${escOld}",
    new_text="${escNew}",
    reason="[describe what this change achieves]"
  )`;
}
function formatCompactRedirect(filePath, oldText, newText, fileContent) {
    const lines = fileContent.split('\n');
    const lineIdx = lines.findIndex(l => l.includes(oldText.split('\n')[0]));
    if (lineIdx === -1) {
        return `This file is tracked (strict mode, compact). Text not found in file.
Use read_tracked_file to get current content and LINE:HASH coordinates.`;
    }
    const lineNum = lineIdx + 1;
    const hash = computeLineHash(lineIdx, lines[lineIdx], lines);
    const oldLines = oldText.split('\n');
    if (oldLines.length > 1) {
        const endLineIdx = lineIdx + oldLines.length - 1;
        const endHash = computeLineHash(endLineIdx, lines[endLineIdx], lines);
        return `This file is tracked (strict mode, compact). Your edit spans lines ${lineNum}-${endLineIdx + 1}:

  propose_change(
    file="${filePath}",
    at="${lineNum}:${hash}-${endLineIdx + 1}:${endHash}",
    op="~>${newText.replace(/"/g, '\\"')} >>describe what this change achieves"
  )

Hash range replaces the full block — no need to reproduce old text.`;
    }
    return `This file is tracked (strict mode, compact). Your edit, ready to submit:

  propose_change(
    file="${filePath}",
    at="${lineNum}:${hash}",
    op="${oldText}~>${newText} >>describe what this change achieves"
  )

The >>annotation is your reasoning — it becomes part of the change's footnote.`;
}
function formatWriteRedirect(filePath, oldContent, newContent, config) {
    // Detect pure insertion: new content starts with all of old content
    if (newContent.startsWith(oldContent) && newContent.length > oldContent.length) {
        const inserted = newContent.slice(oldContent.length);
        const oldLines = oldContent.split('\n');
        const lastLine = oldLines.length;
        if (config.protocol.mode === 'compact' && config.hashline.enabled) {
            const hash = computeLineHash(lastLine - 1, oldLines[lastLine - 1], oldLines);
            return `This file is tracked (strict mode, compact). Detected insertion after line ${lastLine}:

  propose_change(
    file="${filePath}",
    at="${lastLine}:${hash}",
    op="+${inserted.replace(/"/g, '\\"')} >>describe what this change achieves"
  )`;
        }
        return `This file is tracked (strict mode). Detected insertion after last line:

  propose_change(
    file="${filePath}",
    old_text="",
    new_text="${inserted.slice(0, 200).replace(/"/g, '\\"')}${inserted.length > 200 ? '...' : ''}",
    insert_after="${oldLines[lastLine - 1].slice(0, 80).replace(/"/g, '\\"')}",
    reason="[describe what this change achieves]"
  )`;
    }
    // Multiple changes — can't decompose, point agent to read_tracked_file
    return `This file is tracked (strict mode). Your Write changes multiple sections.
Read the file to get coordinates, then submit changes as a batch:

  read_tracked_file(file="${filePath}")

  propose_change(
    file="${filePath}",
    changes=[...]
  )`;
}
export function formatReadRedirect(filePath, config) {
    const view = config.policy?.default_view ?? 'review';
    return `This file is tracked (strict mode). Use read_tracked_file for tracked content:

  read_tracked_file(
    file="${filePath}",
    view="${view}"
  )

This provides change metadata, hashline coordinates, and deliberation context.`;
}
//# sourceMappingURL=redirect-formatter.js.map