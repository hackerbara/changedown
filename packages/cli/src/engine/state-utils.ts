import { initHashline, computeLineHash, computeSettledLineHash, settledLine } from '@changetracks/core';
import type { SessionState } from './state.js';
import type { ChangeTracksConfig } from './config.js';

/**
 * Recompute and record session hashes after a file write.
 * Clears the ID counter cache, updates hashes, preserves lastReadView.
 *
 * Call this after EVERY fs.writeFile() in any tool handler.
 */
export async function rerecordState(
  state: SessionState | undefined,
  filePath: string,
  content: string,
  config: ChangeTracksConfig
): Promise<void> {
  if (!state) return;

  if (!config.hashline.enabled) {
    state.resetFile(filePath);
    return;
  }

  await initHashline();
  const lines = content.split('\n');
  const allSettled = lines.map(l => settledLine(l));
  const hashes = lines.map((line, i) => ({
    line: i + 1,
    raw: computeLineHash(i, line, lines),
    settled: computeSettledLineHash(i, line, allSettled),
  }));
  state.rerecordAfterWrite(filePath, content, hashes);
}
