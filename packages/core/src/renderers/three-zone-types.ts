// packages/core/src/renderers/three-zone-types.ts

export type ViewName = 'review' | 'changes' | 'settled' | 'raw';
export type LineFlag = 'P' | 'A';

// ── View Mode Aliases ──────────────────────────────────────────────────
// Maps extension display names (and canonical names) to canonical ViewName.

export const VIEW_NAME_ALIASES: Record<string, ViewName> = {
  'all-markup': 'review',
  'simple': 'changes',
  'final': 'settled',
  'original': 'raw',
  // Canonical names map to themselves
  'review': 'review',
  'changes': 'changes',
  'settled': 'settled',
  'raw': 'raw',
};

/** Human-readable display names for each canonical view. */
export const VIEW_NAME_DISPLAY_NAMES: Record<ViewName, string> = {
  review: 'All Markup',
  changes: 'Simple Markup',
  settled: 'Final',
  raw: 'Original',
};

/** Ordered list of canonical view names for cycling. */
export const VIEW_NAMES: ViewName[] = ['review', 'changes', 'settled', 'raw'];

/** Resolve any alias (or canonical name) to a ViewName. Returns undefined for unknown strings. */
export function resolveViewName(name: string): ViewName | undefined {
  return VIEW_NAME_ALIASES[name];
}

/** Cycle to the next view mode. */
export function nextViewName(current: ViewName): ViewName {
  const idx = VIEW_NAMES.indexOf(current);
  return VIEW_NAMES[(idx + 1) % VIEW_NAMES.length];
}

export interface DeliberationHeader {
  filePath: string;
  trackingStatus: 'tracked' | 'untracked';
  protocolMode: string;                    // 'classic' | 'compact'
  defaultView: ViewName;
  viewPolicy: string;                      // 'suggest' | 'require'
  counts: { proposed: number; accepted: number; rejected: number };
  authors: string[];
  threadCount: number;
  lineRange?: { start: number; end: number; total: number };
}

export interface ContentSpan {
  type: 'plain' | 'insertion' | 'deletion' | 'sub_old' | 'sub_new'
      | 'sub_arrow' | 'highlight' | 'comment' | 'anchor' | 'delimiter';
  text: string;
  /** Raw file byte offsets — used by LSP for editor range mapping. */
  sourceRange?: { start: number; end: number };
}

export interface LineMetadata {
  changeId: string;
  author?: string;
  reason?: string;
  replyCount?: number;
  status?: 'proposed' | 'accepted' | 'rejected';
}

export interface ThreeZoneLine {
  margin: {
    lineNumber: number;      // 1-indexed
    hash: string;            // 2-char xxHash32 hex
    flags: LineFlag[];       // P, A, or empty
  };
  content: ContentSpan[];
  metadata: LineMetadata[];
  /** Raw file line number (1-indexed). Equals margin.lineNumber for review/raw views. */
  rawLineNumber: number;
  /** Additional hashes for session binding (not rendered). */
  sessionHashes?: {
    raw: string;
    settled: string;
    committed?: string;
    settledView?: string;
    rawLineNum?: number;    // Redundant with rawLineNumber, kept for compat
  };
}

export interface ThreeZoneDocument {
  view: ViewName;
  header: DeliberationHeader;
  lines: ThreeZoneLine[];
  /** Only present in raw view — literal footnote definitions. */
  footnoteSection?: string;
}
