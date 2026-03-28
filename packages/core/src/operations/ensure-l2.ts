import { CriticMarkupParser } from '../parser/parser.js';
import { changeTypeToAbbrev } from '../model/types.js';
import { scanMaxCnId, generateFootnoteDefinition } from './footnote-generator.js';
import { appendFootnote } from '../file-ops.js';

/**
 * Options for ensureL2.
 */
export interface EnsureL2Options {
  /** Author identity for the footnote (without @ prefix). */
  author: string;
  /** Type abbreviation for the footnote: 'ins', 'del', 'sub', 'hig', 'com'. */
  type: string;
  /**
   * If the change already has an assigned cn-ID (is already L2),
   * pass it here to skip promotion and return early.
   */
  existingId?: string;
}

/**
 * Result of ensureL2.
 */
export interface EnsureL2Result {
  /** The (possibly modified) document text. */
  text: string;
  /** The cn-ID of the change (existing or newly assigned). */
  changeId: string;
  /** True if the change was promoted from L0 to L2. */
  promoted: boolean;
}


/**
 * Ensures a CriticMarkup change at the given offset is at Level 2 (has a
 * footnote reference and footnote definition). If the change is already L2,
 * the text is returned unchanged. If it is L0 (bare markup), it is promoted
 * by inserting `[^cn-N]` after the closing delimiter and appending a footnote
 * definition.
 *
 * This is the canonical entry point for L0 auto-promotion, used by all
 * lifecycle operations (review, reply, amend, supersede, resolve).
 *
 * @param text       Full document text
 * @param changeOffset  Character offset that falls within the target change
 * @param opts       Author, type abbreviation, and optional existing ID
 * @returns          The result with (possibly modified) text, changeId, and promoted flag
 */
export function ensureL2(
  text: string,
  changeOffset: number,
  opts: EnsureL2Options,
): EnsureL2Result {
  // Fast path: caller already knows this change has an ID
  if (opts.existingId) {
    return { text, changeId: opts.existingId, promoted: false };
  }

  // Parse the document and find the change containing the offset
  const parser = new CriticMarkupParser();
  const doc = parser.parse(text);
  const changes = doc.getChanges();

  const change = changes.find(
    (c) => c.range.start <= changeOffset && changeOffset < c.range.end,
  );

  if (!change) {
    // No change found at offset -- return unchanged
    return { text, changeId: '', promoted: false };
  }

  // Already L2 (has footnote) -- return unchanged
  if (change.level !== 0) {
    return { text, changeId: change.id, promoted: false };
  }

  // Compute the next cn-ID
  const maxId = scanMaxCnId(text);
  const nextId = `cn-${maxId + 1}`;

  // Determine type abbreviation from parsed change (prefer parsed over opts.type)
  const typeAbbrev = changeTypeToAbbrev(change.type) ?? opts.type;

  // Insert [^cn-N] immediately after the closing delimiter
  const insertPos = change.range.end;
  const withRef =
    text.slice(0, insertPos) +
    `[^${nextId}]` +
    text.slice(insertPos);

  // Generate and append footnote definition
  const footnoteDef = generateFootnoteDefinition(nextId, typeAbbrev, opts.author);
  const result = appendFootnote(withRef, footnoteDef);

  return { text: result, changeId: nextId, promoted: true };
}
