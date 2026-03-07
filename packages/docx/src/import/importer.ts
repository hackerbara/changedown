import * as fs from 'fs';
import type { ImportOptions, ImportStats } from '../types.js';
import { runPandoc } from './pandoc-runner.js';
import {
  extractComments,
  extractCommentRanges,
} from './comment-extractor.js';
import { astToMarkup } from './ast-to-markup.js';

export async function importDocx(
  docxPath: string,
  options?: ImportOptions
): Promise<{ markdown: string; stats: ImportStats }> {
  const mergeSubstitutions = options?.mergeSubstitutions ?? true;
  const comments = options?.comments ?? true;

  // Step 1: Run pandoc to get JSON AST
  const { ast } = runPandoc(docxPath, options?.pandocPath);

  // Step 2: Extract comments from DOCX ZIP (if comments enabled)
  // Read the file once and pass the buffer to both extractors
  let commentData:
    | {
        allComments: Map<string, import('./comment-extractor.js').DocxComment>;
        rangedIds: Set<string>;
        replies: Map<string, string[]>;
      }
    | undefined;

  if (comments) {
    const fileBuffer = fs.readFileSync(docxPath);
    const allComments = await extractComments(fileBuffer);
    if (allComments.size > 0) {
      const { rangedIds, replies } = await extractCommentRanges(
        fileBuffer,
        allComments
      );
      commentData = { allComments, rangedIds, replies };
    }
  }

  // Step 3: Convert AST to CriticMarkup
  const result = astToMarkup(ast, {
    mergeSubstitutions,
    comments,
    commentData,
  });

  return result;
}
