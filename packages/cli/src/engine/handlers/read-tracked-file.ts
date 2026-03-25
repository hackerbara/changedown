import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  initHashline,
  computeSettledText,
  CriticMarkupParser,
  formatTrackedHeader,
  buildViewDocument,
  formatPlainText,
  computeContinuationLines,
  type ThreeZoneViewName,
  type ThreeZoneDocument,
  type ThreeZoneLine,
} from '@changetracks/core';
import { errorResult } from '../shared/error-result.js';
import { optionalStrArg } from '../args.js';
import { ConfigResolver } from '../config-resolver.js';
import { resolveProtocolMode } from '../config.js';
import type { ChangeTracksConfig } from '../../config/index.js';
import { resolveTrackingStatus } from '../scope.js';
import { SessionState, type ViewName } from '../state.js';
import { composeGuide } from '../guide-composer.js';

/** Default number of lines returned when no limit is specified. */
const DEFAULT_LIMIT = 500;
/** Hard ceiling — even explicit requests are capped at this. */
const MAX_LIMIT = 2000;

/**
 * Tool definition for the read_tracked_file MCP tool.
 * Raw JSON Schema — used when registering the tool with the MCP server.
 */
export const readTrackedFileTool = {
  name: 'read_tracked_file',
  description:
    'Read a tracked file with deliberation-aware projection. Default view (review) shows inline metadata annotations at point of contact with a deliberation summary header. Use view=changes for committed text with P/A flags, view=settled for clean text, view=raw for literal file bytes.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      file: {
        type: 'string',
        description: 'Path to the file (absolute or relative to project root)',
      },
      offset: {
        type: 'number',
        description: 'Line number to start reading from (1-indexed, default: 1)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of lines to return (default: 500, max: 2000). Use with offset for pagination.',
      },
      view: {
        type: 'string',
        enum: ['meta', 'review', 'all', 'content', 'raw', 'full', 'settled', 'final', 'committed', 'changes', 'simple'],
        description:
          'Primary views: review (default, agent-optimized with inline annotations), changes (committed text with P/A flags), ' +
          'settled (clean text with all changes applied), raw (literal file bytes). ' +
          'Aliases: meta=review, committed=changes, content=raw, all=review, simple=changes, final=settled.',
      },
      include_meta: {
        type: 'boolean',
        description: 'If true, include change levels line and full tip. Default: false (compact).',
      },
      include_guide: {
        type: 'boolean',
        description: 'If true, include the editing guide regardless of whether it was already shown this session. Use when spawning subagents that need protocol context.',
      },
    },
    required: ['file'],
  },
};

export interface ReadTrackedFileResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Handles a `read_tracked_file` tool call.
 *
 * Reads a file from disk, formats it with hashline coordinates, prepends
 * a tracked header, optionally slices to a line range, and records per-line
 * hashes in session state for staleness detection.
 */
/**
 * Format content with line numbers but no hashes (used when hashline is disabled).
 */
function formatLineNumberedContent(lines: string[], startLine: number): string {
  return lines
    .map((line, i) => {
      const n = startLine + i;
      const pad = n < 10 ? '  ' : n < 100 ? ' ' : '';
      return `${pad}${n}| ${line}`;
    })
    .join('\n');
}

/**
 * Build a "## change levels:" line from parsed changes (participation level 0, 1, or 2 per change).
 */
function formatChangeLevelsLine(content: string): string | null {
  const parser = new CriticMarkupParser();
  const doc = parser.parse(content);
  const changes = doc.getChanges();
  if (changes.length === 0) return null;
  const parts = changes.map((c) => `${c.id}=${c.level}`);
  return `## change levels: ${parts.join(', ')}`;
}

/**
 * Normalize v1 view name aliases to internal view names.
 *
 * V1 user-facing names:  review, changes, settled, raw
 * Popular editor aliases: all, simple, final
 * Internal names:        meta, committed, settled, content
 */
function normalizeView(view: string): string {
  switch (view) {
    case 'review': case 'all': return 'meta';
    case 'changes': case 'simple': return 'committed';
    case 'final': return 'settled';
    case 'raw': case 'full': return 'content';
    default: return view;
  }
}

/**
 * Reverse mapping from internal view name to canonical user-facing view name.
 * Used when recording session state so that downstream consumers always see
 * the four canonical names: review, changes, settled, raw.
 */
function toCanonicalView(internalView: string): ViewName {
  switch (internalView) {
    case 'meta': return 'review';
    case 'committed': return 'changes';
    case 'settled': return 'settled';
    case 'content': case 'full': return 'raw';
    default: return 'review';
  }
}

/**
 * Returns the first-contact guide text if this is the first read for the
 * current protocol mode, or empty string if the guide was already shown.
 */
function maybeComposeGuide(
  state: SessionState,
  config: ChangeTracksConfig,
  explicit = false,
): string {
  if (!explicit && state.isGuideSuppressed()) return '';
  const mode = resolveProtocolMode(config.protocol.mode);
  if (!explicit && state.getGuideShownForMode() === mode) return '';
  state.setGuideShown(mode);
  return '\n\n' + composeGuide(config);
}

/**
 * Compute effective pagination range from offset/limit params.
 * Returns [effectiveStart, effectiveEnd] as 1-indexed inclusive range.
 */
function computeEffectiveRange(
  offset: number,
  requestedLimit: number | undefined,
  totalLines: number,
): { effectiveStart: number; effectiveEnd: number } {
  const effectiveStart = Math.max(1, offset);
  const limit = Math.min(requestedLimit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const effectiveEnd = Math.min(effectiveStart + limit - 1, totalLines);
  return { effectiveStart, effectiveEnd };
}

/**
 * Build an actionable truncation message when output is truncated.
 */
function buildTruncationMessage(
  effectiveStart: number,
  effectiveEnd: number,
  totalLines: number,
): string | null {
  if (effectiveEnd >= totalLines) return null;
  return `\n\n--- showing lines ${effectiveStart}-${effectiveEnd} of ${totalLines} | use offset/limit to paginate ---`;
}

/**
 * Find a safe pagination end that doesn't truncate mid-CriticMarkup block.
 * Uses the `continuesChange` flag set by view builders, which is derived from
 * the parser (handles code blocks, ignores false-positive delimiters in strings).
 */
function findSafePaginationEnd(lines: ThreeZoneLine[], effectiveEnd: number): number {
  let end = effectiveEnd;
  // lines[end] (0-indexed) is the first line AFTER our slice.
  // If it continues a multi-line change, include it.
  while (end < lines.length && lines[end]?.continuesChange) {
    end++;
  }
  return end;
}

/**
 * Fallback for code paths without a ThreeZoneDocument (non-hashline settled/raw).
 * Uses computeContinuationLines from the parser — same correctness guarantees.
 */
function findSafePaginationEndFromText(contentLines: string[], effectiveEnd: number, totalLines: number): number {
  const continuations = computeContinuationLines(contentLines.join('\n'));
  let end = effectiveEnd;
  // effectiveEnd is 1-indexed; continuations uses 0-indexed line numbers.
  // continuations.has(end) checks 0-indexed line `end`, which is 1-indexed line `end+1`
  // — the first line AFTER the included slice.
  while (end < totalLines && continuations.has(end)) {
    end++;
  }
  return end;
}

export async function handleReadTrackedFile(
  args: Record<string, unknown>,
  resolver: ConfigResolver,
  state: SessionState,
): Promise<ReadTrackedFileResult> {
  try {
    // Defensive: ensure hashline WASM is initialized (idempotent). Handles edge cases where
    // the tool is invoked before server startup has finished or from a context that skipped init.
    await initHashline();

    // 1. Extract and validate args (accept snake_case and camelCase)
    const file = optionalStrArg(args, 'file', 'file');
    if (!file) {
      return errorResult('Missing required argument: "file"');
    }

    const offset = (args.offset as number | undefined) ?? 1;
    const requestedLimit = args.limit as number | undefined;
    const requestedView = optionalStrArg(args, 'view', 'view');

    // Validate view parameter before proceeding
    const VALID_VIEWS = new Set([
      'meta', 'content', 'full', 'raw', 'settled', 'committed',
      'review', 'changes', 'all', 'simple', 'final',
    ]);
    if (requestedView !== undefined && !VALID_VIEWS.has(requestedView)) {
      return errorResult(
        `Invalid view: '${requestedView}'. Valid views: review, changes, settled, raw (aliases: meta=review, committed=changes, content=raw, all=review, simple=changes, final=settled).`,
      );
    }

    // Normalize aliases to internal view names, applying view policy
    const includeMeta = args.include_meta === true;
    const includeGuide = args.include_guide === true;

    // 2. Resolve file path
    const filePath = resolver.resolveFilePath(file);
    const { config, projectDir } = await resolver.forFile(filePath);

    // 2b. Apply view policy: determine effective view from config defaults + agent request
    const defaultView = normalizeView(config.policy.default_view ?? 'review');
    const viewPolicy = config.policy.view_policy ?? 'suggest';
    let effectiveView: string;

    if (requestedView === undefined) {
      // No view specified by agent → use project default
      effectiveView = defaultView;
    } else {
      effectiveView = normalizeView(requestedView);
      if (viewPolicy === 'require' && effectiveView !== defaultView) {
        return errorResult(
          `This project requires view "${config.policy.default_view}" (view_policy = "require"). ` +
          `Requested view "${requestedView}" is not allowed. ` +
          `Change view_policy to "suggest" in .changetracks/config.toml to allow view selection.`,
        );
      }
    }

    // 3. Read file from disk
    let fileContent: string;
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult(`File not found or unreadable: ${msg}`);
    }

    // 5. Resolve tracking status for the header
    const trackingStatus = await resolveTrackingStatus(filePath, config, projectDir);

    // 5b. When hashline is disabled, return full-file content with line numbers only (no hashes).
    // Meta view uses the unified pipeline (which computes hashes internally).
    const displayPath = path.relative(projectDir, filePath);
    if (!config.hashline.enabled) {
      // Committed view requires hashline for coordinate-based addressing
      if (effectiveView === 'committed') {
        return errorResult(
          'Committed view requires hashline mode. Enable hashline in .changetracks/config.toml: [hashline] enabled = true'
        );
      }

      // Meta mode: use the unified three-zone pipeline (computes hashes internally)
      if (effectiveView === 'meta') {
        const canonicalView = toCanonicalView(effectiveView) as ThreeZoneViewName;
        const protocolMode = resolveProtocolMode(config.protocol.mode);
        const doc = buildViewDocument(fileContent, canonicalView, {
          filePath: displayPath,
          trackingStatus: trackingStatus.status,
          protocolMode,
          defaultView: 'review',
          viewPolicy: config.policy.view_policy ?? 'suggest',
        });

        const sessionHashes = doc.lines.map(l => ({
          line: l.margin.lineNumber,
          raw: l.sessionHashes?.raw ?? l.margin.hash,
          settled: l.sessionHashes?.settled ?? l.margin.hash,
          committed: l.sessionHashes?.committed,
          settledView: l.sessionHashes?.settledView,
          rawLineNum: l.sessionHashes?.rawLineNum ?? l.rawLineNumber,
        }));
        state.recordAfterRead(filePath, toCanonicalView(effectiveView), sessionHashes, fileContent);

        const totalLines = doc.lines.length;
        const { effectiveStart, effectiveEnd } = computeEffectiveRange(offset, requestedLimit, totalLines);
        const adjustedEnd = findSafePaginationEnd(doc.lines, effectiveEnd);

        const paginatedDoc: ThreeZoneDocument = {
          ...doc,
          lines: doc.lines.slice(effectiveStart - 1, adjustedEnd),
          header: {
            ...doc.header,
            lineRange: { start: effectiveStart, end: adjustedEnd, total: totalLines },
          },
        };

        const metaOutput = formatPlainText(paginatedDoc);
        const guide = maybeComposeGuide(state, config, includeGuide);
        const content: Array<{ type: 'text'; text: string }> = [{ type: 'text', text: metaOutput }];
        const truncation = buildTruncationMessage(effectiveStart, adjustedEnd, totalLines);
        if (truncation) {
          content[content.length - 1].text += truncation;
        }
        if (guide) content.unshift({ type: 'text', text: guide });
        return { content };
      }

      let header = formatTrackedHeader(displayPath, fileContent, trackingStatus.status);
      if (includeMeta) {
        const levelsLine = formatChangeLevelsLine(fileContent);
        if (levelsLine) header = header + '\n' + levelsLine;
      }
      // Add policy mode to header
      header = header.replace(
        /## tracking: (tracked|untracked)/,
        `## policy: ${config.policy.mode} | tracking: $1`,
      );
      let headerWithoutHashlineTip = header.replace(
        /## tip:.*/,
        '## tip: Hashline addressing is disabled. Edits use text matching; re-read for current content if propose_change fails.',
      );
      // Append protocol mode label for non-hashline path
      const nonHashProtocolMode = resolveProtocolMode(config.protocol.mode);
      if (nonHashProtocolMode === 'compact') {
        headerWithoutHashlineTip = headerWithoutHashlineTip.replace(
          /## tip:.*/,
          '## tip: Hashline addressing is disabled but compact mode requires it. Enable in .changetracks/config.toml: [hashline] enabled = true',
        );
      }
      const contentToShow =
        effectiveView === 'settled' ? computeSettledText(fileContent) : fileContent;
      const allContentLines = contentToShow.split('\n');
      const totalContentLines = allContentLines.length;

      // Apply pagination
      const { effectiveStart: effStart, effectiveEnd: effEnd } = computeEffectiveRange(offset, requestedLimit, totalContentLines);
      const adjustedEnd = findSafePaginationEndFromText(allContentLines, effEnd, totalContentLines);
      const slicedLines = allContentLines.slice(effStart - 1, adjustedEnd);

      const lineNumbered = formatLineNumberedContent(slicedLines, effStart);
      const output = `${headerWithoutHashlineTip}\n\n${lineNumbered}`;
      state.recordAfterRead(filePath, toCanonicalView(effectiveView), [], fileContent);
      const guide = maybeComposeGuide(state, config, includeGuide);
      const content: Array<{ type: 'text'; text: string }> = [{ type: 'text', text: output }];
      const truncation = buildTruncationMessage(effStart, adjustedEnd, totalContentLines);
      if (truncation) {
        content[content.length - 1].text += truncation;
      }
      if (guide) content.unshift({ type: 'text', text: guide });
      return { content };
    }

    // 6. Build ThreeZoneDocument via the unified pipeline
    const canonicalView = toCanonicalView(effectiveView) as ThreeZoneViewName;
    const protocolMode = resolveProtocolMode(config.protocol.mode);
    const doc = buildViewDocument(fileContent, canonicalView, {
      filePath: displayPath,
      trackingStatus: trackingStatus.status,
      protocolMode,
      defaultView: 'review',
      viewPolicy: config.policy.view_policy ?? 'suggest',
    });

    // 7. Extract session hashes from the IR for staleness detection
    const sessionHashes = doc.lines.map(l => ({
      line: l.margin.lineNumber,
      raw: l.sessionHashes?.raw ?? l.margin.hash,
      settled: l.sessionHashes?.settled ?? l.margin.hash,
      committed: l.sessionHashes?.committed,
      settledView: l.sessionHashes?.settledView,
      rawLineNum: l.sessionHashes?.rawLineNum ?? l.rawLineNumber,
    }));
    state.recordAfterRead(filePath, canonicalView, sessionHashes, fileContent);

    // 8. Apply pagination by slicing doc.lines
    const totalLines = doc.lines.length;
    const { effectiveStart, effectiveEnd } = computeEffectiveRange(offset, requestedLimit, totalLines);
    const adjustedEnd = findSafePaginationEnd(doc.lines, effectiveEnd);

    const paginatedDoc: ThreeZoneDocument = {
      ...doc,
      lines: doc.lines.slice(effectiveStart - 1, adjustedEnd),
      header: {
        ...doc.header,
        lineRange: { start: effectiveStart, end: adjustedEnd, total: totalLines },
      },
    };

    // 9. Format output via the plain text formatter
    let output = formatPlainText(paginatedDoc);

    // 9b. Inject change levels line when include_meta is requested
    if (includeMeta) {
      const levelsLine = formatChangeLevelsLine(fileContent);
      if (levelsLine) {
        output = output.replace(/^---$/m, `${levelsLine}\n---`);
      }
    }

    const guide = maybeComposeGuide(state, config, includeGuide);
    const content: Array<{ type: 'text'; text: string }> = [{ type: 'text', text: output }];
    const truncation = buildTruncationMessage(effectiveStart, adjustedEnd, totalLines);
    if (truncation) {
      content[content.length - 1].text += truncation;
    }
    if (guide) content.unshift({ type: 'text', text: guide });
    return { content };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}
