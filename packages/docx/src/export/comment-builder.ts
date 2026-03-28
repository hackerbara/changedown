/**
 * Comment builder for Word docx export.
 *
 * Builds Word comment definitions (ICommentOptions[]) and threading patch info
 * (CommentPatchInfo[]) from CriticMarkup comment/highlight footnotes.
 */

import {
  Paragraph,
  TextRun,
  type ICommentOptions,
} from 'docx';
import { randomParaId } from './word-online-patch.js';
import type { CommentPatchInfo } from '../shared/patch-types.js';
import { toIsoString } from '../shared/date-utils.js';

export type { CommentPatchInfo } from '../shared/patch-types.js';

/**
 * Extracts initials from a display name.
 * AI authors get "AI", others get up to 2 uppercase initials.
 */
function makeInitials(displayName: string): string {
  if (!displayName) return 'U';
  if (displayName.startsWith('ai:')) return 'AI';
  const parts = displayName.split(/[\s-]+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || 'U';
}

export interface CommentReply {
  author: string;
  date: string;
  text: string;
  depth: number;
}

/**
 * Build a chain of Word comment definitions for a root comment and optional threaded replies.
 *
 * Mutates `defs` and `patches` arrays by pushing new entries.
 *
 * @param startId - The Word comment ID for the root comment
 * @param rootText - The text content of the root comment
 * @param rootAuthor - Display name of the root comment author
 * @param rootDate - Date string for the root comment (YYYY-MM-DD or ISO)
 * @param defs - Comment definitions array (mutated — new entries pushed)
 * @param patches - Patch info array (mutated — new entries pushed)
 * @param replies - Optional array of threaded reply comments
 * @returns Object containing the next available ID after this chain
 */
export function buildCommentChain(
  startId: number,
  rootText: string,
  rootAuthor: string,
  rootDate: string,
  defs: ICommentOptions[],
  patches: CommentPatchInfo[],
  replies?: CommentReply[]
): { id: number } {
  const rootParaId = randomParaId();

  const rootPatchInfo: CommentPatchInfo = {
    id: startId,
    paraId: rootParaId,
  };

  defs.push({
    id: startId,
    author: rootAuthor,
    date: new Date(toIsoString(rootDate)),
    initials: makeInitials(rootAuthor),
    children: [
      new Paragraph({
        children: [new TextRun(rootText || '')],
      }),
    ],
  });
  patches.push(rootPatchInfo);

  let nextId = startId + 1;

  if (replies && replies.length > 0) {
    for (const reply of replies) {
      const replyParaId = randomParaId();

      const replyPatchInfo: CommentPatchInfo = {
        id: nextId,
        paraId: replyParaId,
        parentParaId: rootParaId,
      };

      defs.push({
        id: nextId,
        author: reply.author,
        date: new Date(toIsoString(reply.date)),
        initials: makeInitials(reply.author),
        children: [
          new Paragraph({
            children: [new TextRun(reply.text || '')],
          }),
        ],
      });
      patches.push(replyPatchInfo);
      nextId++;
    }
  }

  return { id: nextId };
}
