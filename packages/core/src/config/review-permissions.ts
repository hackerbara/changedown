import type { ChangeTracksConfig } from './index.js';

export type ParticipantType = 'human' | 'agent';

/**
 * Classify a reviewer's participant type from their @author string.
 * Returns 'agent' if the author starts with 'ai:' or 'ci:', 'human' otherwise.
 */
export function reviewerType(author: string): ParticipantType {
  const stripped = author.startsWith('@') ? author.slice(1) : author;
  if (stripped.startsWith('ai:') || stripped.startsWith('ci:')) return 'agent';
  return 'human';
}

export function canAccept(
  reviewer: string,
  changeAuthor: string,
  config: ChangeTracksConfig,
): { allowed: boolean; reason?: string } {
  const rt = reviewerType(reviewer);
  if (!config.review.may_review[rt]) {
    return { allowed: false, reason: `${rt} participants cannot review in this project` };
  }
  if (!config.review.self_acceptance[rt] && reviewer === changeAuthor) {
    return { allowed: false, reason: `${rt} participants cannot accept their own changes in this project` };
  }
  return { allowed: true };
}

export function canWithdraw(
  reviewer: string,
  rcAuthor: string,
  config: ChangeTracksConfig,
): boolean {
  if (reviewer === rcAuthor) return true;
  return config.review.cross_withdrawal[reviewerType(reviewer)];
}
