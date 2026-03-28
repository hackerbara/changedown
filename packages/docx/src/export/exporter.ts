/**
 * Export orchestrator — converts CriticMarkup markdown to a .docx buffer.
 *
 * Steps:
 * 1. Convert markdown to docx Paragraphs via tokens-to-docx
 * 2. Create a docx Document with tracked changes enabled
 * 3. Pack to ArrayBuffer via Packer.toArrayBuffer()
 * 4. Apply patches if wordOnlineCompat is true (default)
 */

import { Document, Packer } from 'docx';
import type { ExportOptions, ExportStats } from '../types.js';
import { changesToDocxParagraphs } from './tokens-to-docx.js';
import { patchDocxForWordOnline } from './word-online-patch.js';

export async function exportDocx(
  markdown: string,
  options?: ExportOptions
): Promise<{ buffer: Uint8Array; stats: ExportStats }> {
  const mode = options?.mode ?? 'settled';
  const comments = options?.comments ?? 'all';
  const wordOnlineCompat = options?.wordOnlineCompat ?? true;
  const title = options?.title ?? 'ChangeDown Export';

  const VALID_MODES = new Set(['tracked', 'settled', 'clean']);
  const VALID_COMMENTS = new Set(['all', 'none', 'unresolved']);
  if (!VALID_MODES.has(mode)) {
    throw new Error(`Invalid export mode "${mode}". Expected one of: tracked, settled, clean`);
  }
  if (!VALID_COMMENTS.has(comments)) {
    throw new Error(`Invalid comment mode "${comments}". Expected one of: all, none, unresolved`);
  }

  // Step 1: Convert markdown to paragraphs
  const result = changesToDocxParagraphs(markdown, {
    mode,
    comments,
    mediaDir: options?.mediaDir,
    defaultDpi: options?.defaultDpi,
    maxWidthInches: options?.maxWidthInches,
    fileReader: options?.fileReader,
  });

  // Step 2: Build Document
  const doc = new Document({
    creator: 'ChangeDown',
    title,
    description: 'Converted from CriticMarkup by @changedown/docx',
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
  let buffer: Uint8Array = new Uint8Array(await Packer.toArrayBuffer(doc));

  // Step 4: Post-process for Word Online compatibility
  if (wordOnlineCompat) {
    buffer = await patchDocxForWordOnline(
      buffer,
      result.commentPatchInfos,
      result.imagePatchInfos,
      undefined,
      result.hyperlinkPatchInfos,
    );
  }

  return {
    buffer,
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
