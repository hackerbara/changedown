/**
 * Level promotion: L0 → L1 (add adjacent comment), L1 → L2 (add footnote).
 */
import { CriticMarkupParser } from '../parser/parser.js';
import { TokenType } from '../parser/tokens.js';
import { nowTimestamp } from '../timestamp.js';

/**
 * Promotes the change at changeIndex from Level 0 to Level 1 by inserting
 * an adjacent comment {>>metadataString<<} immediately after the change's closing delimiter.
 */
export function promoteToLevel1(text: string, changeIndex: number, metadataString: string): string {
  const parser = new CriticMarkupParser();
  const doc = parser.parse(text);
  const changes = doc.getChanges();
  if (changeIndex < 0 || changeIndex >= changes.length) {
    return text;
  }
  const change = changes[changeIndex];
  const insertPos = change.range.end;
  const comment = `{>>${metadataString}<<}`;
  return text.slice(0, insertPos) + comment + text.slice(insertPos);
}

/**
 * Parses L1 comment content into header parts (author, date, type, status).
 */
function parseL1ToHeaderParts(raw: string): { author: string; date: string; type: string; status: string } {
  const fields = raw.split('|').map((f) => f.trim());
  let author = '';
  let date = nowTimestamp().date;
  let type = 'sub';
  let status = 'proposed';
  for (const field of fields) {
    if (!field) continue;
    if (field.startsWith('@')) {
      author = field;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(field)) {
      date = field;
    } else if (['ins', 'del', 'sub', 'highlight', 'comment'].includes(field)) {
      type = field;
    } else if (['proposed', 'accepted', 'rejected', 'approved'].includes(field)) {
      status = field;
    }
  }
  return { author, date, type, status };
}

/**
 * Promotes the change at changeIndex from Level 1 to Level 2: removes the adjacent
 * comment, adds [^changeId] ref, and appends a footnote definition with the parsed fields.
 */
export function promoteToLevel2(text: string, changeIndex: number, changeId: string): string {
  const parser = new CriticMarkupParser();
  const doc = parser.parse(text);
  const changes = doc.getChanges();
  if (changeIndex < 0 || changeIndex >= changes.length) {
    return text;
  }
  const change = changes[changeIndex];
  if (change.level !== 1 || !change.inlineMetadata) {
    return text;
  }
  const markupEnd = text.indexOf(TokenType.CommentOpen, change.range.start);
  if (markupEnd === -1) {
    return text;
  }
  const afterComment = change.range.end;
  const { author, date, type, status } = parseL1ToHeaderParts(change.inlineMetadata.raw);
  const authorPart = author ? `${author} | ` : '';
  const footnoteLine = `\n\n[^${changeId}]: ${authorPart}${date} | ${type} | ${status}`;
  const before = text.slice(0, markupEnd);
  const after = text.slice(afterComment);
  return before + `[^${changeId}]` + after + footnoteLine;
}
