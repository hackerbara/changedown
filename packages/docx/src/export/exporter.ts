/**
 * Export orchestrator — converts CriticMarkup markdown to a .docx buffer.
 *
 * Steps:
 * 1. Convert markdown to docx Paragraphs via tokens-to-docx
 * 2. Create a docx Document with tracked changes enabled
 * 3. Pack to buffer via Packer.toBuffer()
 * 4. Apply patches if wordOnlineCompat is true (default)
 */

import { Document, Packer } from 'docx';
import type { ExportOptions, ExportStats } from '../types.js';
import { changesToDocxParagraphs } from './tokens-to-docx.js';
import { patchDocxForWordOnline } from './word-online-patch.js';

export async function exportDocx(
  markdown: string,
  options?: ExportOptions
): Promise<{ buffer: Buffer; stats: ExportStats }> {
  const mode = options?.mode ?? 'settled';
  const comments = options?.comments ?? 'all';
  const wordOnlineCompat = options?.wordOnlineCompat ?? true;
  const title = options?.title ?? 'ChangeTracks Export';

  const VALID_MODES = new Set(['tracked', 'settled', 'clean']);
  const VALID_COMMENTS = new Set(['all', 'none', 'unresolved']);
  if (!VALID_MODES.has(mode)) {
    throw new Error(`Invalid export mode "${mode}". Expected one of: tracked, settled, clean`);
  }
  if (!VALID_COMMENTS.has(comments)) {
    throw new Error(`Invalid comment mode "${comments}". Expected one of: all, none, unresolved`);
  }

  // Step 1: Convert markdown to paragraphs
  const result = changesToDocxParagraphs(markdown, { mode, comments });

  // Step 2: Build Document
  const doc = new Document({
    creator: 'ChangeTracks',
    title,
    description: 'Converted from CriticMarkup by @changetracks/docx',
    features: {
      trackRevisions: mode !== 'clean',
    },
    comments:
      result.commentDefs.length > 0
        ? { children: result.commentDefs }
        : undefined,
    sections: [
      {
        children: result.paragraphs,
      },
    ],
  });

  // Step 3: Pack to buffer
  let buffer: Buffer = Buffer.from(await Packer.toBuffer(doc)) as Buffer;

  // Step 4: Post-process for Word Online compatibility
  if (wordOnlineCompat) {
    buffer = await patchDocxForWordOnline(buffer, result.commentPatchInfos) as Buffer;
  }

  return {
    buffer: buffer as Buffer,
    stats: {
      insertions: result.stats.insertions,
      deletions: result.stats.deletions,
      substitutions: result.stats.substitutions,
      comments: result.stats.comments,
      authors: result.stats.authors,
      fileSize: buffer.length,
    },
  };
}
