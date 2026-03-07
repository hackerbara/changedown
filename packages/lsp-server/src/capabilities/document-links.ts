/**
 * Document Links Capability
 *
 * Makes footnote references clickable: clicking [^ct-N] inline jumps to
 * the [^ct-N]: definition at the bottom, and clicking a definition header
 * jumps back to the inline reference.
 */

import { DocumentLink, Range } from 'vscode-languageserver';
import { offsetToPosition } from '../converters';

/** Matches inline footnote refs like [^ct-1] or [^ct-1.2] */
const INLINE_REF = /\[\^(ct-\d+(?:\.\d+)?)\]/g;

/** Matches footnote definition headers like [^ct-1]: at start of line */
const DEF_HEADER = /^\[\^(ct-\d+(?:\.\d+)?)\]:/gm;

interface RefLocation {
  id: string;
  offset: number;
  length: number;
}

/**
 * Create document links for footnote ref ↔ definition navigation.
 *
 * @param text Full document text
 * @param uri Document URI (used to build same-document fragment links)
 * @returns Array of DocumentLink objects
 */
export function createDocumentLinks(text: string, uri: string): DocumentLink[] {
  const inlineRefs: RefLocation[] = [];
  const definitions: RefLocation[] = [];

  // Collect inline refs (skip those that are definition headers)
  let match: RegExpExecArray | null;
  INLINE_REF.lastIndex = 0;
  while ((match = INLINE_REF.exec(text)) !== null) {
    const offset = match.index;
    // Skip if this is actually a definition header (followed by ':')
    if (text[offset + match[0].length] === ':') continue;
    inlineRefs.push({ id: match[1], offset, length: match[0].length });
  }

  // Collect definition headers
  DEF_HEADER.lastIndex = 0;
  while ((match = DEF_HEADER.exec(text)) !== null) {
    definitions.push({ id: match[1], offset: match.index, length: match[0].length });
  }

  // Build lookup maps
  const defByIds = new Map<string, RefLocation>();
  for (const def of definitions) {
    defByIds.set(def.id, def);
  }

  // First inline ref per ID (for definition → ref back-links)
  const firstRefById = new Map<string, RefLocation>();
  for (const ref of inlineRefs) {
    if (!firstRefById.has(ref.id)) {
      firstRefById.set(ref.id, ref);
    }
  }

  const links: DocumentLink[] = [];

  // Inline ref → definition
  for (const ref of inlineRefs) {
    const def = defByIds.get(ref.id);
    if (!def) continue;

    const refStart = offsetToPosition(text, ref.offset);
    const refEnd = offsetToPosition(text, ref.offset + ref.length);
    const defPos = offsetToPosition(text, def.offset);

    links.push({
      range: Range.create(refStart, refEnd),
      target: `command:changetracks.goToPosition?${encodeURIComponent(JSON.stringify([uri, defPos.line, defPos.character]))}`,
      tooltip: `Go to footnote definition [^${ref.id}]`,
    });
  }

  // Definition header → first inline ref
  for (const def of definitions) {
    const ref = firstRefById.get(def.id);
    if (!ref) continue;

    const defStart = offsetToPosition(text, def.offset);
    const defEnd = offsetToPosition(text, def.offset + def.length);
    const refPos = offsetToPosition(text, ref.offset);

    links.push({
      range: Range.create(defStart, defEnd),
      target: `command:changetracks.goToPosition?${encodeURIComponent(JSON.stringify([uri, refPos.line, refPos.character]))}`,
      tooltip: `Go to inline change [^${def.id}]`,
    });
  }

  return links;
}
