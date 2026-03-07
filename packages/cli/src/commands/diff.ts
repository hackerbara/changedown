import * as fs from 'node:fs';
import {
  buildViewDocument,
  formatAnsi,
  initHashline,
  findFootnoteBlock,
  type ThreeZoneViewName,
  type ThreeZoneDocument,
} from '@changetracks/core';

// ANSI codes used for thread rendering (subset of what formatAnsi uses)
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const ITALIC = '\x1b[3m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';

/**
 * A single thread reply extracted from a footnote block.
 */
export interface ThreadEntry {
  author: string;
  date: string;
  text: string;
}

/**
 * Regex matching a thread reply line (indented, starts with @author date:).
 * Captures: 1=author (with @), 2=date, 3=reply text.
 */
const RE_THREAD_REPLY = /^\s+(@\S+)\s+(\d{4}-\d{2}-\d{2}):\s*(.*)/;

/**
 * Extracts thread reply entries from footnote blocks in the raw file content.
 * Returns a Map from change ID to an array of ThreadEntry objects.
 */
export function extractThreadEntries(content: string): Map<string, ThreadEntry[]> {
  const lines = content.split('\n');
  const threads = new Map<string, ThreadEntry[]>();

  // Find all change IDs referenced in the file by scanning for [^ct-N] patterns
  const refRe = /\[\^(ct-\d+(?:\.\d+)?)\]/g;
  const changeIds = new Set<string>();
  for (const match of content.matchAll(refRe)) {
    changeIds.add(match[1]);
  }

  for (const changeId of changeIds) {
    const block = findFootnoteBlock(lines, changeId);
    if (!block) continue;

    const entries: ThreadEntry[] = [];
    for (let i = block.headerLine + 1; i <= block.blockEnd; i++) {
      const match = lines[i].match(RE_THREAD_REPLY);
      if (match) {
        entries.push({
          author: match[1],
          date: match[2],
          text: match[3],
        });
      }
    }

    if (entries.length > 0) {
      threads.set(changeId, entries);
    }
  }

  return threads;
}

/**
 * Formats thread entries as ANSI-colored indented lines for terminal display.
 * Each entry is rendered as: "    [dim]author date:[reset] [italic]text[reset]"
 */
export function formatThreadLines(
  entries: ThreadEntry[],
  gutterWidth: number,
): string[] {
  // Build a gutter prefix that aligns with the content area
  // The line format is: "NUM GUTTER CONTENT" where NUM is padded to gutterWidth
  const gutterPad = ' '.repeat(gutterWidth);
  const threadGutter = `${GRAY}${gutterPad}  ${DIM}│${RESET}`;

  return entries.map(entry => {
    const authorDate = `${CYAN}${entry.author}${RESET} ${DIM}${entry.date}:${RESET}`;
    const text = `${ITALIC}${entry.text}${RESET}`;
    return `${threadGutter}   ${authorDate} ${text}`;
  });
}

/**
 * Renders a ThreeZoneDocument with ANSI colors and optionally expands
 * discussion threads inline below lines that have them.
 */
export function formatAnsiWithThreads(
  doc: ThreeZoneDocument,
  content: string,
  options: {
    showMarkup?: boolean;
    useUnicodeStrikethrough?: boolean;
    threads?: boolean;
  },
): string {
  // Get base ANSI output
  const baseOutput = formatAnsi(doc, {
    showMarkup: options.showMarkup ?? false,
    useUnicodeStrikethrough: options.useUnicodeStrikethrough ?? false,
  });

  if (!options.threads) {
    return baseOutput;
  }

  // Extract thread data from raw content
  const threadMap = extractThreadEntries(content);
  if (threadMap.size === 0) {
    return baseOutput;
  }

  // Split output into lines
  const outputLines = baseOutput.split('\n');

  // Compute gutter width from the document (same as formatAnsi does)
  const padWidth = doc.lines.length > 0
    ? Math.max(String(doc.lines[doc.lines.length - 1].margin.lineNumber).length, 2)
    : 2;

  // Count header lines in the output. formatAnsi produces:
  //   formatHeader() result (multi-line string) → joined into parts[0]
  //   '' (blank line) → parts[1]
  //   then one line per doc line
  //
  // formatHeader produces 2-4 lines:
  //   1. File path line (always)
  //   2. Counts line (only if counts > 0)
  //   3. Authors line (only if authors exist)
  //   4. Separator line (always)
  //
  // We count header lines by finding the separator (the dim line of '─' chars)
  let headerEndIndex = -1;
  for (let i = 0; i < outputLines.length; i++) {
    // The separator line contains repeated '─' characters
    if (outputLines[i].includes('─'.repeat(10))) {
      headerEndIndex = i;
      break;
    }
  }

  // After the separator, there's an empty line, then content lines start
  // Content starts at headerEndIndex + 2 (separator + blank line)
  const contentStartIndex = headerEndIndex + 2;

  // Build new output with thread lines inserted
  const result: string[] = [];

  // Copy header + blank line
  for (let i = 0; i < contentStartIndex; i++) {
    result.push(outputLines[i]);
  }

  // Process each content line, inserting thread lines where needed
  for (let i = 0; i < doc.lines.length; i++) {
    const outputIndex = contentStartIndex + i;
    if (outputIndex < outputLines.length) {
      result.push(outputLines[outputIndex]);
    }

    // Check if this line has metadata with thread replies
    const line = doc.lines[i];
    for (const meta of line.metadata) {
      if (meta.replyCount && meta.replyCount > 0) {
        const entries = threadMap.get(meta.changeId);
        if (entries && entries.length > 0) {
          const threadLines = formatThreadLines(entries, padWidth);
          result.push(...threadLines);
        }
      }
    }
  }

  // Append any trailing lines from the original output (shouldn't normally exist)
  const expectedEnd = contentStartIndex + doc.lines.length;
  for (let i = expectedEnd; i < outputLines.length; i++) {
    result.push(outputLines[i]);
  }

  return result.join('\n');
}

/**
 * Detects git diff driver invocation. Git passes exactly 7 args with a 40-char
 * hex SHA at position 2 (argv[2]).
 */
export function isGitDiffDriverInvocation(args: string[]): boolean {
  return args.length === 7 && /^[0-9a-f]{40}$/.test(args[2] ?? '');
}

/**
 * Handles git diff driver mode. Git passes the file path at args[4].
 */
export async function handleGitDiffDriver(args: string[]): Promise<string> {
  await initHashline();
  const content = fs.readFileSync(args[4], 'utf-8');
  const doc = buildViewDocument(content, 'review', {
    filePath: args[4],
    trackingStatus: 'tracked',
    protocolMode: 'classic',
    defaultView: 'review',
    viewPolicy: 'suggest',
  });
  return formatAnsi(doc, { useUnicodeStrikethrough: true });
}

export interface DiffOptions {
  view?: ThreeZoneViewName;
  showMarkup?: boolean;
  unicodeStrike?: boolean;
  threads?: boolean;
}

/**
 * Renders a file with ANSI-colored CriticMarkup using the unified three-zone pipeline.
 * When `threads` is true, discussion threads are expanded inline below their changes.
 */
export async function handleDiff(file: string, options?: DiffOptions): Promise<string> {
  await initHashline();
  const content = fs.readFileSync(file, 'utf-8');
  const view: ThreeZoneViewName = options?.view ?? 'review';
  const doc = buildViewDocument(content, view, {
    filePath: file,
    trackingStatus: 'tracked',
    protocolMode: 'classic',
    defaultView: 'review',
    viewPolicy: 'suggest',
  });

  if (options?.threads) {
    return formatAnsiWithThreads(doc, content, {
      showMarkup: options?.showMarkup ?? false,
      useUnicodeStrikethrough: options?.unicodeStrike ?? true,
      threads: true,
    });
  }

  return formatAnsi(doc, {
    showMarkup: options?.showMarkup ?? false,
    useUnicodeStrikethrough: options?.unicodeStrike ?? true,
  });
}
