import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RunFragment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}

export interface RevisionElement {
  type: 'ins' | 'del';
  author: string;
  date: string;
  runs: RunFragment[];
}

export interface DrawingElement {
  relationshipId: string;
  inline: boolean;
  extent: { widthEmu: number; heightEmu: number };
  horizontalPosition?: { anchor: string; offset?: number; align?: string };
  verticalPosition?: { anchor: string; offset?: number; align?: string };
  wrapType?: string;
  wrapSide?: string;
  behindDocument?: boolean;
  distT?: number;
  distB?: number;
  distL?: number;
  distR?: number;
}

export interface DocxComment {
  id: string;
  author: string;
  date: string;
  text: string;
}

export interface CommentData {
  allComments: Map<string, DocxComment>;
  rangedIds: Set<string>;
  replies: Map<string, string[]>;
}

export interface ExtractedMetadata {
  revisions: RevisionElement[];
  drawings: DrawingElement[];
  relationships: Map<string, string>;
  comments: CommentData;
}

// ─── Parser configs ──────────────────────────────────────────────────────────

const ARRAY_TAGS = [
  'w:ins',
  'w:del',
  'w:r',
  'w:p',
  'w:t',
  'w:delText',
  'w:drawing',
  'w:comment',
  'w:commentRangeStart',
  'w:tbl',
  'w:tr',
  'w:tc',
];

/**
 * Non-ordered parser for comments.xml and document.xml.rels.
 * These don't need document-order preservation (comments keyed by ID,
 * relationships are a flat list).
 */
const PARSER_CONFIG = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name: string) => ARRAY_TAGS.includes(name),
};

/**
 * Order-preserving parser for document.xml.
 * With preserveOrder: true, children become arrays of { tagName: value, ':@': attrs }
 * instead of being grouped by tag name. This preserves the true document order of
 * interleaved elements (e.g. [w:ins, w:del, w:ins] stays in order instead of
 * grouping all w:ins before all w:del).
 */
const ORDERED_PARSER_CONFIG = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: true,
  isArray: (name: string) => ARRAY_TAGS.includes(name),
};

// ─── Ordered-format helpers ──────────────────────────────────────────────────

interface OrderedChild {
  tag: string;
  children: any[];
  attrs: Record<string, any>;
}

/**
 * Extract ordered children from a preserveOrder array.
 * Each element in the array is { tagName: childArray, ':@': { attrs } }.
 */
function getOrderedChildren(container: any[]): OrderedChild[] {
  if (!Array.isArray(container)) return [];
  const result: OrderedChild[] = [];
  for (const entry of container) {
    if (!entry || typeof entry !== 'object') continue;
    const tag = Object.keys(entry).find(k => k !== ':@');
    if (!tag) continue;
    result.push({
      tag,
      children: Array.isArray(entry[tag]) ? entry[tag] : [],
      attrs: entry[':@'] || {},
    });
  }
  return result;
}

/**
 * Find the first child with a given tag in an ordered array.
 * Returns its children array and attrs, or null if not found.
 */
function findChild(container: any[], tag: string): { children: any[]; attrs: Record<string, any> } | null {
  if (!Array.isArray(container)) return null;
  for (const entry of container) {
    if (!entry || typeof entry !== 'object') continue;
    if (tag in entry) {
      return {
        children: Array.isArray(entry[tag]) ? entry[tag] : [],
        attrs: entry[':@'] || {},
      };
    }
  }
  return null;
}

/**
 * Find all children with a given tag in an ordered array.
 */
function findAllChildren(container: any[], tag: string): Array<{ children: any[]; attrs: Record<string, any> }> {
  if (!Array.isArray(container)) return [];
  const result: Array<{ children: any[]; attrs: Record<string, any> }> = [];
  for (const entry of container) {
    if (!entry || typeof entry !== 'object') continue;
    if (tag in entry) {
      result.push({
        children: Array.isArray(entry[tag]) ? entry[tag] : [],
        attrs: entry[':@'] || {},
      });
    }
  }
  return result;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function extractMetadata(
  docxBuffer: Buffer
): Promise<ExtractedMetadata> {
  const zip = await JSZip.loadAsync(docxBuffer);
  const parser = new XMLParser(PARSER_CONFIG);
  const orderedParser = new XMLParser(ORDERED_PARSER_CONFIG);

  const [documentXml, relsXml, commentsXml] = await Promise.all([
    readZipEntry(zip, 'word/document.xml'),
    readZipEntry(zip, 'word/_rels/document.xml.rels'),
    readZipEntry(zip, 'word/comments.xml'),
  ]);

  // document.xml uses the ordered parser to preserve element order
  const parsedDocumentOrdered = documentXml ? orderedParser.parse(documentXml) : null;
  // comments.xml and rels use the non-ordered parser (order doesn't matter)
  const parsedRels = relsXml ? parser.parse(relsXml) : null;
  const parsedComments = commentsXml ? parser.parse(commentsXml) : null;

  return {
    revisions: extractRevisions(parsedDocumentOrdered),
    drawings: extractDrawings(parsedDocumentOrdered),
    relationships: extractRelationships(parsedRels),
    comments: extractCommentData(parsedComments, parsedDocumentOrdered),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function readZipEntry(
  zip: JSZip,
  path: string
): Promise<string | null> {
  const entry = zip.file(path);
  if (!entry) return null;
  return entry.async('string');
}

// ─── Ordered-format body accessor ────────────────────────────────────────────

/**
 * Navigate the preserveOrder root array to find the w:body children.
 * The root is: [ {?xml: ...}, { 'w:document': [ { 'w:body': [...] } ] } ]
 */
function getBodyChildren(parsed: unknown): any[] | null {
  if (!parsed || !Array.isArray(parsed)) return null;
  // Find the w:document entry in the root array
  const docEntry = findChild(parsed as any[], 'w:document');
  if (!docEntry) return null;
  // Find w:body inside w:document's children
  const bodyEntry = findChild(docEntry.children, 'w:body');
  if (!bodyEntry) return null;
  return bodyEntry.children;
}

// ─── Extraction helpers (ordered format) ─────────────────────────────────────

/** @internal Exported for direct unit testing */
export function extractRevisions(parsed: unknown): RevisionElement[] {
  if (!parsed) return [];
  const bodyChildren = getBodyChildren(parsed);
  if (!bodyChildren) return [];

  const result: RevisionElement[] = [];

  walkBlockElements(bodyChildren, (paraChildren: any[], _paraAttrs: Record<string, any>) => {
    collectRevisionsFromParagraph(paraChildren, result);
  });

  return result;
}

/**
 * Recursively walk all block-level elements in an ordered container array,
 * calling onParagraph for every w:p encountered (including those nested in tables).
 * Elements are visited in document order.
 */
function walkBlockElements(
  containerChildren: any[],
  onParagraph: (paraChildren: any[], paraAttrs: Record<string, any>) => void,
): void {
  for (const { tag, children, attrs } of getOrderedChildren(containerChildren)) {
    if (tag === 'w:p') {
      onParagraph(children, attrs);
    } else if (tag === 'w:tbl') {
      walkTable(children, onParagraph);
    }
  }
}

/**
 * Walk a table's rows and cells, recursing into each cell.
 */
function walkTable(
  tblChildren: any[],
  onParagraph: (paraChildren: any[], paraAttrs: Record<string, any>) => void,
): void {
  for (const row of findAllChildren(tblChildren, 'w:tr')) {
    for (const cell of findAllChildren(row.children, 'w:tc')) {
      walkBlockElements(cell.children, onParagraph);
    }
  }
}

function collectRevisionsFromParagraph(paraChildren: any[], result: RevisionElement[]): void {
  for (const { tag, children, attrs } of getOrderedChildren(paraChildren)) {
    if (tag === 'w:ins' || tag === 'w:del') {
      const type: 'ins' | 'del' = tag === 'w:ins' ? 'ins' : 'del';
      const rev = parseRevisionElement(type, children, attrs);
      if (rev !== null) result.push(rev);
    }
  }
}

/**
 * Parse a single w:ins or w:del element into a RevisionElement.
 * Returns null if the element contains no text (e.g. formatting-only rPrChange).
 *
 * In ordered format, the element's children are an array of ordered entries,
 * and attributes (w:author, w:date) are in the attrs object.
 */
function parseRevisionElement(
  type: 'ins' | 'del',
  elementChildren: any[],
  elementAttrs: Record<string, any>,
): RevisionElement | null {
  const author: string = elementAttrs['@_w:author'] ?? '';
  const date: string = elementAttrs['@_w:date'] ?? '';
  const runs: RunFragment[] = [];

  // Find all w:r children in order
  const runEntries = findAllChildren(elementChildren, 'w:r');
  for (const runEntry of runEntries) {
    const runChildren = runEntry.children;

    // Extract run properties from w:rPr
    const rPrEntry = findChild(runChildren, 'w:rPr');
    const rPrChildren = rPrEntry ? rPrEntry.children : [];
    const bold = readBooleanPropOrdered(rPrChildren, 'w:b');
    const italic = readBooleanPropOrdered(rPrChildren, 'w:i');
    const underline = readUnderlinePropOrdered(rPrChildren);
    const strikethrough = readBooleanPropOrdered(rPrChildren, 'w:strike');

    // w:ins uses w:t; w:del uses w:delText
    const textTag = type === 'del' ? 'w:delText' : 'w:t';
    const textEntries = findAllChildren(runChildren, textTag);

    for (const textEntry of textEntries) {
      const text = extractTextFromOrdered(textEntry.children);
      if (text === '') continue;
      const fragment: RunFragment = { text };
      if (bold !== undefined) fragment.bold = bold;
      if (italic !== undefined) fragment.italic = italic;
      if (underline !== undefined) fragment.underline = underline;
      if (strikethrough !== undefined) fragment.strikethrough = strikethrough;
      runs.push(fragment);
    }
  }

  // Skip revision elements with no text content (e.g. pure rPrChange)
  if (runs.length === 0) return null;

  return { type, author, date, runs };
}

/**
 * Extract text content from an ordered w:t or w:delText element's children.
 * In preserveOrder mode, text appears as { '#text': 'value' } entries.
 */
function extractTextFromOrdered(children: any[]): string {
  if (!Array.isArray(children)) return '';
  for (const child of children) {
    if (child && typeof child === 'object' && '#text' in child) {
      return String(child['#text']);
    }
  }
  return '';
}

/**
 * Read a boolean run property (w:b, w:i, w:strike) from ordered rPr children.
 * - Element absent → undefined (inherit from style)
 * - Element present with no @_w:val → true
 * - @_w:val = "false" or "0" → false
 * - @_w:val = anything else → true
 */
function readBooleanPropOrdered(rPrChildren: any[], propName: string): boolean | undefined {
  const entry = findChild(rPrChildren, propName);
  if (!entry) return undefined;

  // Element exists — check for @_w:val in attrs
  const attrVal = entry.attrs['@_w:val'];
  if (attrVal === undefined) return true; // Present with no val attribute
  if (attrVal === 'false' || attrVal === '0' || attrVal === false || attrVal === 0) {
    return false;
  }
  return true;
}

/**
 * Read underline property from ordered rPr children.
 * Underline is on if w:u is present and @_w:val is not "none".
 */
function readUnderlinePropOrdered(rPrChildren: any[]): boolean | undefined {
  const entry = findChild(rPrChildren, 'w:u');
  if (!entry) return undefined;

  const attrVal = entry.attrs['@_w:val'];
  if (attrVal === 'none') return false;
  return true;
}

/** @internal Exported for direct unit testing */
export function extractDrawings(parsed: unknown): DrawingElement[] {
  if (!parsed) return [];
  const bodyChildren = getBodyChildren(parsed);
  if (!bodyChildren) return [];

  const result: DrawingElement[] = [];

  walkBlockElements(bodyChildren, (paraChildren: any[]) => {
    collectDrawingsFromParagraph(paraChildren, result);
  });

  return result;
}

/**
 * Collect all w:drawing elements from a paragraph's ordered children,
 * including those inside w:ins and w:del revision elements.
 * Elements are visited in document order.
 */
function collectDrawingsFromParagraph(paraChildren: any[], result: DrawingElement[]): void {
  for (const { tag, children } of getOrderedChildren(paraChildren)) {
    if (tag === 'w:r') {
      collectDrawingsFromRunOrdered(children, result);
    } else if (tag === 'w:ins' || tag === 'w:del') {
      // Runs nested inside revision elements
      for (const runEntry of findAllChildren(children, 'w:r')) {
        collectDrawingsFromRunOrdered(runEntry.children, result);
      }
    }
  }
}

/**
 * Extract w:drawing elements from a single run's ordered children.
 */
function collectDrawingsFromRunOrdered(runChildren: any[], result: DrawingElement[]): void {
  for (const drawingEntry of findAllChildren(runChildren, 'w:drawing')) {
    const parsed = parseDrawingElementOrdered(drawingEntry.children);
    if (parsed !== null) {
      result.push(parsed);
    }
  }
}

/**
 * Parse a single w:drawing element into a DrawingElement (ordered format).
 * Returns null if a relationship ID cannot be extracted.
 */
function parseDrawingElementOrdered(drawingChildren: any[]): DrawingElement | null {
  const inlineEntry = findChild(drawingChildren, 'wp:inline');
  const anchorEntry = findChild(drawingChildren, 'wp:anchor');

  const containerEntry = inlineEntry ?? anchorEntry;
  if (!containerEntry) return null;

  const isInline = inlineEntry !== null;
  const containerChildren = containerEntry.children;
  const containerAttrs = containerEntry.attrs;

  // Extract relationship ID: a:graphic > a:graphicData > pic:pic > pic:blipFill > a:blip[@r:embed]
  const graphicEntry = findChild(containerChildren, 'a:graphic');
  const graphicDataEntry = graphicEntry ? findChild(graphicEntry.children, 'a:graphicData') : null;
  const picEntry = graphicDataEntry ? findChild(graphicDataEntry.children, 'pic:pic') : null;
  const blipFillEntry = picEntry ? findChild(picEntry.children, 'pic:blipFill') : null;
  const blipEntry = blipFillEntry ? findChild(blipFillEntry.children, 'a:blip') : null;
  const relationshipId: string = blipEntry ? String(blipEntry.attrs['@_r:embed'] ?? '') : '';

  if (!relationshipId) return null;

  // Extract extent (EMU integers)
  const extentEntry = findChild(containerChildren, 'wp:extent');
  const widthEmu = extentEntry ? parseInt(String(extentEntry.attrs['@_cx'] ?? '0'), 10) : 0;
  const heightEmu = extentEntry ? parseInt(String(extentEntry.attrs['@_cy'] ?? '0'), 10) : 0;

  const result: DrawingElement = {
    relationshipId,
    inline: isInline,
    extent: { widthEmu, heightEmu },
  };

  // Distance attributes (on the container element's attrs)
  const distT = containerAttrs['@_distT'];
  const distB = containerAttrs['@_distB'];
  const distL = containerAttrs['@_distL'];
  const distR = containerAttrs['@_distR'];
  if (distT !== undefined) result.distT = parseInt(String(distT), 10);
  if (distB !== undefined) result.distB = parseInt(String(distB), 10);
  if (distL !== undefined) result.distL = parseInt(String(distL), 10);
  if (distR !== undefined) result.distR = parseInt(String(distR), 10);

  // Anchor-only properties
  if (!isInline && anchorEntry) {
    // behindDoc
    const behindDoc = containerAttrs['@_behindDoc'];
    if (behindDoc !== undefined) {
      result.behindDocument = behindDoc === '1' || behindDoc === 'true' || behindDoc === true;
    }

    // Horizontal position
    const posHEntry = findChild(containerChildren, 'wp:positionH');
    if (posHEntry) {
      const hAnchor: string = String(posHEntry.attrs['@_relativeFrom'] ?? '');
      const hPos: { anchor: string; offset?: number; align?: string } = { anchor: hAnchor };
      const posOffsetEntry = findChild(posHEntry.children, 'wp:posOffset');
      if (posOffsetEntry) {
        const offsetText = extractTextFromOrdered(posOffsetEntry.children);
        if (offsetText) {
          hPos.offset = parseInt(offsetText, 10);
        }
      }
      const alignEntry = findChild(posHEntry.children, 'wp:align');
      if (alignEntry) {
        const alignText = extractTextFromOrdered(alignEntry.children);
        if (alignText) {
          hPos.align = alignText;
        }
      }
      result.horizontalPosition = hPos;
    }

    // Vertical position
    const posVEntry = findChild(containerChildren, 'wp:positionV');
    if (posVEntry) {
      const vAnchor: string = String(posVEntry.attrs['@_relativeFrom'] ?? '');
      const vPos: { anchor: string; offset?: number; align?: string } = { anchor: vAnchor };
      const posOffsetEntry = findChild(posVEntry.children, 'wp:posOffset');
      if (posOffsetEntry) {
        const offsetText = extractTextFromOrdered(posOffsetEntry.children);
        if (offsetText) {
          vPos.offset = parseInt(offsetText, 10);
        }
      }
      const alignEntry = findChild(posVEntry.children, 'wp:align');
      if (alignEntry) {
        const alignText = extractTextFromOrdered(alignEntry.children);
        if (alignText) {
          vPos.align = alignText;
        }
      }
      result.verticalPosition = vPos;
    }

    // Wrap type and side
    const wrapTypes = ['wp:wrapNone', 'wp:wrapSquare', 'wp:wrapTight', 'wp:wrapTopAndBottom'] as const;
    for (const wrapKey of wrapTypes) {
      const wrapEntry = findChild(containerChildren, wrapKey);
      if (wrapEntry) {
        result.wrapType = wrapKey.replace('wp:', '');
        const wrapText = wrapEntry.attrs['@_wrapText'];
        if (wrapText !== undefined) {
          result.wrapSide = String(wrapText);
        }
        break;
      }
    }
  }

  return result;
}

function extractRelationships(parsed: any): Map<string, string> {
  const map = new Map<string, string>();
  if (!parsed) return map;

  const rels = parsed['Relationships']?.['Relationship'];
  if (!rels) return map;

  const relArray = Array.isArray(rels) ? rels : [rels];
  for (const rel of relArray) {
    const id = rel['@_Id'];
    const target = rel['@_Target'];
    const type = rel['@_Type'] || '';
    if (id && target && type.includes('/image')) {
      map.set(id, target);
    }
  }
  return map;
}

function extractCommentData(parsedComments: unknown, parsedDocumentOrdered: unknown): CommentData {
  const allComments = new Map<string, DocxComment>();
  const rangedIds = new Set<string>();
  const replies = new Map<string, string[]>();

  // ── 1. Extract comment bodies from word/comments.xml ─────────────────────
  // Uses non-ordered parser — comments are keyed by ID, order doesn't matter
  if (parsedComments) {
    const commentsRoot = (parsedComments as any)?.['w:comments'];
    const commentElements: any[] = toArray(commentsRoot?.['w:comment']);

    for (const comment of commentElements) {
      const id: string = String(comment['@_w:id'] ?? '');
      const author: string = String(comment['@_w:author'] ?? '');
      const date: string = String(comment['@_w:date'] ?? '');

      // Collect all w:t text nodes within the comment's paragraphs/runs
      const texts: string[] = [];
      collectCommentTexts(comment, texts);

      // Mirror old extractor: texts.join(' ').trim()
      const text = texts.join(' ').trim();

      const existing = allComments.get(id);
      if (!existing || (text && !existing.text)) {
        allComments.set(id, { id, author, date, text });
      }
    }
  }

  // ── 2. Extract comment ranges from word/document.xml (ordered format) ────
  if (parsedDocumentOrdered) {
    const bodyChildren = getBodyChildren(parsedDocumentOrdered);
    if (bodyChildren) {
      walkBlockElements(bodyChildren, (paraChildren: any[]) => {
        for (const rangeStart of findAllChildren(paraChildren, 'w:commentRangeStart')) {
          const id: string = String(rangeStart.attrs['@_w:id'] ?? '');
          if (id) rangedIds.add(id);
        }
      });
    }
  }

  // ── 3. Build reply map ────────────────────────────────────────────────────
  // Sort all IDs numerically, then for each ranged comment walk forward
  // until the next ranged comment; any unranged IDs in that gap are replies.
  const sortedRangedIds = [...rangedIds].map(Number).sort((a, b) => a - b);
  const allIds = [...allComments.keys()].map(Number).sort((a, b) => a - b);

  for (const rangedId of sortedRangedIds) {
    const replyIds: string[] = [];
    for (const cid of allIds) {
      if (cid <= rangedId) continue;
      if (rangedIds.has(String(cid))) break; // Hit next ranged comment
      replyIds.push(String(cid));
    }
    if (replyIds.length > 0) {
      replies.set(String(rangedId), replyIds);
    }
  }

  return { allComments, rangedIds, replies };
}

/**
 * Recursively collect all w:t text node values from within a w:comment element.
 * Mirrors the old extractor's `/<w:t[^>]*>([^<]*)<\/w:t>/g` pattern by
 * traversing w:p > w:r > w:t (and any nested structure).
 * NOTE: This operates on non-ordered parsed format (for comments.xml).
 */
function collectCommentTexts(node: any, texts: string[]): void {
  if (!node || typeof node !== 'object') return;

  // If this node has w:t children (as array or single item), collect them
  if ('w:t' in node) {
    const tNodes: any[] = toArray(node['w:t']);
    for (const t of tNodes) {
      const val = extractTextNodeValue(t);
      if (val) texts.push(val);
    }
  }

  // Recurse into common structural elements
  for (const key of ['w:p', 'w:r']) {
    const children: any[] = toArray(node[key]);
    for (const child of children) {
      collectCommentTexts(child, texts);
    }
  }
}

/** Extract text from a w:t or w:delText node (may be a string or {#text, ...}). */
function extractTextNodeValue(node: unknown): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (node && typeof node === 'object') {
    const textObj = node as Record<string, unknown>;
    if ('#text' in textObj) return String(textObj['#text']);
  }
  return '';
}

/** Normalize a value that may be a single item or an array into an array. */
function toArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}
