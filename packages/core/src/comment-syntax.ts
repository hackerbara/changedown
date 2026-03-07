/**
 * Comment syntax map for language-aware sidecar annotations.
 *
 * Maps VS Code language IDs to line-comment prefixes and provides
 * wrap/strip functions for sidecar annotation markers on code lines.
 */

/** Line-comment prefix for a language (e.g. "#", "//", "--"). */
export interface CommentSyntax {
  line: string;
}

/** Result of stripping a sidecar annotation from a code line. */
export interface StrippedLine {
  /** The original code with annotation markers removed. */
  code: string;
  /** The ct-N or ct-N.M tag. */
  tag: string;
  /** True if the line is a deletion marker. */
  isDeletion: boolean;
  /** Leading whitespace/indentation. */
  indent: string;
}

/**
 * Map from VS Code language ID to line-comment syntax.
 * Markdown is intentionally excluded (returns undefined) because
 * markdown files use inline CriticMarkup, not sidecar annotations.
 */
const SYNTAX_MAP: Record<string, CommentSyntax> = {
  // Hash-comment languages
  python:          { line: '#' },
  ruby:            { line: '#' },
  shellscript:     { line: '#' },
  perl:            { line: '#' },
  r:               { line: '#' },
  yaml:            { line: '#' },
  toml:            { line: '#' },

  // C-style comment languages
  javascript:      { line: '//' },
  typescript:      { line: '//' },
  javascriptreact: { line: '//' },
  typescriptreact: { line: '//' },
  java:            { line: '//' },
  c:               { line: '//' },
  cpp:             { line: '//' },
  csharp:          { line: '//' },
  go:              { line: '//' },
  rust:            { line: '//' },
  swift:           { line: '//' },
  kotlin:          { line: '//' },
  php:             { line: '//' },

  // Double-dash comment languages
  lua:             { line: '--' },
  sql:             { line: '--' },
};

/**
 * Returns the line-comment syntax for a VS Code language ID.
 * Returns undefined for unknown languages and markdown.
 */
export function getCommentSyntax(languageId: string): CommentSyntax | undefined {
  return SYNTAX_MAP[languageId];
}

/**
 * Wraps a code line with a sidecar annotation marker.
 *
 * Deletion format:  `${indent}${syntax.line} - ${trimmedCode}  ${syntax.line} ${tag}`
 * Insertion format: `${code}  ${syntax.line} ${tag}`
 *
 * Leading whitespace is preserved in both cases.
 */
export function wrapLineComment(
  code: string,
  tag: string,
  syntax: CommentSyntax,
  isDeletion: boolean
): string {
  if (isDeletion) {
    const indent = code.match(/^(\s*)/)?.[1] ?? '';
    const trimmedCode = code.slice(indent.length);
    return `${indent}${syntax.line} - ${trimmedCode}  ${syntax.line} ${tag}`;
  }
  return `${code}  ${syntax.line} ${tag}`;
}

/** Escapes a string for safe use in a RegExp. */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Computes the byte offset of the start of a given line in a lines array.
 * Each line before the target contributes its length + 1 (for the \n).
 */
export function lineOffset(lines: string[], lineIndex: number): number {
  let offset = 0;
  for (let i = 0; i < lineIndex; i++) {
    offset += lines[i].length + 1; // +1 for the \n
  }
  return offset;
}

// Regex for ct-N or ct-N.M tags
const SC_TAG_PATTERN = /ct-\d+(?:\.\d+)?/;

/**
 * Strips a sidecar annotation from a line, extracting the original code,
 * sc tag, deletion flag, and indentation.
 *
 * Returns null if the line has no ct-N tag.
 *
 * Deletion pattern: `indent + commentChar + " - " + code + "  " + commentChar + " " + tag`
 * Insertion pattern: `code + "  " + commentChar + " " + tag`
 */
export function stripLineComment(
  line: string,
  syntax: CommentSyntax
): StrippedLine | null {
  // First check: does the line contain an sc tag at all?
  const tagMatch = line.match(SC_TAG_PATTERN);
  if (!tagMatch) {
    return null;
  }

  const tag = tagMatch[0];
  const cm = syntax.line;

  // Try deletion pattern first:
  // indent + commentChar + " - " + code + "  " + commentChar + " " + tag
  const delPrefix = `${cm} - `;
  const delSuffix = `  ${cm} ${tag}`;

  // Find leading whitespace
  const indentMatch = line.match(/^(\s*)/);
  const indent = indentMatch?.[1] ?? '';
  const afterIndent = line.slice(indent.length);

  if (afterIndent.startsWith(delPrefix) && line.endsWith(delSuffix)) {
    // Deletion line
    const codeStart = indent.length + delPrefix.length;
    const codeEnd = line.length - delSuffix.length;
    const code = line.slice(codeStart, codeEnd);
    return { code, tag, isDeletion: true, indent };
  }

  // Try insertion pattern:
  // code + "  " + commentChar + " " + tag
  const insSuffix = `  ${cm} ${tag}`;
  if (line.endsWith(insSuffix)) {
    const code = line.slice(0, line.length - insSuffix.length);
    // Separate indent from the code portion
    const codeIndentMatch = code.match(/^(\s*)/);
    const codeIndent = codeIndentMatch?.[1] ?? '';
    const trimmedCode = code.slice(codeIndent.length);
    return { code: trimmedCode, tag, isDeletion: false, indent: codeIndent };
  }

  return null;
}
