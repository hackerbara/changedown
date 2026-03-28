/**
 * Pure thread-data builders for comment threads.
 *
 * These functions mirror the logic in ChangeComments.buildComments() and
 * ChangeComments.refreshThreads(), but operate on plain data types instead
 * of the VS Code Comment API. This allows @fast tier tests to exercise
 * thread-building logic without launching VS Code or installing a mock.
 *
 * ChangeComments (change-comments.ts) remains the authoritative runtime
 * implementation; these pure functions are the canonical source of the
 * business rules that both production and test code share.
 */

import type { ChangeNode } from '@changedown/core';
import { ChangeStatus } from '@changedown/core';
import { typeLabel, typeLabelCapitalized } from './visual-semantics';

// ── Pure data types ──────────────────────────────────────────────────

export interface CommentData {
    author: string;
    body: string;
}

export interface ThreadData {
    id: string;
    label: string;
    comments: CommentData[];
}

// ── View modes where threads are hidden (clean preview) ──────────────

const THREAD_HIDDEN_VIEW_MODES = new Set(['settled', 'raw']);

// ── Pure builders ────────────────────────────────────────────────────

/**
 * Build CommentData[] from a ChangeNode's footnote metadata.
 *
 * Produces the same comment structure as ChangeComments.buildComments(),
 * but returns plain {author, body} objects instead of vscode.Comment.
 */
export function buildCommentsForChange(change: ChangeNode): CommentData[] {
    const comments: CommentData[] = [];
    const meta = change.metadata;

    // First comment: change summary
    const statusLabel = change.status === ChangeStatus.Accepted ? 'accepted'
        : change.status === ChangeStatus.Rejected ? 'rejected' : 'proposed';
    const tLabel = typeLabel(change.type);
    let body = `**${tLabel}** \u00b7 ${statusLabel}`;
    if (meta?.comment) {
        body += '\n\n' + meta.comment;
    }

    comments.push({
        author: meta?.author ?? change.inlineMetadata?.author ?? 'unknown',
        body,
    });

    // Discussion entries from footnote
    if (meta?.discussion) {
        for (const entry of meta.discussion) {
            let entryBody = '';
            if (entry.label) {
                entryBody += `**${entry.label}:** `;
            }
            entryBody += entry.text;
            comments.push({
                author: entry.author,
                body: entryBody,
            });
        }
    }

    // Approval entries
    if (meta?.approvals) {
        for (const approval of meta.approvals) {
            let approvalBody = 'Approved';
            if (approval.reason) {
                approvalBody += `: ${approval.reason}`;
            }
            comments.push({
                author: approval.author,
                body: approvalBody,
            });
        }
    }

    // Rejection entries
    if (meta?.rejections) {
        for (const rejection of meta.rejections) {
            let rejectionBody = 'Rejected';
            if (rejection.reason) {
                rejectionBody += `: ${rejection.reason}`;
            }
            comments.push({
                author: rejection.author,
                body: rejectionBody,
            });
        }
    }

    return comments;
}

/**
 * Build ThreadData[] from parsed ChangeNodes.
 *
 * Mirrors ChangeComments.refreshThreads() filtering logic:
 * - Skips L0 changes (no footnote metadata)
 * - Returns empty array in 'settled' or 'raw' view modes (clean preview)
 *
 * @param changes  Parsed ChangeNode array.
 * @param viewMode Optional view mode. When 'settled' or 'raw', returns
 *                 empty array (threads hidden in Final/Original preview).
 */
export function buildThreadDataForChanges(changes: ChangeNode[], viewMode?: string): ThreadData[] {
    // Final and Original modes hide all lifecycle surfaces
    if (viewMode && THREAD_HIDDEN_VIEW_MODES.has(viewMode)) {
        return [];
    }

    const threads: ThreadData[] = [];

    for (const change of changes) {
        // Create threads for all L1/L2 changes (mirrors change-comments.ts)
        if (change.level < 1) continue;

        const author = change.metadata?.author ?? change.inlineMetadata?.author ?? 'unknown';
        const label = `${typeLabelCapitalized(change.type)} by ${author}`;
        const comments = buildCommentsForChange(change);

        threads.push({
            id: change.id,
            label,
            comments,
        });
    }

    return threads;
}
