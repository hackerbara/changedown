import { isL3Format } from './footnote-patterns.js';
import { CriticMarkupParser, type ParseOptions } from './parser/parser.js';
import { FootnoteNativeParser } from './parser/footnote-native-parser.js';
import type { VirtualDocument } from './model/document.js';
import { findFootnoteBlock } from './footnote-utils.js';
import { parseOp } from './op-parser.js';

const l2Parser = new CriticMarkupParser();
const l3Parser = new FootnoteNativeParser();

/**
 * Format-aware document parser. Detects L2 vs L3 and routes to the correct
 * parser. Module-level singletons avoid per-call parser allocation.
 *
 * Use this instead of `new CriticMarkupParser()` whenever the input text
 * could be either L2 (inline CriticMarkup) or L3 (footnote-native).
 *
 * Pass `{ skipCodeBlocks: false }` for settlement operations that need to
 * find CriticMarkup inside code blocks.
 */
export function parseForFormat(text: string, options?: ParseOptions): VirtualDocument {
  return isL3Format(text) ? l3Parser.parse(text) : l2Parser.parse(text, options);
}

/**
 * Remove entire footnote definition blocks for the given change IDs.
 * Used during full settlement of L3 text.
 *
 * Finds all blocks first, sorts by descending line number, then splices —
 * so the result is correct regardless of the order changeIds are provided.
 */
export function stripFootnoteBlocks(text: string, changeIds: string[]): string {
  const lines = text.split('\n');
  const blocks = changeIds
    .map(id => findFootnoteBlock(lines, id))
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .sort((a, b) => b.headerLine - a.headerLine); // bottom-to-top
  for (const block of blocks) {
    lines.splice(block.headerLine, block.blockEnd - block.headerLine + 1);
  }
  return lines.join('\n');
}

/**
 * @deprecated ADR-C §2 requires decided changes retain full edit-op lines.
 * This function destroys them. Do not use. Will be removed during vocabulary rename.
 */
export function neutralizeEditOpLines(text: string, changeIds: string[]): string {
  const lines = text.split('\n');
  const editOpRe = /^\s{4}\d+:[0-9a-fA-F]{2,}\s+(.*)/;
  const idSet = new Set(changeIds);

  for (const id of idSet) {
    const block = findFootnoteBlock(lines, id);
    if (!block) continue;
    for (let i = block.headerLine + 1; i <= block.blockEnd; i++) {
      const m = lines[i].match(editOpRe);
      if (m) {
        // Use parseOp to extract content — handles all CriticMarkup types correctly
        const opStr = m[1];
        let content: string;
        try {
          const parsed = parseOp(opStr);
          if (parsed.type === 'sub') {
            content = `${parsed.oldText} -> ${parsed.newText}`;
          } else {
            content = parsed.oldText || parsed.newText;
          }
        } catch {
          // Contextual format (e.g. "Protocol {++o++}verview") — extract inline
          content = opStr.replace(/\{\+\+|\+\+\}|\{--|--\}|\{~~|~~\}|\{==|==\}|\{>>|<<\}/g, '').trim();
        }
        lines[i] = `    settled: "${content}"`;
        break;
      }
    }
  }

  return lines.join('\n');
}

/**
 * @deprecated ADR-C §2 requires decided changes retain full edit-op lines.
 * Use of neutralizeEditOpLines is prohibited. Will be removed during vocabulary rename.
 */
export function neutralizeEditOpLine(text: string, changeId: string): string {
  return neutralizeEditOpLines(text, [changeId]);
}
