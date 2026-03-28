import { diffLines, Change } from 'diff';
import { getCommentSyntax, wrapLineComment, CommentSyntax } from '../comment-syntax.js';
import { SIDECAR_BLOCK_MARKER } from '../constants.js';

/**
 * Optional metadata to include in sidecar block entries.
 */
export interface AnnotationMetadata {
  author?: string;
  date?: string;
}

/** Type of a sidecar change entry. */
type SidecarChangeType = 'ins' | 'del' | 'sub';

/** Tracks a single logical change for the sidecar block. */
interface SidecarEntry {
  tag: string;
  type: SidecarChangeType;
  /** Original text for deletions and substitutions (joined, no trailing newline). */
  original?: string;
}

/**
 * Splits a diff change value into individual lines (without trailing newlines).
 * Handles the trailing-newline convention of diffLines:
 * "a = 1\nb = 2\n" -> ["a = 1", "b = 2"]
 */
function splitChangeLines(value: string): string[] {
  // Remove trailing newline if present, then split
  const trimmed = value.endsWith('\n') ? value.slice(0, -1) : value;
  if (trimmed === '') {
    return [];
  }
  return trimmed.split('\n');
}

/**
 * Converts old text + new text into sidecar-annotated code output
 * for a given language.
 *
 * Sidecar annotation marks changes in code files using line comments:
 * - Deletion: `# - original_code  # cn-N`
 * - Insertion: `new_code  # cn-N`
 * - Substitution: deletion line + insertion line with same cn-N tag
 *
 * A sidecar metadata block is appended at the bottom of the file.
 *
 * Returns undefined if the language has no line-comment syntax.
 */
export function annotateSidecar(
  oldText: string,
  newText: string,
  languageId: string,
  metadata?: AnnotationMetadata
): string | undefined {
  // Identical text: no annotation needed
  if (oldText === newText) {
    return newText;
  }

  const syntax = getCommentSyntax(languageId);
  if (!syntax) {
    return undefined;
  }

  const lineChanges = diffLines(oldText, newText);
  const outputLines: string[] = [];
  const entries: SidecarEntry[] = [];
  let tagCounter = 0;

  for (let i = 0; i < lineChanges.length; i++) {
    const change = lineChanges[i];
    const next: Change | undefined = lineChanges[i + 1];

    if (change.removed && next?.added) {
      // Adjacent removed + added: substitution
      tagCounter++;
      const tag = `cn-${tagCounter}`;
      const oldLines = splitChangeLines(change.value);
      const newLines = splitChangeLines(next.value);

      // Emit deletion lines for old content
      for (const line of oldLines) {
        outputLines.push(wrapLineComment(line, tag, syntax, true));
      }
      // Emit insertion lines for new content
      for (const line of newLines) {
        outputLines.push(wrapLineComment(line, tag, syntax, false));
      }

      entries.push({
        tag,
        type: 'sub',
        original: oldLines.join('\n'),
      });

      i++; // Skip the next (added) change
    } else if (change.removed) {
      // Pure deletion
      tagCounter++;
      const tag = `cn-${tagCounter}`;
      const oldLines = splitChangeLines(change.value);

      for (const line of oldLines) {
        outputLines.push(wrapLineComment(line, tag, syntax, true));
      }

      entries.push({
        tag,
        type: 'del',
        original: oldLines.join('\n'),
      });
    } else if (change.added) {
      // Pure insertion
      tagCounter++;
      const tag = `cn-${tagCounter}`;
      const newLines = splitChangeLines(change.value);

      for (const line of newLines) {
        outputLines.push(wrapLineComment(line, tag, syntax, false));
      }

      entries.push({
        tag,
        type: 'ins',
      });
    } else {
      // Unchanged lines: pass through as-is
      const lines = splitChangeLines(change.value);
      for (const line of lines) {
        outputLines.push(line);
      }
    }
  }

  // Build the sidecar block
  const cm = syntax.line;
  const sidecarLines: string[] = [];
  const divider = '-'.repeat(45);

  sidecarLines.push(`${cm} ${SIDECAR_BLOCK_MARKER} ${divider}`);

  for (const entry of entries) {
    sidecarLines.push(`${cm} [^${entry.tag}]: ${entry.type} | pending`);

    // Add metadata if provided
    if (metadata?.author) {
      sidecarLines.push(`${cm}     author: ${metadata.author}`);
    }
    if (metadata?.date) {
      sidecarLines.push(`${cm}     date: ${metadata.date}`);
    }

    // Add original text for deletions and substitutions
    if (entry.original !== undefined) {
      // Quote the original - use first line only if multi-line, with truncation indicator
      const firstLine = entry.original.split('\n')[0];
      const originalDisplay = entry.original.includes('\n')
        ? `"${firstLine}" (+${entry.original.split('\n').length - 1} more lines)`
        : `"${firstLine}"`;
      sidecarLines.push(`${cm}     original: ${originalDisplay}`);
    }
  }

  sidecarLines.push(`${cm} ${divider}---------------------`);

  // Combine: code lines + blank line + sidecar block + trailing newline
  const codeSection = outputLines.join('\n');
  const sidecarSection = sidecarLines.join('\n');

  return `${codeSection}\n${sidecarSection}\n`;
}
