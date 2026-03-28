import type { ChangeNode, ChangeType } from './model/types.js';

/** Payload for changedown/coherenceStatus notification */
export interface CoherenceStatusParams {
  uri: string;
  coherenceRate: number;
  unresolvedCount: number;
  threshold: number;
}

/** Payload for changedown/decorationData notification */
export interface DecorationDataParams {
  uri: string;
  changes: ChangeNode[];
  documentVersion: number;
  /** Lines the extension should programmatically fold. Only sent on promotion, first open, or view mode transition. */
  autoFoldLines?: number[];
}

/** Payload for changedown/changeCount notification */
export interface ChangeCountParams {
  uri: string;
  counts: {
    insertions: number;
    deletions: number;
    substitutions: number;
    highlights: number;
    comments: number;
    total: number;
  };
}

/** Payload for changedown/allChangesResolved notification */
export interface AllChangesResolvedParams {
  uri: string;
}

/**
 * Shape of diagnostic.data attached by diagnostics.ts, consumed by code-actions.ts.
 * Single source of truth for the diagnostic data contract.
 */
export interface DiagnosticData {
  changeId: string;
  changeType: ChangeType;
  unresolved?: boolean;
  consumed?: boolean;
  consumedBy?: string;
}
