import { scanMaxCnId } from '@changedown/core';
import type { SessionHashes } from '@changedown/core';
import type { BuiltinView } from '@changedown/core/host';
import type { ReadGeneration, WriteTransform } from './state.js';

export type { BuiltinView };
/** @deprecated Use BuiltinView directly */
export type ViewName = BuiltinView;

export interface FileRecord {
  lastReadView: BuiltinView;
  contentFingerprint: string;
  recordedAt: number;
}

export interface ActiveGroup {
  id: string;
  numericId: number;
  description: string;
  reasoning?: string;
  childCount: number;
  childIds: string[];
  files: Set<string>;
}

/**
 * Per-view primary hash field. Used by resolveHash to pick which field
 * matches the agent's margin-displayed hash.
 */
const primaryHashForView: Record<BuiltinView, keyof Pick<SessionHashes, 'raw' | 'committed' | 'currentView'>> = {
  working:  'raw',
  simple:   'currentView',
  decided:  'committed',
  original: 'raw',
  raw:      'raw',
};

/**
 * Session state manager that tracks per-file ID counters for generating
 * unique `cn-N` change identifiers, and manages change group lifecycle.
 *
 * On first call for a file, scans existing `[^cn-N]` patterns in the
 * document text to find the max ID. Subsequent calls increment from
 * the cached value without re-scanning.
 *
 * When a group is active (via `beginGroup`), `getNextId` returns dotted
 * child IDs (`cn-N.M`) instead of flat IDs. The group parent ID (`cn-N`)
 * is reserved for the group footnote written by `endGroup`.
 *
 * --- Fork divergence from opencode-plugin SessionState ---
 *
 * A stripped-down fork exists at `packages/opencode-plugin/src/state.ts`.
 * That version intentionally omits:
 *
 *   - View-tracking: `ViewName`, `FileRecord`, `recordAfterRead`,
 *     `rerecordAfterWrite`, `getLastReadView`, `isStale`, `resolveHash`
 *     (opencode does not participate in the MCP read/write session protocol)
 *
 *   - Extended hash fields: `committed`, `currentView`, `rawLineNum`
 *     (opencode only needs `raw` + `current` for its stop-hook batch)
 *
 *   - Different `beginGroup` semantics: the opencode version incorporates
 *     `globalMaxId` and iterates per-file counters to avoid cross-file
 *     collisions in its one-shot batch scenario, while this version uses
 *     `(knownMaxId || 0) + 1` for independent group allocation within a
 *     persistent MCP stdio session.
 *
 * If you modify shared logic (getNextId, group lifecycle), check both files:
 *   - packages/cli/src/engine/state.ts               (this file)
 *   - packages/opencode-plugin/src/state.ts          (opencode fork)
 */
export class SessionState {
  private counters: Map<string, number> = new Map();
  private globalMaxId: number = 0;
  private activeGroup: ActiveGroup | null = null;
  private fileHashesByView: Map<string, Map<BuiltinView, Array<{ line: number; raw: string; committed?: string; currentView?: string; rawLineNum?: number }>>> = new Map();
  private fileRecords: Map<string, FileRecord> = new Map();
  private guideShownForMode: 'classic' | 'compact' | null = null;
  private guideSuppressed = true;

  /**
   * Starts a new change group. Allocates a group parent ID starting from 1
   * (or from knownMaxId if provided). While active, all `getNextId` calls
   * return dotted child IDs under this parent.
   *
   * @param knownMaxId - Optional max ID from files that will be edited in this group
   * @throws {Error} if a group is already active
   */
  beginGroup(description: string, reasoning?: string, knownMaxId?: number): string {
    if (this.activeGroup) {
      throw new Error('A change group is already active. End the current group before starting a new one.');
    }

    // Start from 1 or from knownMaxId if provided
    // Do NOT use globalMaxId - each file and group should be independent
    const numericId = (knownMaxId || 0) + 1;
    const groupId = `cn-${numericId}`;

    this.activeGroup = {
      id: groupId,
      numericId,
      description,
      reasoning,
      childCount: 0,
      childIds: [],
      files: new Set(),
    };

    return groupId;
  }

  /**
   * Returns the next available change identifier for the given file.
   *
   * When a group is active, returns a dotted child ID (`cn-N.M`) and
   * tracks the file as part of the group. Otherwise returns a flat
   * `cn-N` identifier.
   *
   * On first call for a file (outside a group), uses `scanMaxCnId(currentText)`
   * to find the max existing ID, then returns `cn-(max+1)`. On subsequent
   * calls, increments from the cached counter.
   */
  getNextId(filePath: string, currentText: string): string {
    filePath = this.normalizePath(filePath);
    if (this.activeGroup) {
      // In a group: assign dotted child ID
      this.activeGroup.childCount++;
      const childId = `cn-${this.activeGroup.numericId}.${this.activeGroup.childCount}`;
      this.activeGroup.childIds.push(childId);
      this.activeGroup.files.add(filePath);

      // Update the file's counter to at least the parent ID so future
      // non-group IDs don't collide with the group's reserved range
      const currentCounter = this.counters.get(filePath);
      if (currentCounter === undefined) {
        const scannedMax = scanMaxCnId(currentText);
        this.counters.set(filePath, Math.max(scannedMax, this.activeGroup.numericId));
      } else {
        this.counters.set(filePath, Math.max(currentCounter, this.activeGroup.numericId));
      }

      return childId;
    }

    // Original logic: flat cn-N IDs
    let counter = this.counters.get(filePath);
    if (counter === undefined) {
      // First call for this file: scan existing IDs from this file only
      counter = scanMaxCnId(currentText);
    }
    counter++;

    // Each file tracks its own IDs independently
    this.counters.set(filePath, counter);
    return `cn-${counter}`;
  }

  /**
   * Returns whether a change group is currently active.
   */
  hasActiveGroup(): boolean {
    return this.activeGroup !== null;
  }

  /**
   * Returns the active group info, or null if no group is active.
   */
  getActiveGroup(): ActiveGroup | null {
    return this.activeGroup;
  }

  /**
   * Ends the current change group and returns a summary of all child
   * changes and affected files.
   *
   * @throws {Error} if no group is active
   */
  endGroup(): { id: string; description: string; reasoning?: string; childIds: string[]; files: string[] } {
    if (!this.activeGroup) {
      throw new Error('No active change group to end.');
    }

    const result = {
      id: this.activeGroup.id,
      description: this.activeGroup.description,
      reasoning: this.activeGroup.reasoning,
      childIds: [...this.activeGroup.childIds],
      files: [...this.activeGroup.files],
    };
    this.activeGroup = null;
    return result;
  }

  /**
   * Clears the cached ID counter for a file. The next `getNextId` call
   * will re-scan the document text to determine the max existing ID.
   */
  resetFile(filePath: string): void {
    filePath = this.normalizePath(filePath);
    this.counters.delete(filePath);
  }

  /**
   * Records per-line hashes for a file, used for staleness detection.
   * Called by `read_tracked_file` after computing hashline output.
   * Overwrites the recorded hashes for the last-read view of the file.
   */
  recordFileHashes(filePath: string, hashes: Array<{ line: number; raw: string; committed?: string; currentView?: string; rawLineNum?: number }>): void {
    filePath = this.normalizePath(filePath);
    const view = this.getLastReadView(filePath) ?? 'working';
    if (!this.fileHashesByView.has(filePath)) {
      this.fileHashesByView.set(filePath, new Map());
    }
    this.fileHashesByView.get(filePath)!.set(view, hashes);
  }

  /**
   * Returns the recorded per-line hashes for a file, or undefined if
   * the file has not been read via `read_tracked_file` in this session.
   *
   * When `view` is omitted, returns hashes for the last-read view of the file
   * (i.e. whatever view was most recently passed to `recordAfterRead`). Falls
   * back to `'raw'` if no view has been recorded for the file yet.
   */
  getRecordedHashes(filePath: string, view?: BuiltinView): Array<{ line: number; raw: string; committed?: string; currentView?: string; rawLineNum?: number }> | undefined {
    filePath = this.normalizePath(filePath);
    const viewTables = this.fileHashesByView.get(filePath);
    if (!viewTables) return undefined;
    const targetView = view ?? this.getLastReadView(filePath) ?? 'raw';
    return viewTables.get(targetView);
  }

  /**
   * Records state after a read_tracked_file call: stores the view name,
   * per-line hashes, and a content fingerprint for staleness detection.
   */
  recordAfterRead(
    filePath: string,
    view: BuiltinView,
    hashes: Array<{ line: number; raw: string; committed?: string; currentView?: string; rawLineNum?: number }>,
    rawContent: string,
  ): void {
    filePath = this.normalizePath(filePath);
    const newFingerprint = this.fingerprint(rawContent);
    const existingRecord = this.fileRecords.get(filePath);

    // If file content changed, invalidate ALL view tables
    if (existingRecord && existingRecord.contentFingerprint !== newFingerprint) {
      this.fileHashesByView.delete(filePath);
    }

    // Store hash table for this view
    if (!this.fileHashesByView.has(filePath)) {
      this.fileHashesByView.set(filePath, new Map());
    }
    this.fileHashesByView.get(filePath)!.set(view, hashes);

    this.fileRecords.set(filePath, {
      lastReadView: view,
      contentFingerprint: newFingerprint,
      recordedAt: Date.now(),
    });
  }

  /**
   * Refreshes state after a write operation. Clears the ID counter cache
   * (so the next getNextId re-scans), updates hashes, and updates the
   * content fingerprint. Preserves the lastReadView from the prior read.
   */
  rerecordAfterWrite(
    filePath: string,
    newContent: string,
    hashes: Array<{ line: number; raw: string; committed?: string; currentView?: string; rawLineNum?: number }>,
  ): void {
    filePath = this.normalizePath(filePath);
    const existingRecord = this.fileRecords.get(filePath);
    this.resetFile(filePath);
    // Clear ALL view tables (content changed)
    this.fileHashesByView.delete(filePath);
    // Store new hashes under lastReadView
    const view = existingRecord?.lastReadView ?? 'working';
    const viewTables = new Map<BuiltinView, typeof hashes>();
    viewTables.set(view, hashes);
    this.fileHashesByView.set(filePath, viewTables);
    this.fileRecords.set(filePath, {
      lastReadView: view,
      contentFingerprint: this.fingerprint(newContent),
      recordedAt: Date.now(),
    });
  }

  // No-op for browser context: read-generation tracking is not maintained.
  invalidateReadGeneration(_filePath: string): void {}

  // No-op for browser context: no read generation is tracked; always returns undefined.
  getReadGeneration(_filePath: string): ReadGeneration | undefined {
    return undefined;
  }

  // No-op for browser context: write transforms are not accumulated.
  recordWriteTransform(_filePath: string, _transform: WriteTransform): void {}

  // No-op for browser context: no write transforms are stored; always returns empty array.
  getWriteTransforms(_filePath: string): WriteTransform[] {
    return [];
  }

  // No-op for browser context: no read generation hash resolution is available; always returns undefined.
  resolveReadGenerationHash(
    _filePath: string,
    _line: number,
    _suppliedHash: string,
  ): { rawLineNum: number; view: BuiltinView; generationId: string } | undefined {
    return undefined;
  }

  /**
   * Returns all absolute paths that have been read via `read_tracked_file`
   * in this session. Used by `FileBackend.list()` to enumerate resources.
   */
  getAccessedPaths(): string[] {
    return Array.from(this.fileRecords.keys());
  }

  /**
   * Returns the view name from the last read_tracked_file call for this file,
   * or undefined if the file has not been read in this session.
   */
  getLastReadView(filePath: string): BuiltinView | undefined {
    filePath = this.normalizePath(filePath);
    return this.fileRecords.get(filePath)?.lastReadView;
  }

  /**
   * Returns true if the file's content has changed since the last read.
   * Compares the stored fingerprint against a fingerprint of the given content.
   */
  isStale(filePath: string, currentContent: string): boolean {
    filePath = this.normalizePath(filePath);
    const record = this.fileRecords.get(filePath);
    if (!record) return true;
    return record.contentFingerprint !== this.fingerprint(currentContent);
  }

  /**
   * Resolves the correct hash for a given line based on the lastReadView.
   * - working: returns raw hash (display↔hash alignment)
   * - simple: returns currentView hash (current projection coordinate space)
   * - decided: returns committed hash
   * - raw/original: returns raw hash
   *
   * When `suppliedHash` is provided, returns a discriminated union:
   *   - `{ match: true, rawLineNum, view }` if the supplied hash matches the expected hash
   *   - `{ match: false, expectedHash, view }` if the supplied hash does not match
   *
   * When `suppliedHash` is omitted, behaves backward-compatibly and always returns
   * `{ match: true, rawLineNum, view }` (no validation performed).
   *
   * Returns undefined if the file has not been read or the line is not found.
   */
  resolveHash(
    filePath: string,
    line: number,
    suppliedHash?: string,
  ):
    | { match: true; rawLineNum: number; view: BuiltinView }
    | { match: false; expectedHash: string; view: BuiltinView }
    | undefined {
    filePath = this.normalizePath(filePath);
    const viewTables = this.fileHashesByView.get(filePath);
    const lastView = this.getLastReadView(filePath);
    if (!viewTables || viewTables.size === 0 || !lastView) return undefined;

    if (suppliedHash === undefined) {
      // Backward-compatible: no hash supplied, use lastReadView
      const hashes = viewTables.get(lastView);
      if (!hashes) return undefined;
      const entry = hashes.find((h) => h.line === line);
      if (!entry) return undefined;
      return { match: true, rawLineNum: entry.rawLineNum ?? entry.line, view: lastView };
    }

    const HASH_FIELDS: Array<'raw' | 'committed' | 'currentView'> = ['raw', 'committed', 'currentView'];

    // Stage 1: exact match at supplied line — primary field first, then same-line fallbacks
    {
      const primary = primaryHashForView[lastView];
      const hashes = viewTables.get(lastView);
      if (hashes) {
        const entry = hashes.find((h) => h.line === line);
        if (entry) {
          // Try primary field
          if (suppliedHash === entry[primary]) {
            return { match: true, rawLineNum: entry.rawLineNum ?? entry.line, view: lastView };
          }
          // Same-line cross-field fallback (other fields at the same line)
          for (const field of HASH_FIELDS) {
            if (field === primary) continue;
            const value: string | undefined = entry[field];
            if (value !== undefined && suppliedHash === value) {
              return { match: true, rawLineNum: entry.rawLineNum ?? entry.line, view: lastView };
            }
          }
        }
      }
    }

    // Stage 2: content-addressed scan — primary field only (no cross-field) to avoid ambiguity.
    // Only triggered when the line was recorded in at least one view (hash mismatch due to shift),
    // not when the line number was never valid.
    // Mirrors relocateHashRef's uniqueness guarantee — only returns if exactly one entry matches.
    let foundLineInAnyView = false;
    for (const [view, hashes] of viewTables) {
      const entry = hashes.find((h) => h.line === line);
      if (entry) { foundLineInAnyView = true; break; }
    }

    if (foundLineInAnyView) {
      for (const [view, hashes] of viewTables) {
        const viewPrimary = primaryHashForView[view];
        let uniqueMatch: (typeof hashes)[0] | undefined;
        let ambiguous = false;
        for (const entry of hashes) {
          if (suppliedHash === entry[viewPrimary]) {
            if (uniqueMatch) { ambiguous = true; break; }
            uniqueMatch = entry;
          }
        }
        if (uniqueMatch && !ambiguous) {
          return { match: true, rawLineNum: uniqueMatch.rawLineNum ?? uniqueMatch.line, view };
        }
      }
    }

    // No match — return error context from lastReadView
    const lastHashes = viewTables.get(lastView);
    if (lastHashes) {
      const entry = lastHashes.find((h) => h.line === line);
      if (entry) {
        return { match: false, expectedHash: entry[primaryHashForView[lastView]] ?? entry.raw, view: lastView };
      }
    }

    // Line not found in any view
    return undefined;
  }

  /**
   * Returns the protocol mode for which the first-contact guide was shown
   * in this session, or null if it has not been shown yet.
   */
  getGuideShownForMode(): 'classic' | 'compact' | null {
    return this.guideShownForMode;
  }

  isGuideSuppressed(): boolean {
    return this.guideSuppressed;
  }

  /**
   * Records that the first-contact guide has been shown for the given
   * protocol mode in this session.
   */
  setGuideShown(mode: 'classic' | 'compact'): void {
    this.guideShownForMode = mode;
  }

  /**
   * Suppresses the first-contact guide for any protocol mode.
   * Guide is suppressed by default; call enableGuide() to allow it.
   */
  suppressGuide(): void {
    this.guideSuppressed = true;
  }

  /**
   * Enables the first-contact guide. Called by the production MCP server
   * and by tests that specifically exercise guide delivery.
   */
  enableGuide(): void {
    this.guideSuppressed = false;
  }

  /**
   * Computes a simple string fingerprint for content comparison.
   * Uses a fast non-cryptographic hash (djb2 variant).
   */
  private fingerprint(content: string): string {
    let hash = 5381;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) + hash + content.charCodeAt(i)) | 0;
    }
    return hash.toString(36);
  }

  /**
   * Normalizes a file path to a canonical form for consistent Map key usage.
   * Resolves relative paths and follows symlinks. If the file doesn't exist
   * yet, walks up to the nearest existing ancestor, resolves its realpath,
   * and appends remaining segments.
   */
  private normalizePath(filePath: string): string {
    // Browser/Worker-safe session state preserves opaque backend URIs and uses
    // the provided key verbatim for non-URI paths. The Node SessionState can
    // realpath filesystem targets; remote Worker workflow only uses word://.
    return filePath;
  }
}
