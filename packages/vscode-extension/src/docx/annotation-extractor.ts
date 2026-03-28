/**
 * Annotation extraction for DOCX preview sidebar.
 *
 * Reads ChangeNode.metadata on ALL change types using the canonical
 * 3-tier fallback (metadata > inlineMetadata > node fields).
 * Produces AnnotationCard objects for the sidebar panel.
 */

import { ChangeNode, ChangeType } from '@changedown/core';

export interface AnnotationCard {
    /** Unique ID for linking to inline anchor: "cn-pair-{range.start}" */
    pairId: string;
    /** The change's ID (e.g. "cn-5") */
    changeId: string;
    /** Change type: 'insertion', 'deletion', 'substitution', 'comment', 'highlight' */
    type: string;
    /** Author name (undefined for L0 changes) */
    author?: string;
    /** Date string */
    date?: string;
    /** Status: 'proposed', 'accepted', 'rejected' */
    status: string;
    /** Preview of the changed text (truncated) */
    textPreview: string;
    /** Full comment text if this is a standalone comment or has discussion */
    commentText?: string;
    /** Number of approvals */
    approvalCount: number;
    /** Number of rejections */
    rejectionCount: number;
    /** Whether this has discussion threads */
    hasDiscussion: boolean;
}

const MAX_PREVIEW = 60;

function changeTypeLabel(type: ChangeType): string {
    switch (type) {
        case ChangeType.Insertion: return 'insertion';
        case ChangeType.Deletion: return 'deletion';
        case ChangeType.Substitution: return 'substitution';
        case ChangeType.Highlight: return 'highlight';
        case ChangeType.Comment: return 'comment';
        default: return 'unknown';
    }
}

function truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    return text.slice(0, max - 1) + '\u2026';
}

/**
 * Extract annotation cards from parsed changes for the sidebar.
 *
 * Uses 3-tier metadata fallback:
 *   metadata?.field ?? inlineMetadata?.field ?? node.field
 */
export function buildAnnotationCards(changes: ChangeNode[], src: string): AnnotationCard[] {
    const cards: AnnotationCard[] = [];

    for (const c of changes) {
        const author = c.metadata?.author ?? c.inlineMetadata?.author ?? undefined;
        const date = c.metadata?.date ?? c.inlineMetadata?.date ?? undefined;
        const status = c.metadata?.status ?? c.inlineMetadata?.status ?? c.status ?? 'proposed';

        // Build text preview based on change type
        let textPreview = '';
        if (c.type === ChangeType.Comment) {
            textPreview = c.metadata?.comment
                ?? src.slice(c.contentRange.start, c.contentRange.end);
        } else if (c.type === ChangeType.Substitution) {
            const old = c.originalText ?? '';
            const mod = c.modifiedText ?? '';
            textPreview = `${old} \u2192 ${mod}`;
        } else if (c.type === ChangeType.Insertion) {
            textPreview = c.modifiedText
                ?? src.slice(c.contentRange.start, c.contentRange.end);
        } else if (c.type === ChangeType.Deletion) {
            textPreview = c.originalText
                ?? src.slice(c.contentRange.start, c.contentRange.end);
        } else if (c.type === ChangeType.Highlight) {
            textPreview = c.originalText
                ?? src.slice(c.contentRange.start, c.contentRange.end);
        }

        // Skip L0 changes with no metadata (bare markup, no author info),
        // but keep Comments and Highlights with merged comments
        const hasComment = c.metadata?.comment != null;
        if (!author && !date && c.type !== ChangeType.Comment && !hasComment) continue;

        // For Highlights with an adjacent Comment, use the highlight's pairId
        // so the sidebar card links to the correct inline element
        const pairId = `cn-pair-${c.range.start}`;

        // For Comments preceded by an adjacent Highlight, use the highlight's
        // range.start for pairId consistency (matches replacements.ts behavior)
        let effectivePairId = pairId;
        if (c.type === ChangeType.Comment) {
            const idx = changes.indexOf(c);
            const prev = idx > 0 ? changes[idx - 1] : undefined;
            if (prev && prev.type === ChangeType.Highlight && c.range.start === prev.range.end) {
                effectivePairId = `cn-pair-${prev.range.start}`;
            }
        }

        cards.push({
            pairId: effectivePairId,
            changeId: c.id,
            type: changeTypeLabel(c.type),
            author,
            date,
            status,
            textPreview: truncate(textPreview.trim(), MAX_PREVIEW),
            commentText: c.metadata?.comment,
            approvalCount: c.metadata?.approvals?.length ?? 0,
            rejectionCount: c.metadata?.rejections?.length ?? 0,
            hasDiscussion: (c.metadata?.discussion?.length ?? 0) > 0,
        });
    }

    return cards;
}
