/**
 * Minimal interface for the context fields needed by findDeletionInsertionPoint.
 * Structurally compatible with PendingEdit — any object with these optional
 * fields satisfies the constraint.
 */
export interface EditContext {
    context_before?: string;
    context_after?: string;
}
/**
 * Finds the position of `targetText` in `fileContent` using context fields
 * for disambiguation when `targetText` appears multiple times.
 *
 * Strategy cascade:
 * 1. contextBefore + targetText + contextAfter (most specific)
 * 2. contextBefore + targetText
 * 3. targetText + contextAfter
 * 4. indexOf(targetText) (last resort)
 *
 * Returns `{ start, end }` — the character range of `targetText` in `fileContent`,
 * or `{ start: -1, end: -1 }` if not found.
 */
export declare function findEditPosition(fileContent: string, targetText: string, contextBefore?: string, contextAfter?: string): {
    start: number;
    end: number;
};
/**
 * Finds where to insert deletion markup in the post-edit file.
 * Uses context_before and context_after to locate the deletion point.
 * Returns the character index where the deletion markup should be inserted,
 * or -1 if the position cannot be determined.
 */
export declare function findDeletionInsertionPoint(fileContent: string, edit: EditContext): number;
