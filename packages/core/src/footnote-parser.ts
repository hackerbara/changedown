/**
 * Lightweight footnote parser for metadata extraction.
 *
 * Parses `[^ct-N]: @author | date | type | status` header lines and their
 * indented continuation lines (metadata key-value pairs and thread replies).
 *
 * This serves a different purpose from CriticMarkupParser.parseFootnoteDefinitions()
 * which builds a full AST FootnoteDefinition. This module provides lightweight
 * FootnoteInfo records with line positions, suitable for meta-rendering and
 * committed-view computation.
 */

/**
 * Parsed footnote definition.
 * Extracted from `[^ct-N]: @author | date | type | status` header lines
 * plus indented metadata and thread reply lines.
 */
import { FOOTNOTE_DEF_LENIENT, FOOTNOTE_THREAD_REPLY } from './footnote-patterns.js';
import { findFootnoteBlockStart } from './footnote-utils.js';
import { parseTimestamp, type Timestamp } from './timestamp.js';

export interface FootnoteInfo {
  id: string;             // e.g. "ct-1", "ct-2.3"
  author: string;         // e.g. "@alice", "@ai:claude-opus-4.6"
  /** @deprecated Use timestamp.date */
  date: string;           // e.g. "2026-02-17"
  timestamp: Timestamp;   // parsed timestamp from the footnote header
  type: 'ins' | 'del' | 'sub' | 'comment' | 'highlight' | 'image' | string;  // e.g. "sub", "ins", "image"
  status: string;         // e.g. "proposed", "accepted", "rejected"
  reason: string;         // the "reason: ..." value, or empty
  replyCount: number;     // number of thread reply lines
  /** First line index (0-based) of this footnote definition */
  startLine: number;
  /** Last line index (0-based, inclusive) of this footnote definition */
  endLine: number;
  /** Image dimensions from import, format: { widthIn, heightIn } in inches */
  imageDimensions?: { widthIn: number; heightIn: number };
  /** Bag of image-* positioning metadata (e.g. image-float, image-h-anchor, image-wrap) */
  imageMetadata?: Record<string, string>;
}

// Use shared FOOTNOTE_THREAD_REPLY from footnote-patterns.ts
const RE_THREAD_REPLY = FOOTNOTE_THREAD_REPLY;

/**
 * Regex matching a footnote metadata line (indented, key: value).
 * e.g. `    reason: spelling fix`
 */
const RE_FOOTNOTE_META = /^\s+([\w-]+):\s*(.*)/;

/**
 * Parse all footnote definitions from file content.
 * Returns a Map keyed by the footnote ID (e.g. "ct-1").
 */
export function parseFootnotes(content: string): Map<string, FootnoteInfo> {
  const lines = content.split('\n');
  const footnotes = new Map<string, FootnoteInfo>();

  const blockStart = findFootnoteBlockStart(lines);
  for (let i = blockStart; i < lines.length; i++) {
    const match = lines[i].match(FOOTNOTE_DEF_LENIENT);
    if (!match) continue;

    const info: FootnoteInfo = {
      id: match[1],
      author: `@${match[2]}`,
      date: match[3],
      timestamp: parseTimestamp(match[3]),
      type: match[4],
      status: match[5],
      reason: '',
      replyCount: 0,
      startLine: i,
      endLine: i,
    };

    // Scan indented continuation lines
    let j = i + 1;
    while (j < lines.length && (lines[j].match(/^\s+\S/) || lines[j].match(/^\s*$/))) {
      // Skip blank lines that are followed by more indented content of the same footnote
      if (lines[j].match(/^\s*$/)) {
        // Check if the next non-blank line is still indented (part of this footnote)
        let k = j + 1;
        while (k < lines.length && lines[k].match(/^\s*$/)) k++;
        if (k < lines.length && lines[k].match(/^\s+\S/)) {
          j++;
          continue;
        }
        break;
      }

      if (RE_THREAD_REPLY.test(lines[j])) {
        info.replyCount++;
      } else {
        const metaMatch = lines[j].match(RE_FOOTNOTE_META);
        if (metaMatch && metaMatch[1] === 'reason') {
          info.reason = metaMatch[2];
        } else if (metaMatch && metaMatch[1] === 'image-dimensions') {
          const dimMatch = metaMatch[2].match(/^([\d.]+)in\s*x\s*([\d.]+)in$/);
          if (dimMatch) {
            info.imageDimensions = {
              widthIn: parseFloat(dimMatch[1]),
              heightIn: parseFloat(dimMatch[2]),
            };
          }
        } else if (metaMatch && metaMatch[1].startsWith('image-') && metaMatch[1] !== 'image-dimensions') {
          if (!info.imageMetadata) info.imageMetadata = {};
          info.imageMetadata[metaMatch[1]] = metaMatch[2];
        } else if (metaMatch && metaMatch[1] === 'merge-detected') {
          if (!info.imageMetadata) info.imageMetadata = {};
          info.imageMetadata['merge-detected'] = metaMatch[2];
        }
      }
      info.endLine = j;
      j++;
    }

    footnotes.set(info.id, info);
  }

  return footnotes;
}
