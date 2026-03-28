import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { imageSize } from 'image-size';
import { findPandoc, type PandocAst } from './pandoc-runner.js';
import {
  type ImageInfo,
  detectFormat, isPreviewableFormat,
  pixelsToInches, FALLBACK_WIDTH_INCHES, FALLBACK_HEIGHT_INCHES,
} from '../shared/image-types.js';

export interface ExtractMediaResult {
  extractDir: string;
  ast: PandocAst;
}

/**
 * Extract media from a DOCX file using pandoc --extract-media.
 * Returns both the extraction directory and the parsed AST from the same
 * pandoc invocation, avoiding the need for a second pandoc call.
 */
export function extractMedia(
  docxPath: string,
  outputDir: string,
  pandocPath?: string,
): ExtractMediaResult | undefined {
  let pandoc: string;
  try {
    pandoc = findPandoc(pandocPath);
  } catch {
    return undefined;
  }

  const extractDir = path.join(outputDir, '_pandoc_extract');
  fs.mkdirSync(extractDir, { recursive: true });

  let stdout: string;
  try {
    stdout = execFileSync(pandoc, [
      '--track-changes=all',
      '--extract-media=' + extractDir,
      docxPath,
      '-t', 'json',
    ], {
      maxBuffer: 50 * 1024 * 1024,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as string;
  } catch {
    return undefined;
  }

  const mediaSubdir = path.join(extractDir, 'media');
  if (!fs.existsSync(mediaSubdir)) {
    return undefined;
  }

  let ast: PandocAst;
  try {
    ast = JSON.parse(stdout);
  } catch {
    return undefined;
  }

  return { extractDir, ast };
}

/**
 * Rename the pandoc extraction folder to {basename}_media/.
 * The `media/` subdirectory inside extractDir is moved to `{basename}_media/`
 * in the same parent directory, and the now-empty extractDir is removed.
 */
export function renameMediaFolder(
  extractDir: string,
  basename: string,
): string {
  const parentDir = path.dirname(extractDir);
  const targetDir = path.join(parentDir, `${basename}_media`);

  const mediaSubdir = path.join(extractDir, 'media');
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true });
  }
  fs.renameSync(mediaSubdir, targetDir);

  fs.rmSync(extractDir, { recursive: true, force: true });

  return targetDir;
}

/**
 * Inventory all images in a media directory.
 * Returns an ImageInfo array for each recognized image file.
 */
export function inventoryImages(mediaDir: string): ImageInfo[] {
  if (!fs.existsSync(mediaDir)) return [];

  const files = fs.readdirSync(mediaDir);
  const images: ImageInfo[] = [];

  for (const file of files) {
    const format = detectFormat(file);
    if (!format) continue;

    const filePath = path.join(mediaDir, file);
    let dimensions = { widthIn: FALLBACK_WIDTH_INCHES, heightIn: FALLBACK_HEIGHT_INCHES };

    try {
      const fileData = new Uint8Array(fs.readFileSync(filePath));
      const result = imageSize(fileData);
      if (result.width && result.height) {
        dimensions = {
          widthIn: pixelsToInches(result.width),
          heightIn: pixelsToInches(result.height),
        };
      }
    } catch {
      // Use fallback dimensions for corrupt or unsupported images
    }

    images.push({
      filename: file,
      format,
      dimensions,
      previewable: isPreviewableFormat(format),
    });
  }

  return images;
}
