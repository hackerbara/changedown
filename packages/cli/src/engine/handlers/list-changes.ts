import * as fs from 'node:fs/promises';
import { parseForFormat, ChangeType, ChangeNode } from '@changedown/core';
import type { VirtualDocument } from '@changedown/core';
import { errorResult } from '../shared/error-result.js';
import { isFileInScope } from '../config.js';
import { ConfigResolver } from '../config-resolver.js';
import { SessionState } from '../state.js';
import { findFootnoteBlock, parseFootnoteHeader } from '@changedown/core';
import { toRelativePath } from '../path-utils.js';

/**
 * Tool definition for the list_changes MCP tool.
 * Returns a lightweight inventory of all changes in a file with metadata.
 * Supports filtering by status, detail levels, and batch change ID lookup.
 */
export const listChangesTool = {
  name: 'list_changes',
  description:
    'List tracked changes in a file with configurable detail levels. ' +
    'Returns change_id, type, status, author, line, preview. Filters by status. ' +
    'detail=context adds surrounding lines; detail=full adds threads and group info. ' +
    'Fetch specific changes via change_id/change_ids (replaces get_change).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      file: {
        type: 'string',
        description: 'Path to the file (absolute or relative to project root)',
      },
      status: {
        type: 'string',
        enum: ['proposed', 'accepted', 'rejected'],
        description: 'Filter changes by status. If omitted, all changes are returned.',
      },
      detail: {
        type: 'string',
        enum: ['summary', 'context', 'full'],
        description:
          "Detail level: 'summary' (default — lightweight metadata only), " +
          "'context' (adds surrounding lines and markup), " +
          "'full' (adds discussion threads, group info, revision history).",
      },
      context_lines: {
        type: 'number',
        description: 'Number of surrounding lines for context/full detail. Default: 3.',
      },
      change_id: {
        type: 'string',
        description: "Single change ID to fetch details for (e.g., 'cn-7'). Implies detail=full if not set.",
      },
      change_ids: {
        type: 'array',
        items: { type: 'string' },
        description: "Batch of change IDs to fetch details for (e.g., ['cn-5', 'cn-7']). Implies detail=full if not set.",
      },
    },
    required: ['file'],
  },
};

export interface ChangeSummary {
  change_id: string;
  type: 'ins' | 'del' | 'sub' | 'highlight' | 'comment';
  status: string;
  author: string;
  line: number;
  preview: string;
  level: 0 | 1 | 2;
  anchored: boolean;
  consumed_by?: string;
}

export interface ChangeContext extends ChangeSummary {
  markup: string;
  original_text: string | null;
  modified_text: string | null;
  context_before: string[];
  context_after: string[];
}

export interface ChangeFullDetail extends ChangeContext {
  footnote: {
    author: string;
    date: string;
    reasoning: string | null;
    discussion_count: number;
    approvals: string[];
    rejections: string[];
    request_changes: string[];
  };
  participants: string[];
  group: {
    parent_id: string;
    description: string | null;
    siblings: string[];
  } | null;
}

export interface ListChangesResponse {
  file: string;
  total_count: number;
  filtered_count: number;
  changes: Array<ChangeSummary | ChangeContext | ChangeFullDetail>;
}

export interface ListChangesResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

import { TYPE_MAP, offsetToLineNumber } from './change-utils.js';

const MAX_PREVIEW_LENGTH = 80;

function buildPreview(change: { type: ChangeType; originalText?: string; modifiedText?: string }): string {
  let preview = '';
  switch (change.type) {
    case ChangeType.Substitution:
      preview = `${change.originalText ?? ''}~>${change.modifiedText ?? ''}`;
      break;
    case ChangeType.Insertion:
      preview = change.modifiedText ?? '';
      break;
    case ChangeType.Deletion:
      preview = change.originalText ?? '';
      break;
    case ChangeType.Highlight:
      preview = change.originalText ?? change.modifiedText ?? '';
      break;
    case ChangeType.Comment:
      preview = change.originalText ?? change.modifiedText ?? '';
      break;
  }
  if (preview.length > MAX_PREVIEW_LENGTH) {
    preview = preview.slice(0, MAX_PREVIEW_LENGTH - 3) + '...';
  }
  return preview;
}

function buildContextEntry(
  change: ChangeNode,
  fileContent: string,
  lines: string[],
  summary: ChangeSummary,
  contextN: number,
): ChangeContext {
  const startLine = offsetToLineNumber(fileContent, change.range.start);
  const endLine = offsetToLineNumber(fileContent, change.range.end);
  const markup = fileContent.slice(change.range.start, change.range.end);
  const contextBefore = lines.slice(Math.max(0, startLine - 1 - contextN), startLine - 1);
  const contextAfter = lines.slice(endLine, Math.min(lines.length, endLine + contextN));

  return {
    ...summary,
    markup,
    original_text: change.type === ChangeType.Insertion ? null : (change.originalText ?? null),
    modified_text: change.type === ChangeType.Deletion ? null : (change.modifiedText ?? null),
    context_before: contextBefore,
    context_after: contextAfter,
  };
}

function buildFullDetailEntry(
  change: ChangeNode,
  fileContent: string,
  lines: string[],
  doc: VirtualDocument,
  summary: ChangeSummary,
  contextN: number,
): ChangeFullDetail {
  const ctx = buildContextEntry(change, fileContent, lines, summary, contextN);

  let footnoteAuthor = '';
  let footnoteDate = '';
  let reasoning: string | null = null;
  let discussionCount = 0;
  const approvals: string[] = [];
  const rejections: string[] = [];
  const requestChanges: string[] = [];

  const block = findFootnoteBlock(lines, change.id);
  if (block) {
    const header = parseFootnoteHeader(lines[block.headerLine]);
    if (header) {
      footnoteAuthor = header.author;
      footnoteDate = header.date;
    }
    const meta = change.metadata;
    if (meta?.discussion?.length) {
      discussionCount = meta.discussion.length;
      reasoning = meta.discussion[0].text ?? null;
    }
    meta?.approvals?.forEach((a) => approvals.push(a.author));
    meta?.rejections?.forEach((a) => rejections.push(a.author));
    meta?.requestChanges?.forEach((a) => requestChanges.push(a.author));
  }

  const participantsSet = new Set<string>();
  if (change.metadata?.author) participantsSet.add(change.metadata.author);
  change.metadata?.discussion?.forEach((d) => participantsSet.add(d.author));
  change.metadata?.approvals?.forEach((a) => participantsSet.add(a.author));
  change.metadata?.rejections?.forEach((a) => participantsSet.add(a.author));
  change.metadata?.requestChanges?.forEach((a) => participantsSet.add(a.author));

  const changeId = change.id;
  const dotIndex = changeId.lastIndexOf('.');
  let group: ChangeFullDetail['group'] = null;
  if (dotIndex > 0) {
    const parentId = changeId.slice(0, dotIndex);
    const parentBlock = findFootnoteBlock(lines, parentId);
    let description: string | null = null;
    if (parentBlock) {
      for (let i = parentBlock.headerLine + 1; i <= parentBlock.blockEnd; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('reason:') || trimmed.startsWith('context:')) continue;
        if (trimmed && !trimmed.startsWith('approved:') && !trimmed.startsWith('rejected:') && !trimmed.startsWith('request-changes:')) {
          description = trimmed;
          break;
        }
      }
    }
    const siblings = doc
      .getChanges()
      .filter((c) => (c.groupId === parentId || c.id.startsWith(parentId + '.')) && c.id !== parentId)
      .map((c) => c.id);
    group = { parent_id: parentId, description, siblings };
  }

  return {
    ...ctx,
    footnote: {
      author: footnoteAuthor,
      date: footnoteDate,
      reasoning,
      discussion_count: discussionCount,
      approvals,
      rejections,
      request_changes: requestChanges,
    },
    participants: [...participantsSet],
    group,
  };
}

export async function handleListChanges(
  args: Record<string, unknown>,
  resolver: ConfigResolver,
  _state: SessionState,
): Promise<ListChangesResult> {
  try {
    const fileArg = args.file as string | undefined;
    const statusFilter = args.status as string | undefined;
    const changeIdArg = args.change_id as string | undefined;
    const changeIdsArg = args.change_ids as string[] | undefined;
    const hasIds = !!(changeIdArg || changeIdsArg);
    const detail = (args.detail as string | undefined) ?? (hasIds ? 'full' : 'summary');
    const contextLines = ((args.context_lines as number | undefined) ?? 3);

    if (fileArg === undefined || fileArg === '') {
      return errorResult('Missing required argument: "file".');
    }

    const filePath = resolver.resolveFilePath(fileArg);
    const { config, projectDir } = await resolver.forFile(filePath);

    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) {
        return errorResult(`Not a file: "${filePath}"`);
      }
    } catch {
      return errorResult(`File not found or unreadable: "${filePath}"`);
    }

    if (!isFileInScope(filePath, config, projectDir)) {
      return errorResult(
        `File is not in scope for tracking: "${filePath}". Check .changedown/config.toml include/exclude patterns.`
      );
    }

    let fileContent: string;
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch {
      return errorResult(`Could not read file: "${filePath}"`);
    }

    const doc = parseForFormat(fileContent);
    const allChanges = doc.getChanges();
    const lines = fileContent.split('\n');
    const contextN = Math.max(0, contextLines);

    // If specific IDs requested, filter to those changes
    if (hasIds) {
      const targetIds = new Set<string>();
      if (changeIdArg) targetIds.add(changeIdArg);
      if (changeIdsArg) changeIdsArg.forEach((id) => targetIds.add(id));

      const changeMap = new Map<string, ChangeNode>();
      for (const c of allChanges) {
        if (targetIds.has(c.id)) changeMap.set(c.id, c);
      }

      const results: Array<ChangeSummary | ChangeContext | ChangeFullDetail | { change_id: string; error: string }> = [];
      for (const id of targetIds) {
        const change = changeMap.get(id);
        if (!change) {
          // Check if settled (footnote-only)
          const settledBlock = findFootnoteBlock(lines, id);
          if (settledBlock) {
            const header = parseFootnoteHeader(settledBlock.headerContent);
            results.push({
              change_id: id,
              error: `Change settled (status: ${header?.status ?? 'unknown'})`,
            });
          } else {
            results.push({ change_id: id, error: 'Change not found' });
          }
          continue;
        }
        const summary = buildSummaryEntry(change, fileContent, lines);
        results.push(buildDetailForLevel(detail, change, fileContent, lines, doc, summary, contextN));
      }

      const response = {
        file: toRelativePath(projectDir, filePath),
        total_count: allChanges.length,
        filtered_count: results.length,
        changes: results,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(response) }],
      };
    }

    // Standard list mode
    const entries: Array<ChangeSummary | ChangeContext | ChangeFullDetail> = [];

    for (const change of allChanges) {
      const summary = buildSummaryEntry(change, fileContent, lines);
      entries.push(buildDetailForLevel(detail, change, fileContent, lines, doc, summary, contextN));
    }

    const totalCount = entries.length;
    const filtered = statusFilter
      ? entries.filter((s) => s.status === statusFilter)
      : entries;

    const response: ListChangesResponse = {
      file: toRelativePath(projectDir, filePath),
      total_count: totalCount,
      filtered_count: filtered.length,
      changes: filtered,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(response) }],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}

function buildSummaryEntry(
  change: ChangeNode,
  fileContent: string,
  lines: string[],
): ChangeSummary {
  const typeStr = TYPE_MAP[change.type];
  const lineNumber = offsetToLineNumber(fileContent, change.range.start);
  let author = '';
  let status = change.status.toLowerCase();

  if (change.id) {
    const block = findFootnoteBlock(lines, change.id);
    if (block) {
      const header = parseFootnoteHeader(block.headerContent);
      if (header) {
        author = header.author;
        status = header.status;
      }
    }
  }

  return {
    change_id: change.id,
    type: typeStr,
    status,
    author,
    line: lineNumber,
    preview: buildPreview(change),
    level: change.level,
    anchored: change.anchored,
    ...(change.consumedBy ? { consumed_by: change.consumedBy } : {}),
  };
}

function buildDetailForLevel(
  detail: string,
  change: ChangeNode,
  fileContent: string,
  lines: string[],
  doc: VirtualDocument,
  summary: ChangeSummary,
  contextN: number,
): ChangeSummary | ChangeContext | ChangeFullDetail {
  switch (detail) {
    case 'context':
      return buildContextEntry(change, fileContent, lines, summary, contextN);
    case 'full':
      return buildFullDetailEntry(change, fileContent, lines, doc, summary, contextN);
    default:
      return summary;
  }
}

