import { basename } from '../shared/basename.js';
import type { PandocAst, PandocBlock, PandocInline } from './pandoc-runner.js';
import type {
  ExtractedMetadata,
  RevisionElement,
  RunFragment,
  DrawingElement,
} from './xml-metadata-extractor.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RevisionEnrichment {
  runs: RunFragment[];
  splitCount: number;
  splitBoundaries?: RevisionElement[];
  mergeDetected?: number;
}

export interface EnrichmentMap {
  getRevisionEnrichment(
    blockPath: number[],
    spanIndex: number
  ): RevisionEnrichment | undefined;
  getImageEnrichment(imageSrc: string): DrawingElement | undefined;
}

// ─── Normalization ────────────────────────────────────────────────────────────

/**
 * Basic normalization: collapse whitespace, trim, apply NFKC.
 */
export function normalizeForCorrelation(text: string): string {
  return text.replace(/\s+/g, ' ').trim().normalize('NFKC');
}

/**
 * Fuzzy normalization: additionally normalize smart quotes, en-dashes,
 * em-dashes, and ellipsis to their ASCII equivalents.
 */
function fuzzyNormalize(text: string): string {
  return normalizeForCorrelation(text)
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")   // smart single quotes
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')   // smart double quotes
    .replace(/\u2013/g, '-')                        // en-dash
    .replace(/\u2014/g, '--')                       // em-dash
    .replace(/\u2026/g, '...');                     // ellipsis
}

// ─── Span key ─────────────────────────────────────────────────────────────────

function spanKey(blockPath: number[], spanIndex: number): string {
  return `${blockPath.join('.')}:${spanIndex}`;
}

// ─── AST text extraction ──────────────────────────────────────────────────────

/**
 * Extract plain text from an array of Pandoc inline elements.
 * Handles Str, Space, SoftBreak, LineBreak, and nested inlines
 * (Strong, Emph, Span, Strikeout, Superscript, Subscript, Code, Link, etc.).
 */
function renderInlineText(inlines: PandocInline[]): string {
  let result = '';
  for (const node of inlines) {
    switch (node.t) {
      case 'Str':
        result += node.c;
        break;
      case 'Space':
        result += ' ';
        break;
      case 'SoftBreak':
        result += '\n';
        break;
      case 'LineBreak':
        result += '\n';
        break;
      case 'Strong':
      case 'Emph':
      case 'Strikeout':
      case 'Superscript':
      case 'Subscript':
      case 'SmallCaps':
        result += renderInlineText(node.c);
        break;
      case 'Code':
        result += node.c[1];
        break;
      case 'Link':
        result += renderInlineText(node.c[1]);
        break;
      case 'Span':
        // Span content is at node.c[1]
        result += renderInlineText(node.c[1]);
        break;
      case 'Quoted':
        result += renderInlineText(node.c[1]);
        break;
      case 'Cite':
        result += renderInlineText(node.c[1]);
        break;
      case 'Math':
        result += node.c[1];
        break;
      case 'RawInline':
        result += node.c[1];
        break;
      default:
        // Image, Note, etc. — skip
        break;
    }
  }
  return result;
}

// ─── AST walking ──────────────────────────────────────────────────────────────

interface SpanInfo {
  blockPath: number[];
  spanIndex: number;
  type: 'ins' | 'del';
  text: string;
}

/**
 * Walk the Pandoc AST, collecting all insertion/deletion spans in document order.
 * Returns an array of SpanInfo with composite keys.
 */
function collectTrackedSpans(ast: PandocAst): SpanInfo[] {
  const spans: SpanInfo[] = [];
  walkBlocks(ast.blocks, [], spans);
  return spans;
}

function walkBlocks(
  blocks: PandocBlock[],
  parentPath: number[],
  spans: SpanInfo[]
): void {
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const blockPath = [...parentPath, i];
    walkBlock(block, blockPath, spans);
  }
}

function walkBlock(
  block: PandocBlock,
  blockPath: number[],
  spans: SpanInfo[]
): void {
  switch (block.t) {
    case 'Para':
    case 'Plain':
      collectSpansFromInlines(block.c, blockPath, spans);
      break;

    case 'Header':
      // Header: c = [level, attr, inlines]
      collectSpansFromInlines(block.c[2], blockPath, spans);
      break;

    case 'Div':
      // Div: c = [attr, blocks]
      walkBlocks(block.c[1], blockPath, spans);
      break;

    case 'BlockQuote':
      // BlockQuote: c = blocks
      walkBlocks(block.c, blockPath, spans);
      break;

    case 'BulletList':
      // BulletList: c = [[blocks], [blocks], ...]
      for (let i = 0; i < block.c.length; i++) {
        walkBlocks(block.c[i], [...blockPath, i], spans);
      }
      break;

    case 'OrderedList':
      // OrderedList: c = [listAttrs, [[blocks], [blocks], ...]]
      for (let i = 0; i < block.c[1].length; i++) {
        walkBlocks(block.c[1][i], [...blockPath, i], spans);
      }
      break;

    case 'Table':
      walkTable(block, blockPath, spans);
      break;

    case 'LineBlock':
      // LineBlock: c = [[inlines], [inlines], ...]
      for (let i = 0; i < block.c.length; i++) {
        collectSpansFromInlines(block.c[i], [...blockPath, i], spans);
      }
      break;

    default:
      // CodeBlock, HorizontalRule, RawBlock, Null — no inline content
      break;
  }
}

function walkTable(
  block: PandocBlock,
  blockPath: number[],
  spans: SpanInfo[]
): void {
  const c = block.c;
  // c[3] = table head, c[4] = table bodies
  const tableHead = c[3];
  const headRows = tableHead[1] || [];

  const tableBodies = c[4];

  let rowIdx = 0;
  for (const row of headRows) {
    const cells = row[1];
    for (let cellIdx = 0; cellIdx < cells.length; cellIdx++) {
      const cellBlocks = cells[cellIdx][4];
      walkBlocks(cellBlocks, [...blockPath, rowIdx, cellIdx], spans);
    }
    rowIdx++;
  }

  for (const body of tableBodies) {
    const bodyRows = body[3] || [];
    for (const row of bodyRows) {
      const cells = row[1];
      for (let cellIdx = 0; cellIdx < cells.length; cellIdx++) {
        const cellBlocks = cells[cellIdx][4];
        walkBlocks(cellBlocks, [...blockPath, rowIdx, cellIdx], spans);
      }
      rowIdx++;
    }
  }
}

/**
 * Scan an array of inline elements for ins/del Spans, recording each one.
 * `spanIndex` counts only tracked-change spans within this block.
 */
function collectSpansFromInlines(
  inlines: PandocInline[],
  blockPath: number[],
  spans: SpanInfo[]
): void {
  let spanIndex = 0;
  for (const node of inlines) {
    if (node.t === 'Span') {
      const classes: string[] = node.c[0][1];
      if (classes.includes('insertion') || classes.includes('deletion')) {
        const type: 'ins' | 'del' = classes.includes('insertion')
          ? 'ins'
          : 'del';
        const content: PandocInline[] = node.c[1];
        const text = renderInlineText(content);
        spans.push({ blockPath, spanIndex, type, text });
        spanIndex++;
      }
    }
  }
}

// ─── Image correlation ────────────────────────────────────────────────────────

/**
 * Collect Image node `src` values from the Pandoc AST in document order.
 */
function collectImageSources(ast: PandocAst): string[] {
  const sources: string[] = [];
  collectImageSourcesFromBlocks(ast.blocks, sources);
  return sources;
}

function collectImageSourcesFromBlocks(
  blocks: PandocBlock[],
  sources: string[]
): void {
  for (const block of blocks) {
    collectImageSourcesFromBlock(block, sources);
  }
}

function collectImageSourcesFromBlock(
  block: PandocBlock,
  sources: string[]
): void {
  switch (block.t) {
    case 'Para':
    case 'Plain':
      collectImageSourcesFromInlines(block.c, sources);
      break;

    case 'Header':
      collectImageSourcesFromInlines(block.c[2], sources);
      break;

    case 'Div':
      collectImageSourcesFromBlocks(block.c[1], sources);
      break;

    case 'BlockQuote':
      collectImageSourcesFromBlocks(block.c, sources);
      break;

    case 'BulletList':
      for (const item of block.c) {
        collectImageSourcesFromBlocks(item, sources);
      }
      break;

    case 'OrderedList':
      for (const item of block.c[1]) {
        collectImageSourcesFromBlocks(item, sources);
      }
      break;

    case 'Table': {
      const c = block.c;
      const tableHead = c[3];
      const headRows = tableHead[1] || [];
      const tableBodies = c[4];

      for (const row of headRows) {
        const cells = row[1];
        for (const cell of cells) {
          collectImageSourcesFromBlocks(cell[4], sources);
        }
      }
      for (const body of tableBodies) {
        const bodyRows = body[3] || [];
        for (const row of bodyRows) {
          const cells = row[1];
          for (const cell of cells) {
            collectImageSourcesFromBlocks(cell[4], sources);
          }
        }
      }
      break;
    }

    case 'LineBlock':
      for (const line of block.c) {
        collectImageSourcesFromInlines(line, sources);
      }
      break;

    default:
      break;
  }
}

function collectImageSourcesFromInlines(
  inlines: PandocInline[],
  sources: string[]
): void {
  for (const node of inlines) {
    if (node.t === 'Image') {
      // Image: c = [attr, inlines, [src, title]]
      sources.push(node.c[2][0]);
    } else if (node.t === 'Span') {
      collectImageSourcesFromInlines(node.c[1], sources);
    } else if (
      node.t === 'Strong' ||
      node.t === 'Emph' ||
      node.t === 'Strikeout' ||
      node.t === 'Superscript' ||
      node.t === 'Subscript' ||
      node.t === 'SmallCaps'
    ) {
      collectImageSourcesFromInlines(node.c, sources);
    } else if (node.t === 'Link') {
      collectImageSourcesFromInlines(node.c[1], sources);
    } else if (node.t === 'Quoted' || node.t === 'Cite') {
      collectImageSourcesFromInlines(node.c[1], sources);
    }
  }
}

/**
 * Build an image enrichment map using a two-key strategy:
 * 1. Primary — relationship chain: drawing.relationshipId → relationships → media filename
 * 2. Verification — document order: nth DrawingElement should match nth Pandoc Image
 *
 * If both agree: high confidence enrichment.
 * If they disagree: relationship chain wins (definitive per OOXML spec), warning logged.
 * If no filename match: skip enrichment.
 */
function buildImageMap(
  ast: PandocAst,
  metadata: ExtractedMetadata
): Map<string, DrawingElement> {
  const map = new Map<string, DrawingElement>();

  // Resolve each drawing's filename via the relationship chain
  const resolvedFilenames: (string | undefined)[] = [];
  for (const drawing of metadata.drawings) {
    const target = metadata.relationships.get(drawing.relationshipId);
    if (target) {
      const filename = basename(target);
      resolvedFilenames.push(filename);
      map.set(filename, drawing);
    } else {
      resolvedFilenames.push(undefined);
    }
  }

  // Collect Image sources from the AST in document order for verification
  const astImageSources = collectImageSources(ast);

  // Document-order verification: compare nth drawing with nth AST image
  const verificationCount = Math.min(resolvedFilenames.length, astImageSources.length);
  for (let i = 0; i < verificationCount; i++) {
    const drawingFilename = resolvedFilenames[i];
    if (!drawingFilename) continue;

    const astBasename = basename(astImageSources[i]);
    if (drawingFilename !== astBasename) {
      console.warn(
        `[correlation-engine] Image document-order mismatch at index ${i}: ` +
        `relationship chain resolved "${drawingFilename}" but AST has "${astBasename}". ` +
        `Trusting relationship chain.`
      );
    }
  }

  return map;
}

// ─── Revision correlation ─────────────────────────────────────────────────────

function correlateRevisions(
  pandocSpans: SpanInfo[],
  revisions: RevisionElement[]
): Map<string, RevisionEnrichment> {
  const enrichments = new Map<string, RevisionEnrichment>();
  let xmlIndex = 0;

  for (const span of pandocSpans) {
    if (xmlIndex >= revisions.length) break;

    const pandocText = normalizeForCorrelation(span.text);
    const xmlEl = revisions[xmlIndex];
    const xmlText = normalizeForCorrelation(
      xmlEl.runs.map((r) => r.text).join('')
    );

    const key = spanKey(span.blockPath, span.spanIndex);

    if (pandocText === xmlText) {
      // 1:1 match
      enrichments.set(key, {
        runs: xmlEl.runs,
        splitCount: 1,
      });
      xmlIndex++;
    } else if (pandocText.startsWith(xmlText) && xmlText.length > 0) {
      // Pandoc may have merged adjacent same-author revisions.
      // Try accumulating consecutive XML revisions.
      const accumulatedRevisions: RevisionElement[] = [xmlEl];
      let accumulatedText = xmlText;
      let consumed = 1;

      while (xmlIndex + consumed < revisions.length) {
        const nextXml = revisions[xmlIndex + consumed];
        // Only merge same-author, same-type revisions
        if (nextXml.author !== xmlEl.author || nextXml.type !== xmlEl.type) {
          break;
        }
        const nextText = normalizeForCorrelation(
          nextXml.runs.map((r) => r.text).join('')
        );
        accumulatedText += nextText;
        accumulatedRevisions.push(nextXml);
        consumed++;

        if (accumulatedText === pandocText) {
          break;
        }
        if (!pandocText.startsWith(accumulatedText)) {
          break;
        }
      }

      if (accumulatedText === pandocText) {
        // Exact concatenation match
        const allRuns: RunFragment[] = [];
        for (const rev of accumulatedRevisions) {
          allRuns.push(...rev.runs);
        }
        enrichments.set(key, {
          runs: allRuns,
          splitCount: accumulatedRevisions.length,
          splitBoundaries: accumulatedRevisions,
        });
        xmlIndex += consumed;
      } else {
        // Try fuzzy alignment
        const fuzzyPandoc = fuzzyNormalize(span.text);
        const fuzzyAccumulated = fuzzyNormalize(
          accumulatedRevisions.map((r) => r.runs.map((f) => f.text).join('')).join('')
        );

        if (fuzzyPandoc === fuzzyAccumulated) {
          const allRuns: RunFragment[] = [];
          for (const rev of accumulatedRevisions) {
            allRuns.push(...rev.runs);
          }
          enrichments.set(key, {
            runs: allRuns,
            splitCount: accumulatedRevisions.length,
            splitBoundaries: accumulatedRevisions,
          });
          xmlIndex += consumed;
        } else {
          // Store with mergeDetected diagnostic
          enrichments.set(key, {
            runs: xmlEl.runs,
            splitCount: 1,
            mergeDetected: consumed,
          });
          xmlIndex++;
        }
      }
    } else {
      // Try fuzzy 1:1 match before giving up
      const fuzzyPandoc = fuzzyNormalize(span.text);
      const fuzzyXml = fuzzyNormalize(xmlEl.runs.map((r) => r.text).join(''));

      if (fuzzyPandoc === fuzzyXml) {
        enrichments.set(key, {
          runs: xmlEl.runs,
          splitCount: 1,
        });
        xmlIndex++;
      } else {
        // No match — skip this XML revision, no enrichment for this span
        xmlIndex++;
      }
    }
  }

  return enrichments;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function buildEnrichmentMap(
  ast: PandocAst,
  metadata: ExtractedMetadata
): EnrichmentMap {
  // 1. Collect tracked-change spans from AST in document order
  const pandocSpans = collectTrackedSpans(ast);

  // 2. Correlate with XML revisions
  const revisionEnrichments = correlateRevisions(pandocSpans, metadata.revisions);

  // 3. Build image map (with document-order verification)
  const imageMap = buildImageMap(ast, metadata);

  return {
    getRevisionEnrichment(
      blockPath: number[],
      spanIndex: number
    ): RevisionEnrichment | undefined {
      return revisionEnrichments.get(spanKey(blockPath, spanIndex));
    },

    getImageEnrichment(imageSrc: string): DrawingElement | undefined {
      const filename = basename(imageSrc);
      return imageMap.get(filename);
    },
  };
}
