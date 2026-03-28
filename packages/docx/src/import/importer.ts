import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ImportOptions, ImportStats } from '../types.js';
import { runPandoc } from './pandoc-runner.js';
import {
  extractMedia,
  renameMediaFolder,
} from './media-extractor.js';
import type { PandocAst } from './pandoc-runner.js';
import type { ImageInfo } from '../shared/image-types.js';
import { importDocxFromAst } from './import-from-ast.js';

// Re-export so Node callers can still import from importer.ts
export { importDocxFromAst };

export async function importDocx(
  docxPath: string,
  options?: ImportOptions
): Promise<{ markdown: string; stats: ImportStats; mediaDir?: string; images?: ImageInfo[] }> {
  // Step 1: Get AST and extract media in a single pandoc call (when enabled)
  let ast: PandocAst;
  let finalMediaDir: string | undefined;
  const docBasename = path.basename(docxPath, path.extname(docxPath));

  if (options?.extractMedia !== false) {
    const outputDir = options?.mediaDir
      ?? fs.mkdtempSync(path.join(os.tmpdir(), 'changedown-media-'));
    const result = extractMedia(docxPath, outputDir, options?.pandocPath);
    if (result) {
      ast = result.ast;
      finalMediaDir = renameMediaFolder(result.extractDir, docBasename);
    } else {
      // Media extraction failed — fall back to AST-only pandoc call
      ast = runPandoc(docxPath, options?.pandocPath).ast;
    }
  } else {
    ast = runPandoc(docxPath, options?.pandocPath).ast;
  }

  // Step 2: Read DOCX bytes for metadata extraction
  const fileBuffer = new Uint8Array(fs.readFileSync(docxPath));

  // Step 3: Build mediaFiles map from filesystem
  const mediaFilesMap = new Map<string, Uint8Array>();
  if (finalMediaDir) {
    const files = fs.readdirSync(finalMediaDir);
    for (const file of files) {
      const filePath = path.join(finalMediaDir, file);
      mediaFilesMap.set(`media/${file}`, new Uint8Array(fs.readFileSync(filePath)));
    }
  }

  // Step 4: Delegate to shared pipeline
  const shared = await importDocxFromAst(ast, fileBuffer, mediaFilesMap, {
    mergeSubstitutions: options?.mergeSubstitutions ?? true,
    comments: options?.comments ?? true,
    basename: docBasename,
  });

  return {
    markdown: shared.markdown,
    stats: shared.stats,
    mediaDir: finalMediaDir,
    images: finalMediaDir ? shared.images : undefined,
  };
}
