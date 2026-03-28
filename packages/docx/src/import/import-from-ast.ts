/**
 * Shared import pipeline — environment-agnostic.
 * Takes pre-obtained pandoc AST and DOCX bytes, returns L2 CriticMarkup.
 * Called by Node's importDocx() and browser's converter.
 *
 * This file is intentionally separate from importer.ts to avoid pulling
 * in Node-only dependencies (fs, path, image-size) when imported in the browser.
 */
import type { ImportStats } from '../types.js';
import { extractMetadata } from './xml-metadata-extractor.js';
import type { CommentData } from './xml-metadata-extractor.js';
import { buildEnrichmentMap } from './correlation-engine.js';
import { astToMarkup } from './ast-to-markup.js';
import type { PandocAst } from './pandoc-runner.js';
import type { ImageInfo } from '../shared/image-types.js';
import {
  detectFormat,
  emuToInches,
  isPreviewableFormat,
} from '../shared/image-types.js';
import { basename } from '../shared/basename.js';

export async function importDocxFromAst(
  ast: PandocAst,
  docxBytes: Uint8Array,
  mediaFiles: Map<string, Uint8Array>,
  options?: { mergeSubstitutions?: boolean; comments?: boolean; basename?: string }
): Promise<{ markdown: string; stats: ImportStats; images: ImageInfo[]; mediaDir: string }> {
  const mergeSubstitutions = options?.mergeSubstitutions ?? true;
  const comments = options?.comments ?? true;
  const docBasename = options?.basename ?? 'document';
  const mediaDirName = `${docBasename}_media`;

  // Step 1: Extract metadata from DOCX ZIP
  const metadata = await extractMetadata(docxBytes);
  const enrichmentMap = buildEnrichmentMap(ast, metadata);

  let commentData: CommentData | undefined;
  if (comments && metadata.comments.allComments.size > 0) {
    commentData = metadata.comments;
  }

  // Step 2: Convert AST to CriticMarkup
  const result = astToMarkup(ast, {
    mergeSubstitutions,
    comments,
    commentData,
    enrichment: enrichmentMap,
  });

  // Step 3: Rewrite image paths to {basename}_media/filename
  let { markdown } = result;
  markdown = markdown.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_match, alt, src) => {
      const filename = basename(src);
      return `![${alt}](${mediaDirName}/${filename})`;
    },
  );

  // Step 4: Rename media keys and build ImageInfo[]
  const renamedMedia = new Map<string, Uint8Array>();
  const images: ImageInfo[] = [];
  for (const [key, data] of mediaFiles) {
    const filename = basename(key);
    const newKey = `${mediaDirName}/${filename}`;
    renamedMedia.set(newKey, data);

    const format = detectFormat(filename);
    if (format) {
      const drawing = enrichmentMap.getImageEnrichment(key);
      const dims = drawing
        ? { widthIn: emuToInches(drawing.extent.widthEmu), heightIn: emuToInches(drawing.extent.heightEmu) }
        : { widthIn: 3, heightIn: 3 };
      images.push({ filename, format, dimensions: dims, previewable: isPreviewableFormat(format) });
    }
  }

  // Replace mediaFiles entries with renamed keys
  mediaFiles.clear();
  for (const [k, v] of renamedMedia) mediaFiles.set(k, v);

  return { markdown, stats: result.stats, images, mediaDir: mediaDirName };
}
