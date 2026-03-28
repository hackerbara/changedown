/**
 * Compaction candidate analysis and execution for L3 documents.
 *
 * Analyzes an L3 document (footnotes-only, no inline CriticMarkup) and
 * surfaces the set of changes that are candidates for compaction:
 * decided changes, proposed changes, supersede chains, and changes with
 * active discussion threads.
 *
 * The `compact()` function performs the actual compaction: removes targeted
 * footnotes, applies body mutations for rejected proposed changes, inserts
 * a compaction-boundary footnote, and returns a verified result.
 *
 * `compaction-boundary` footnotes are filtered out — they mark the boundary
 * of a previous compaction pass and are not themselves compaction candidates.
 */

import { splitBodyAndFootnotes, FOOTNOTE_ID_PATTERN } from '../footnote-patterns.js';
import { scanMaxCnId } from './footnote-generator.js';
import { FootnoteNativeParser } from '../parser/footnote-native-parser.js';
import { initHashline } from '../hashline.js';
import { computeReject } from './accept-reject.js';
import { ChangeStatus, changeTypeToAbbrev, type TextEdit } from '../model/types.js';
import { convertL2ToL3 } from './l2-to-l3.js';
import { convertL3ToL2 } from './l3-to-l2.js';
import { resolve, type ResolvedChange } from './scrub.js';

/**
 * A lightweight reference to a footnote entry, used as a compaction candidate.
 */
export interface FootnoteRef {
  id: string;
  status: string;
  author?: string;
  date?: string;
  type?: string;
}

/**
 * A supersede chain: one active operation that superseded one or more
 * consumed predecessors.
 */
export interface SupersedeChain {
  /** The final active operation ID (the one that supersedes others). */
  active: string;
  /** Consumed predecessor IDs, in log order (oldest first). */
  consumed: string[];
}

/**
 * The surface of compaction candidates for an L3 document.
 */
export interface CompactionSurface {
  /** Changes with a decided status (accepted or rejected). */
  decided: FootnoteRef[];
  /** Changes still in proposed state. */
  proposed: FootnoteRef[];
  /**
   * Changes that cannot be safely compacted yet (e.g. anchoring unresolved).
   * Reserved for future use — always empty in the current implementation.
   */
  unresolved: FootnoteRef[];
  /** Detected supersede chains (one active op + its consumed predecessors). */
  supersedeChains: SupersedeChain[];
  /** Changes that have active discussion thread replies (not just review lines). */
  withActiveThreads: FootnoteRef[];
  /** Total number of footnotes parsed (excluding compaction-boundary entries). */
  totalFootnotes: number;
}

/** Module-level singleton — avoids per-call parser allocation. */
const l3Parser = new FootnoteNativeParser();

/** Matches `supersedes: cn-N` inside a footnote body. Captures the ID in group 1. */
const RE_SUPERSEDES = new RegExp(`^\\s+supersedes:\\s+(${FOOTNOTE_ID_PATTERN})\\s*$`);

/**
 * Analyzes an L3 document and returns compaction candidates.
 *
 * @param l3Text - The full text of an L3 document (footnotes only).
 * @returns A CompactionSurface describing which footnotes can be compacted.
 */
export async function analyzeCompactionCandidates(l3Text: string): Promise<CompactionSurface> {
  // Callers must ensure initHashline() has been called before invoking this function.
  // Parse via FootnoteNativeParser directly — compact.ts always operates on L3
  // text, so we bypass the isL3Format() detection in parseForFormat() which
  // requires at least one LINE:HASH edit-op line to recognize L3 format.
  // Compaction-boundary footnotes are automatically excluded because
  // resolveType() returns null for type "compaction-boundary".
  const vdoc = l3Parser.parse(l3Text);
  const changes = vdoc.getChanges();

  const decided: FootnoteRef[] = [];
  const proposed: FootnoteRef[] = [];
  const unresolved: FootnoteRef[] = []; // reserved for future anchor-integrity work
  const supersedeChains: SupersedeChain[] = [];
  const withActiveThreads: FootnoteRef[] = [];

  const lines = l3Text.split('\n');

  // Map from active ID → list of consumed IDs (in order found).
  const chainOf = new Map<string, string[]>();

  for (const change of changes) {
    const ref: FootnoteRef = {
      id: change.id,
      status: change.status.toLowerCase(),
      author: change.metadata?.author,
      date: change.metadata?.date,
      type: changeTypeToAbbrev(change.type),
    };

    if (change.status === ChangeStatus.Accepted || change.status === ChangeStatus.Rejected) {
      decided.push(ref);
    } else if (change.status === ChangeStatus.Proposed) {
      proposed.push(ref);
    }

    // Scan footnote body lines for supersedes: entries and thread detection.
    // Use footnoteLineRange to locate the body (startLine is the header line).
    const range = change.footnoteLineRange;
    if (range) {
      for (let lineIdx = range.startLine + 1; lineIdx <= range.endLine; lineIdx++) {
        const line = lines[lineIdx];
        const supersedesMatch = line.match(RE_SUPERSEDES);
        if (supersedesMatch) {
          const existing = chainOf.get(change.id) ?? [];
          existing.push(supersedesMatch[1]);
          chainOf.set(change.id, existing);
        }
      }
    }

    // replyCount counts only @author date: lines (review lines excluded by parser).
    if ((change.replyCount ?? 0) > 0) {
      withActiveThreads.push(ref);
    }
  }

  for (const [activeId, consumedIds] of chainOf) {
    supersedeChains.push({ active: activeId, consumed: consumedIds });
  }

  return {
    decided,
    proposed,
    unresolved,
    supersedeChains,
    withActiveThreads,
    totalFootnotes: changes.length,
  };
}

// ─── Compaction types ─────────────────────────────────────────────────────────

/**
 * Request to compact an L3 document by removing targeted footnotes.
 */
export interface CompactionRequest {
  /**
   * Footnote IDs to compact (e.g. `['cn-1', 'cn-3']`), or `'all-decided'`
   * to compact all accepted/rejected footnotes.
   */
  targets: string[] | 'all-decided';
  /**
   * Policy for proposed (undecided) changes that are targeted:
   * - `'accept'`: body is already correct (L3 body reflects the proposed state)
   * - `'reject'`: revert the proposed change from the body
   */
  undecidedPolicy: 'accept' | 'reject';
  /**
   * Optional metadata to include in the compaction-boundary footnote.
   * Keys become `key: value` lines in the boundary footnote body.
   */
  boundaryMeta?: Record<string, string>;
}

/**
 * Result of self-sufficiency verification after compaction.
 *
 * Three complementary checks:
 * - Dangling body refs: body [^cn-N] references pointing to removed footnotes
 * - Anchor resolution: surviving footnotes' LINE:HASH anchors resolving against the body
 * - Supersedes integrity: surviving footnotes' supersedes: refs pointing to footnotes missing from both surviving and removed
 */
export interface VerificationResult {
  /** True if all three checks pass. */
  valid: boolean;
  /** Body [^cn-N] refs pointing to footnotes removed during compaction. */
  danglingRefs: string[];
  /** Percentage of surviving footnotes whose anchors resolved (0..100 integer). */
  anchorCoherence: number;
  /** IDs of surviving footnotes whose anchors did not resolve. */
  unresolvedAnchors: string[];
  /** supersedes: refs in surviving footnotes pointing to footnotes missing from both surviving and removed. */
  danglingSupersedes: string[];
  /** Per-change resolution details for all surviving footnotes. */
  resolvedChanges: ResolvedChange[];
  /** Human-readable diagnostics for unresolved changes. */
  unresolvedDiagnostics: string[];
}

/**
 * Result of a compaction operation.
 */
export interface CompactedDocument {
  /** The compacted document text. */
  text: string;
  /** IDs of footnotes that were removed. */
  compactedIds: string[];
  /** Snapshot verification result. */
  verification: VerificationResult;
}

// ─── Compaction ───────────────────────────────────────────────────────────────

/**
 * Compact an L3 document by removing targeted footnotes, applying body
 * mutations for rejected proposed changes, and inserting a compaction-boundary.
 *
 * Algorithm:
 * 1. Parse footnotes and resolve target IDs
 * 2. Build supersede map — enforce chain integrity (if a chain active end is
 *    targeted, include consumed predecessors)
 * 3. Apply body mutations for targeted proposed changes being rejected
 * 4. Remove targeted footnote blocks from the footnote section
 * 5. Insert a compaction-boundary footnote with the next available cn-ID
 * 6. Reassemble and verify (check for dangling [^cn-N] refs)
 *
 * @param l3Text - Full text of an L3 document.
 * @param request - Compaction request specifying targets and policies.
 * @returns CompactedDocument with the result text, compacted IDs, and verification.
 */
export async function compact(l3Text: string, request: CompactionRequest): Promise<CompactedDocument> {
  // Ensure WASM hashline is ready (needed by FootnoteNativeParser → computeLineHash)
  await initHashline();

  // ── Step 1: Parse footnotes and resolve targets ──────────────────────────
  const surface = await analyzeCompactionCandidates(l3Text);
  const proposedIds = new Set(surface.proposed.map(r => r.id));

  let targetIds: string[];
  if (request.targets === 'all-decided') {
    targetIds = surface.decided.map(r => r.id);
  } else {
    targetIds = [...request.targets];
  }

  // ── Step 2: Supersede chain integrity ────────────────────────────────────
  // If targeting the active end of a supersede chain, include consumed predecessors.
  const targetSet = new Set(targetIds);
  for (const chain of surface.supersedeChains) {
    if (targetSet.has(chain.active)) {
      for (const consumed of chain.consumed) {
        if (!targetSet.has(consumed)) {
          targetSet.add(consumed);
          targetIds.push(consumed);
        }
      }
    }
  }

  // Short-circuit: nothing to compact
  if (targetIds.length === 0) {
    return {
      text: l3Text,
      compactedIds: [],
      verification: {
        valid: true,
        danglingRefs: [],
        anchorCoherence: 100,
        unresolvedAnchors: [],
        danglingSupersedes: [],
        resolvedChanges: [],
        unresolvedDiagnostics: [],
      },
    };
  }

  // ── Step 3: Body mutation for rejected proposed changes ──────────────────
  let workingText = l3Text;

  // Identify targeted footnotes that are proposed (undecided) and need body mutation
  const proposedTargetIds = targetIds.filter(id => proposedIds.has(id));

  if (request.undecidedPolicy === 'reject' && proposedTargetIds.length > 0) {
    // Parse once to get ChangeNodes for both reject edits and block removal
    const preRejectDoc = l3Parser.parse(workingText);
    const preRejectChanges = preRejectDoc.getChanges();
    const preRejectMap = new Map(preRejectChanges.map(c => [c.id, c]));

    // Collect reject edits for proposed targets, sorted by descending offset
    const rejectEdits: TextEdit[] = [];
    for (const id of proposedTargetIds) {
      const change = preRejectMap.get(id);
      if (!change || !change.anchored) continue;

      const edit = computeReject(change);
      if (edit.length > 0 || edit.newText.length > 0) {
        rejectEdits.push(edit);
      }
    }

    // Sort by descending offset to prevent cascade issues
    rejectEdits.sort((a, b) => b.offset - a.offset);

    for (const edit of rejectEdits) {
      workingText =
        workingText.slice(0, edit.offset) +
        edit.newText +
        workingText.slice(edit.offset + edit.length);
    }
  }

  // ── Step 4: Remove targeted footnote blocks ──────────────────────────────
  // Re-parse after body mutations to get accurate footnoteLineRange values.
  const workingDoc = l3Parser.parse(workingText);
  const workingChanges = workingDoc.getChanges();
  const changeMap = new Map(workingChanges.map(c => [c.id, c]));
  const lines = workingText.split('\n');

  const blocks = targetIds
    .map(id => ({ id, range: changeMap.get(id)?.footnoteLineRange }))
    .filter((entry): entry is { id: string; range: { startLine: number; endLine: number } } =>
      entry.range !== undefined,
    )
    .sort((a, b) => b.range.startLine - a.range.startLine); // bottom-to-top

  for (const { range } of blocks) {
    lines.splice(range.startLine, range.endLine - range.startLine + 1);
  }

  // ── Step 5: Insert compaction-boundary footnote ──────────────────────────
  // Scan the ORIGINAL text for max cn-ID to ensure boundary gets a fresh ID.
  const maxId = scanMaxCnId(l3Text);
  const boundaryId = `cn-${maxId + 1}`;

  const boundaryLines: string[] = [`[^${boundaryId}]: compaction-boundary`];
  if (request.boundaryMeta) {
    for (const [key, value] of Object.entries(request.boundaryMeta)) {
      boundaryLines.push(`    ${key}: ${value}`);
    }
  }

  // Re-split after block removal to find the right insertion point
  const { bodyLines: cleanBodyLines, footnoteLines: cleanFootnoteLines } = splitBodyAndFootnotes(lines);

  // ── Step 6: Reassemble ───────────────────────────────────────────────────
  const resultParts: string[] = [];
  resultParts.push(cleanBodyLines.join('\n'));

  const hasFootnotes = cleanFootnoteLines.length > 0 || boundaryLines.length > 0;
  if (hasFootnotes && cleanBodyLines.length > 0) {
    resultParts.push('');
  }
  if (cleanFootnoteLines.length > 0) {
    resultParts.push(cleanFootnoteLines.join('\n'));
  }
  resultParts.push(boundaryLines.join('\n'));

  const resultText = resultParts.join('\n');

  // ── Step 7: Self-sufficiency verification ──────────────────────────────

  // 7a: Dangling body ref check (existing — body → footnote direction)
  const danglingRefCheck = verifyCompaction(resultText, targetIds);

  // 7b: Full resolution protocol (footnote → body direction + freshAnchor write-back)
  const resolution = resolve(resultText);

  // 7c: Supersedes intra-slice integrity
  const danglingSupersedes = checkSupersedesIntegrity(resultText, targetIds);

  // Build extended VerificationResult
  const unresolvedAnchors = resolution.changes
    .filter(c => !c.resolved)
    .map(c => c.id);
  const verification: VerificationResult = {
    valid: danglingRefCheck.danglingRefs.length === 0
        && unresolvedAnchors.length === 0
        && danglingSupersedes.length === 0,
    danglingRefs: danglingRefCheck.danglingRefs,
    anchorCoherence: resolution.coherenceRate,
    unresolvedAnchors,
    danglingSupersedes,
    resolvedChanges: resolution.changes,
    unresolvedDiagnostics: resolution.unresolvedDiagnostics,
  };

  return {
    text: resolution.resolvedText,
    compactedIds: targetIds,
    verification,
  };
}

/**
 * Compact an L2 document by promoting to L3, compacting, and demoting back to L2.
 *
 * Pipeline: L2 → convertL2ToL3 → compact → convertL3ToL2 → L2
 *
 * This allows L2 documents (inline CriticMarkup + footnotes) to use the same
 * compaction logic as L3, without requiring callers to manage the round-trip.
 */
export async function compactL2(
  l2Text: string,
  request: CompactionRequest,
): Promise<CompactedDocument> {
  const l3 = await convertL2ToL3(l2Text);
  const result = await compact(l3, request);
  const l2Result = await convertL3ToL2(result.text);
  return { ...result, text: l2Result };
}

/**
 * Check for dangling [^cn-N] refs in the body pointing to removed footnotes.
 * Internal helper — returns only the dangling ref portion of verification.
 */
function verifyCompaction(resultText: string, removedIds: string[]): { danglingRefs: string[] } {
  const removedSet = new Set(removedIds);
  const lines = resultText.split('\n');
  const { bodyLines } = splitBodyAndFootnotes(lines);
  const bodyText = bodyLines.join('\n');

  const refPattern = new RegExp(`\\[\\^(${FOOTNOTE_ID_PATTERN})\\]`, 'g');
  const danglingRefs: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = refPattern.exec(bodyText)) !== null) {
    if (removedSet.has(match[1])) {
      danglingRefs.push(match[1]);
    }
  }

  return { danglingRefs };
}

/**
 * Check for dangling `supersedes:` references in surviving footnotes.
 *
 * A supersedes: cn-X reference is dangling if cn-X is absent from BOTH
 * the surviving footnotes AND the removedIds. This means cn-X should
 * exist in the slice but doesn't — document corruption or compaction bug.
 *
 * References to removed footnotes (in removedIds) are cross-boundary
 * per parent spec §7 — they just became cross-boundary via this compaction.
 */
export function checkSupersedesIntegrity(resultText: string, removedIds: string[]): string[] {
  const removedSet = new Set(removedIds);
  const lines = resultText.split('\n');
  const { footnoteLines } = splitBodyAndFootnotes(lines);

  // Collect surviving footnote IDs
  const survivingIds = new Set<string>();
  for (const line of footnoteLines) {
    const idMatch = line.match(new RegExp(`^\\[\\^(${FOOTNOTE_ID_PATTERN})\\]:`));
    if (idMatch) survivingIds.add(idMatch[1]);
  }

  // Scan for supersedes: references
  const dangling: string[] = [];
  for (const line of footnoteLines) {
    const match = RE_SUPERSEDES.exec(line);
    if (!match) continue;

    const refId = match[1];
    // Dangling only if absent from BOTH surviving and removed
    if (!survivingIds.has(refId) && !removedSet.has(refId)) {
      dangling.push(refId);
    }
  }

  return dangling;
}
