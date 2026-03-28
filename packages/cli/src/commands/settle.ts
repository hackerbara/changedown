import { settleAcceptedChangesOnly, settleRejectedChangesOnly } from '@changedown/core';

export interface SettlementResult {
  settledContent: string;
  settledCount: number;
}

/**
 * Compacts (removes markup from) accepted and rejected changes.
 * Proposed changes are left untouched.
 *
 * Pipeline:
 * 1. settleAcceptedChangesOnly — removes inline CriticMarkup for accepted changes
 * 2. settleRejectedChangesOnly — removes inline CriticMarkup for rejected changes
 *
 * Both functions preserve footnote definitions and inline refs (Layer 1 settlement).
 *
 * Pure function: no I/O, no side effects.
 */
export function computeSettlement(content: string): SettlementResult {
  const acceptResult = settleAcceptedChangesOnly(content);
  const rejectResult = settleRejectedChangesOnly(acceptResult.settledContent);

  const settledCount = acceptResult.settledIds.length + rejectResult.settledIds.length;

  return {
    settledContent: rejectResult.settledContent,
    settledCount,
  };
}
