import type { ThreeZoneDocument, ThreeZoneLine, DeliberationHeader, ContentSpan, LineMetadata } from '../three-zone-types.js';

// ANSI escape codes
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const ITALIC = '\x1b[3m';
const STRIKETHROUGH = '\x1b[9m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';
const BG_YELLOW = '\x1b[43m';

export interface AnsiFormatOptions {
  /** Show CriticMarkup delimiters in output. Default: false (visual cues mode). */
  showMarkup?: boolean;
  /** Use Unicode combining long stroke overlay (U+0336) instead of ANSI \x1b[9m for strikethrough. Default: false. */
  useUnicodeStrikethrough?: boolean;
}

/**
 * Formats a ThreeZoneDocument as ANSI-colored terminal output.
 *
 * Human-facing: no hashlines, colored gutter, visual cues for CriticMarkup.
 *
 * Zone 1: Line number + colored gutter bar (red for P, green for A, dim for clean)
 * Zone 2: Content with colored spans (green insertion, red+strikethrough deletion, etc.)
 * Zone 3: Dimmed metadata annotations
 */
export function formatAnsi(doc: ThreeZoneDocument, options?: AnsiFormatOptions): string {
  const showMarkup = options?.showMarkup ?? false;
  const useUnicodeStrike = options?.useUnicodeStrikethrough ?? false;
  const parts: string[] = [];

  // Header
  parts.push(formatHeader(doc.header));
  parts.push('');

  // Compute line number padding width from last line
  const padWidth = doc.lines.length > 0
    ? Math.max(String(doc.lines[doc.lines.length - 1].margin.lineNumber).length, 2)
    : 2;

  // Lines
  for (const line of doc.lines) {
    parts.push(formatLine(line, padWidth, showMarkup, useUnicodeStrike));
  }

  return parts.join('\n');
}

function formatHeader(header: DeliberationHeader): string {
  const lines: string[] = [];

  // File path + protocol info
  lines.push(`${BOLD}${CYAN}${header.filePath}${RESET} ${DIM}| ${header.protocolMode} | ${header.trackingStatus}${RESET}`);

  // Status counts
  const p = header.counts.proposed;
  const a = header.counts.accepted;
  const r = header.counts.rejected;
  const countParts: string[] = [];
  if (p > 0) countParts.push(`${YELLOW}${p} proposed${RESET}`);
  if (a > 0) countParts.push(`${GREEN}${a} accepted${RESET}`);
  if (r > 0) countParts.push(`${RED}${r} rejected${RESET}`);
  if (countParts.length > 0) lines.push(countParts.join(' | '));

  // Authors
  if (header.authors.length > 0) {
    lines.push(`${DIM}authors: ${header.authors.join(', ')}${RESET}`);
  }

  // Separator
  lines.push(`${DIM}${'─'.repeat(60)}${RESET}`);

  return lines.join('\n');
}

function formatLine(line: ThreeZoneLine, padWidth: number, showMarkup: boolean, useUnicodeStrike: boolean): string {
  // Zone 1: Line number (no hash — human-facing) + colored gutter
  const num = `${GRAY}${String(line.margin.lineNumber).padStart(padWidth, ' ')}${RESET}`;

  let gutter: string;
  if (line.margin.flags.includes('P')) {
    gutter = `${RED}┃${RESET}`;
  } else if (line.margin.flags.includes('A')) {
    gutter = `${GREEN}┃${RESET}`;
  } else {
    gutter = `${DIM}│${RESET}`;
  }

  // Zone 2: Content with ANSI-colored spans
  const content = line.content.map(s => formatSpan(s, showMarkup, useUnicodeStrike)).join('');

  // Zone 3: Metadata (dimmed)
  const meta = formatMetadata(line.metadata);

  if (meta) {
    return `${num} ${gutter} ${content} ${meta}`;
  }
  return `${num} ${gutter} ${content}`;
}

/**
 * Apply Unicode combining long stroke overlay (U+0336) to each character.
 * This produces visible strikethrough in terminals that don't support ANSI \x1b[9m.
 */
function unicodeStrike(text: string): string {
  return Array.from(text).map(ch => ch + '\u0336').join('');
}

function formatSpan(span: ContentSpan, showMarkup: boolean, useUnicodeStrike: boolean): string {
  const strike = useUnicodeStrike
    ? (t: string) => unicodeStrike(t)
    : (t: string) => `${STRIKETHROUGH}${t}`;

  switch (span.type) {
    case 'plain':
      return span.text;
    case 'insertion':
      return `${GREEN}${span.text}${RESET}`;
    case 'deletion':
      return `${RED}${strike(span.text)}${RESET}`;
    case 'sub_old':
      return `${RED}${strike(span.text)}${RESET}`;
    case 'sub_arrow':
      return `${DIM}\u2192${RESET}`;
    case 'sub_new':
      return `${GREEN}${span.text}${RESET}`;
    case 'highlight':
      return `${BG_YELLOW}${span.text}${RESET}`;
    case 'comment':
      return `${DIM}${ITALIC}${span.text}${RESET}`;
    case 'anchor':
      // Anchors are agent-facing only — hidden in human terminal output
      return '';
    case 'delimiter':
      return showMarkup ? `${DIM}${span.text}${RESET}` : '';
    default:
      return span.text;
  }
}

function formatMetadata(metadata: LineMetadata[]): string {
  if (metadata.length === 0) return '';

  const parts = metadata.map(m => {
    let block = m.changeId;
    if (m.author) block += ` ${m.author}:`;
    if (m.reason) block += ` ${m.reason}`;
    if (m.replyCount != null && m.replyCount > 0) {
      block += ` | ${m.replyCount} ${m.replyCount === 1 ? 'reply' : 'replies'}`;
    }
    return block;
  });

  return `${DIM}${parts.join(' ')}${RESET}`;
}
