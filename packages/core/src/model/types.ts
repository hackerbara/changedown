import type { Timestamp } from '../timestamp.js';

export enum ChangeType {
  Insertion = 'Insertion',
  Deletion = 'Deletion',
  Substitution = 'Substitution',
  Highlight = 'Highlight',
  Comment = 'Comment',
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
  };
  moveRole?: 'from' | 'to';
  groupId?: string;
  settled?: boolean;
  anchored: boolean;  // true = [^ct-N] exists in file; false = parse-assigned
  footnoteRefStart?: number;  // byte offset where [^ct-N] starts (set by parser for L2 anchored changes)
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
