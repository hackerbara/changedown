/**
 * View modes for document display.
 *
 * Canonical names (from core):
 *   review   = All Markup
 *   changes  = Simple Markup
 *   settled  = Final
 *   raw      = Original
 *
 * This module re-exports the canonical ViewName from core as ViewMode,
 * keeping backward compatibility with extension code that uses ViewMode.
 */
import {
    type ViewName,
    VIEW_NAMES,
    VIEW_NAME_DISPLAY_NAMES,
    nextViewName,
    resolveViewName,
    type ChangeNode,
    ChangeType,
} from '@changedown/core';

/** ViewMode is an alias for the canonical ViewName from core. */
export type ViewMode = ViewName;

/** Display labels for each view mode. */
export const VIEW_MODE_LABELS: Record<ViewMode, string> = VIEW_NAME_DISPLAY_NAMES;

/** Ordered list of view modes for cycling. */
export const VIEW_MODES: ViewMode[] = [...VIEW_NAMES];

/** Cycle to the next view mode. */
export function nextViewMode(current: ViewMode): ViewMode {
    return nextViewName(current);
}

/**
 * Resolve any alias (legacy or canonical) to a ViewMode.
 * Used when reading user config that uses old display names.
 */
export { resolveViewName };

/**
 * Returns true if a change should be navigable in the given view mode.
 * Simple mode deletions return true because cursor arrival reveals them.
 */
export function isChangeVisibleInMode(
    change: ChangeNode,
    viewMode: ViewMode,
    showDelimiters: boolean
): boolean {
    // Settled refs: visible only when showDelimiters is on
    if (change.settled && !showDelimiters) return false;

    if (viewMode === 'settled') {
        // Final mode: hide deletions
        if (change.type === ChangeType.Deletion) return false;
        return true;
    }
    if (viewMode === 'raw') {
        // Original mode: hide insertions
        if (change.type === ChangeType.Insertion) return false;
        return true;
    }
    // Review and Simple modes: all changes navigable
    return true;
}
