import { scanMaxCnId } from '@changedown/core';

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
 * --- Fork divergence from @changedown/mcp SessionState ---
 *
 * This is an intentional fork of `changedown-plugin/mcp-server/src/state.ts`.
 * The MCP server's SessionState has additional capabilities that this version
 * does NOT need:
 *
 *   - `ViewName` / `FileRecord` types and view-tracking methods
 *     (`recordAfterRead`, `rerecordAfterWrite`, `getLastReadView`, `isStale`,
 *     `resolveHash`) — these support the MCP read/write session binding
 *     protocol that the opencode plugin does not participate in.
 *
 *   - Extended hash entry fields (`committed`, `settledView`, `rawLineNum`)
 *     for multi-view hash resolution — opencode only needs `raw` + `settled`.
 *
 *   - Different `beginGroup` semantics: the MCP server version uses
 *     `(knownMaxId || 0) + 1` (each group independent), while this version
 *     incorporates `globalMaxId` and iterates all per-file counters to prevent
 *     cross-file ID collisions in the opencode stop-hook batch scenario.
 *
 * Consolidation was evaluated and rejected because the behavioral differences
 * in ID allocation are load-bearing for each consumer's use case. The MCP
 * server manages IDs within a persistent stdio session; the opencode plugin
 * manages IDs across a batch of pending edits applied in a one-shot stop hook.
 *
 * If you modify shared logic (getNextId, group lifecycle), check both files:
 *   - packages/opencode-plugin/src/state.ts        (this file)
 *   - changedown-plugin/mcp-server/src/state.ts   (MCP server)
 */
export class SessionState {
  private counters: Map<string, number> = new Map();
  private globalMaxId: number = 0;
  private activeGroup: ActiveGroup | null = null;
  private fileHashes: Map<string, Array<{ line: number; raw: string; settled: string }>> = new Map();

  /**
   * Starts a new change group. Allocates the next available global ID
   * as the group parent ID. While active, all `getNextId` calls return
   * dotted child IDs under this parent.
   *
   * @param knownMaxId - Optional pre-scanned max ID from tracked files.
   *   On a fresh session, in-memory counters are 0. Callers should scan
   *   project files via `scanMaxCnId` and pass the result here to prevent
   *   ID collisions with existing footnotes.
   * @throws {Error} if a group is already active
   */
  beginGroup(description: string, reasoning?: string, knownMaxId?: number): string {
    if (this.activeGroup) {
      throw new Error('A change group is already active. End the current group before starting a new one.');
    }

    // Incorporate externally-scanned max ID (prevents collision on fresh sessions)
    if (knownMaxId !== undefined && knownMaxId > this.globalMaxId) {
      this.globalMaxId = knownMaxId;
    }

    // Find the max across all known per-file counters and the global max
    let maxSeen = this.globalMaxId;
    for (const counter of this.counters.values()) {
      if (counter > maxSeen) maxSeen = counter;
    }
    maxSeen++;
    this.globalMaxId = maxSeen;

    const groupId = `cn-${maxSeen}`;
    this.activeGroup = {
      id: groupId,
      numericId: maxSeen,
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
      // First call for this file: scan existing IDs
      counter = scanMaxCnId(currentText);
    }
    counter++;

    // Keep the global max in sync
    if (counter > this.globalMaxId) {
      this.globalMaxId = counter;
    }

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
    this.counters.delete(filePath);
  }

  /**
   * Records per-line hashes for a file, used for staleness detection.
   * Called by `read_tracked_file` after computing hashline output.
   * Overwrites any previously recorded hashes for the same file path.
   */
  recordFileHashes(filePath: string, hashes: Array<{ line: number; raw: string; settled: string }>): void {
    this.fileHashes.set(filePath, hashes);
  }

  /**
   * Returns the recorded per-line hashes for a file, or undefined if
   * the file has not been read via `read_tracked_file` in this session.
   */
  getRecordedHashes(filePath: string): Array<{ line: number; raw: string; settled: string }> | undefined {
    return this.fileHashes.get(filePath);
  }
}
