import { CriticMarkupParser, ChangeStatus } from '@changedown/core';

export interface StatusResult {
  proposed: number;
  accepted: number;
  rejected: number;
  total: number;
}

/**
 * Computes a summary of change statuses from a CriticMarkup document.
 * Pure function: no I/O, no side effects.
 *
 * The parser merges footnote metadata (including status) into ChangeNode.status,
 * so we read status directly from the parsed changes. Changes without footnotes
 * default to Proposed.
 */
export function computeStatus(content: string): StatusResult {
  const parser = new CriticMarkupParser();
  const doc = parser.parse(content, { skipCodeBlocks: false });
  const changes = doc.getChanges();

  const result: StatusResult = { proposed: 0, accepted: 0, rejected: 0, total: 0 };

  for (const change of changes) {
    if (change.status === ChangeStatus.Accepted) {
      result.accepted++;
    } else if (change.status === ChangeStatus.Rejected) {
      result.rejected++;
    } else {
      result.proposed++;
    }
    result.total++;
  }

  return result;
}
