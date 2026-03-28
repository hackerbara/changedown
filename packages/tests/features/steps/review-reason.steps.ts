/**
 * Step definitions for the "Review with reason" feature (ops/review-with-reason.feature).
 *
 * These steps call computeApprovalLineEdit and computeFootnoteStatusEdits from
 * @changedown/core to apply review operations directly on in-memory text.
 *
 * Existing steps reused (from core-operations.steps.ts):
 *   - Given the text is: (docstring)
 *   - Then the resulting text contains {string}
 *   - Then the resulting text does not contain {string}
 */
import { When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { ChangeDownWorld } from './world.js';
import {
  computeApprovalLineEdit,
  computeFootnoteStatusEdits,
  type TextEdit,
} from '@changedown/core';

/**
 * Apply a TextEdit to a source string, producing the resulting text.
 */
function applyEdit(text: string, edit: TextEdit): string {
  return text.substring(0, edit.offset) + edit.newText + text.substring(edit.offset + edit.length);
}

/**
 * Apply multiple TextEdits in reverse offset order to preserve positions.
 */
function applyEdits(text: string, edits: TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.offset - a.offset);
  let result = text;
  for (const edit of sorted) {
    result = applyEdit(result, edit);
  }
  return result;
}

// =============================================================================
// Review with reason — When steps
// =============================================================================

When(
  'I review {word} with decision {string} and reason {string} by {string} on {string}',
  function (
    this: ChangeDownWorld,
    changeId: string,
    decision: string,
    reason: string,
    author: string,
    date: string,
  ) {
    const text = this.lastText;
    const typedDecision = decision as 'accepted' | 'rejected' | 'request-changes';

    // 1. Compute approval/rejection/request-changes line edit
    const approvalEdit = computeApprovalLineEdit(text, changeId, typedDecision, {
      author,
      date,
      reason,
    });
    assert.ok(approvalEdit !== null, `computeApprovalLineEdit returned null for ${changeId}`);

    // 2. Compute footnote status edits (updates "proposed" -> "accepted"/"rejected")
    const statusEdits = computeFootnoteStatusEdits(text, [changeId], typedDecision);

    // 3. Apply all edits in reverse offset order
    const allEdits: TextEdit[] = [approvalEdit!, ...statusEdits];
    this.resultText = applyEdits(text, allEdits);
  },
);

When(
  'I review {word} with decision {string} without reason by {string} on {string}',
  function (
    this: ChangeDownWorld,
    changeId: string,
    decision: string,
    author: string,
    date: string,
  ) {
    const text = this.lastText;
    const typedDecision = decision as 'accepted' | 'rejected' | 'request-changes';

    // 1. Compute approval line edit (no reason)
    const approvalEdit = computeApprovalLineEdit(text, changeId, typedDecision, {
      author,
      date,
    });
    assert.ok(approvalEdit !== null, `computeApprovalLineEdit returned null for ${changeId}`);

    // 2. Compute footnote status edits
    const statusEdits = computeFootnoteStatusEdits(text, [changeId], typedDecision);

    // 3. Apply all edits in reverse offset order
    const allEdits: TextEdit[] = [approvalEdit!, ...statusEdits];
    this.resultText = applyEdits(text, allEdits);
  },
);
