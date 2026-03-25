import {
  initHashline, computeLineHash, computeSettledLineHash, settledLine,
  computeSettledView, computeCommittedView,
  type SettledViewResult, type CommittedViewResult,
} from '@changetracks/core';
import type { SessionState } from './state.js';
import type { ChangeTracksConfig } from './config.js';

/**
 * Recompute and record session hashes after a file write.
 * Clears the ID counter cache, updates hashes, preserves lastReadView.
 *
 * When the agent's lastReadView is 'settled' or 'changes', computes the
 * corresponding projected view and stores view-specific hashes (settledView
 * or committed) alongside the raw/settled base hashes. Returns the computed
 * view result so callers can reuse it without double-computing.
 *
 * For the review view, also computes committed hashes so the view-aware
 * resolution pipeline can match stale committed hashes from the agent's
 * original read across batch boundaries.
 *
 * Call this after EVERY fs.writeFile() in any tool handler.
 */
export async function rerecordState(
  state: SessionState | undefined,
  filePath: string,
  content: string,
  config: ChangeTracksConfig
): Promise<{ settledView?: SettledViewResult; committedView?: CommittedViewResult } | undefined> {
  if (!state) return undefined;

  if (!config.hashline.enabled) {
    state.resetFile(filePath);
    return undefined;
  }

  await initHashline();
  const lines = content.split('\n');
  const allSettled = lines.map(l => settledLine(l));
  const lastView = state.getLastReadView(filePath);

  let hashes: Array<{
    line: number; raw: string; settled: string;
    committed?: string; settledView?: string; rawLineNum?: number;
  }>;

  let sv: SettledViewResult | undefined;
  let cv: CommittedViewResult | undefined;

  if (lastView === 'settled') {
    sv = computeSettledView(content);
    hashes = sv.lines.map(sl => ({
      line: sl.settledLineNum,
      raw: computeLineHash(sl.rawLineNum - 1, lines[sl.rawLineNum - 1], lines),
      settled: computeSettledLineHash(sl.rawLineNum - 1, lines[sl.rawLineNum - 1], allSettled),
      settledView: sl.hash,
      rawLineNum: sl.rawLineNum,
    }));
  } else if (lastView === 'changes') {
    cv = computeCommittedView(content);
    hashes = cv.lines.map(cl => ({
      line: cl.committedLineNum,
      raw: computeLineHash(cl.rawLineNum - 1, lines[cl.rawLineNum - 1], lines),
      settled: computeSettledLineHash(cl.rawLineNum - 1, lines[cl.rawLineNum - 1], allSettled),
      committed: cl.hash,
      rawLineNum: cl.rawLineNum,
    }));
  } else if (lastView === 'review') {
    // Review view: raw line numbers + committed hashes for cross-batch stability.
    cv = computeCommittedView(content);
    const rawToCommittedHash = new Map<number, string>();
    for (const cl of cv.lines) {
      rawToCommittedHash.set(cl.rawLineNum, cl.hash);
    }
    hashes = lines.map((line, i) => ({
      line: i + 1,
      raw: computeLineHash(i, line, lines),
      settled: computeSettledLineHash(i, line, allSettled),
      committed: rawToCommittedHash.get(i + 1),
    }));
  } else {
    // raw: line numbers are raw (identity mapping)
    hashes = lines.map((line, i) => ({
      line: i + 1,
      raw: computeLineHash(i, line, lines),
      settled: computeSettledLineHash(i, line, allSettled),
    }));
  }

  state.rerecordAfterWrite(filePath, content, hashes);

  if (sv) return { settledView: sv };
  if (cv) return { committedView: cv };
  return undefined;
}
