import type { Timestamp } from '../timestamp.js';

export enum ChangeType {
  Insertion = 'Insertion',
  Deletion = 'Deletion',
  Substitution = 'Substitution',
  Highlight = 'Highlight',
  Comment = 'Comment',
}

/**
 * Maps a ChangeType enum value to the abbreviated string used in footnotes.
 * Single source of truth — callers should not maintain their own switch.
 */
export function changeTypeToAbbrev(type: ChangeType): string {
  switch (type) {
    case ChangeType.Insertion: return 'ins';
    case ChangeType.Deletion: return 'del';
    case ChangeType.Substitution: return 'sub';
    case ChangeType.Highlight: return 'hig';
    case ChangeType.Comment: return 'com';
  }
}

export enum ChangeStatus {
  Proposed = 'Proposed',
  Accepted = 'Accepted',
  Rejected = 'Rejected',
}

export interface OffsetRange {
  start: number;
  end: number;
}

export interface Approval {
  author: string;
  /** @deprecated Use timestamp.date */
  date: string;
  timestamp: Timestamp;
  reason?: string;
}

export interface Revision {
  label: string;
  author: string;
  /** @deprecated Use timestamp.date */
  date: string;
  timestamp: Timestamp;
  text: string;
}

export interface DiscussionComment {
  author: string;
  /** @deprecated Use timestamp.date */
  date: string;
  timestamp: Timestamp;
  label?: string;
  text: string;
  depth: number;
}

export type Resolution =
  | { type: 'resolved'; author: string; /** @deprecated Use timestamp.date */ date: string; timestamp: Timestamp; reason?: string }
  | { type: 'open'; reason?: string };

export interface InlineMetadata {
  raw: string;
  author?: string;
  date?: string;
  type?: string;
  status?: string;
  freeText?: string;
}

export interface ChangeNode {
  id: string;
  type: ChangeType;
  status: ChangeStatus;
  range: OffsetRange;
  contentRange: OffsetRange;
  originalRange?: OffsetRange;
  modifiedRange?: OffsetRange;
  originalText?: string;
  modifiedText?: string;
  inlineMetadata?: InlineMetadata;
  level: 0 | 1 | 2;
  metadata?: {
    comment?: string;
    author?: string;
    date?: string;
    type?: string;
    status?: string;
    context?: string;
    approvals?: Approval[];
    rejections?: Approval[];
    requestChanges?: Approval[];
    revisions?: Revision[];
    discussion?: DiscussionComment[];
    resolution?: Resolution;
    imageDimensions?: { widthIn: number; heightIn: number };
    imageMetadata?: Record<string, string>;
  };
  moveRole?: 'from' | 'to';
  groupId?: string;
  settled?: boolean;
  anchored: boolean;  // true = [^cn-N] exists in file; false = parse-assigned
  footnoteRefStart?: number;  // byte offset where [^cn-N] starts (set by parser for L2 anchored changes)
  /** Line range of the footnote definition block in the raw text (0-based, inclusive). */
  footnoteLineRange?: { startLine: number; endLine: number };
  /** Number of discussion thread reply lines in the footnote body. */
  replyCount?: number;
  /** How this change's anchor was resolved by the parser. */
  resolutionPath?: 'hash' | 'context' | 'replay' | 'rejected';
  /** If another operation consumed this one (supersede chain detection from scrub). */
  consumedBy?: string;
  /** Whether the consumption was full (entire op superseded) or partial (subset consumed). */
  consumptionType?: 'full' | 'partial';
  /** Updated LINE:HASH edit-op line computed by the scrub replay. */
  freshAnchor?: string;
}

/**
 * Diagnostic emitted when a footnote's edit-op could not be resolved against the body.
 * Carried on VirtualDocument.unresolvedDiagnostics for display in hover / status bar.
 */
export interface UnresolvedDiagnostic {
  /** The footnote ID (e.g., "cn-5") */
  changeId: string;
  /** What text was expected in the body */
  expectedText: string;
  /** What was found on the target line */
  actualLineContent: string;
  /** Which resolution tiers were attempted and failed */
  attemptedPaths: ('hash' | 'relocation' | 'context' | 'replay')[];
}

/**
 * Ghost nodes are L2+ footnotes whose edit-op couldn't be resolved against the body.
 * They get anchored:false with zero-width ranges at {0,0}. LSP consumers must
 * filter them to avoid phantom UI artifacts.
 *
 * Consumed nodes (consumedBy set) are NOT ghosts — they were deliberately superseded
 * by another operation and should be rendered with consumed-op styling instead.
 */
export function isGhostNode(change: ChangeNode): boolean {
  return change.anchored === false && change.level >= 2 && !change.consumedBy;
}

/**
 * Extract the effective status string from a ChangeNode, normalized to lowercase.
 * Uses the 3-tier fallback: metadata.status → inlineMetadata.status → node.status enum.
 */
/** User-facing label for a consumption type: "Consumed" or "Partially consumed". */
export function consumptionLabel(type?: 'full' | 'partial'): string {
  return type === 'partial' ? 'Partially consumed' : 'Consumed';
}

export function nodeStatus(node: ChangeNode): string {
  return (node.metadata?.status ?? node.inlineMetadata?.status ?? node.status).toString().toLowerCase();
}

export interface TextEdit {
  offset: number;
  length: number;
  newText: string;
}

/**
 * In-flight representation of a pending insertion before it's committed as markup.
 * Used for LSP overlay merge and extension fallback when LSP is disconnected.
 */
export interface PendingOverlay {
  range: { start: number; end: number };
  text: string;
  type: 'insertion';
  scId?: string;
}
