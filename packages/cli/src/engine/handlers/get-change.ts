import * as fs from 'node:fs/promises';
import { CriticMarkupParser, ChangeType } from '@changedown/core';
import { optionalStrArg } from '../args.js';
import { isFileInScope } from '../config.js';
import { ConfigResolver } from '../config-resolver.js';
import { findFootnoteBlock, parseFootnoteHeader } from '@changedown/core';
import { toRelativePath } from '../path-utils.js';

/**
 * Tool definition for the get_change MCP tool (backward-compat alias).
 *
 * As of the friction-report-response work, get_change is no longer in the
 * listed tool surface (6 tools). Agents use list_changes with change_id +
 * detail=full instead. This handler is kept as-is (NOT delegating to
 * handleListChanges) because the response shapes differ: GetChangeResponse
 * uses an `inline` wrapper object, supports `include_raw_footnote`, and
 * returns structured CHANGE_SETTLED error codes — none of which are in
 * ChangeFullDetail. Keeping the original handler preserves backward compat
 * without reshaping overhead.
 */
export const getChangeTool = {
  name: 'get_change',
  description:
    'Get full details of a tracked change: inline context, footnote metadata, discussion thread, group info, and revision history. ' +
    'If the change was settled (compacted), returns CHANGE_SETTLED error with the change\'s final status from footnotes.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      file: {
        type: 'string',
        description: 'Path to the file (absolute or relative to project root)',
      },
      change_id: {
        type: 'string',
        description: "The change ID to look up (e.g., 'cn-7' or 'cn-7.2')",
      },
      context_lines: {
        type: 'number',
        description: 'Number of lines of surrounding context around the inline markup. Default: 3.',
      },
      include_raw_footnote: {
        type: 'boolean',
        description: 'If true, include full footnote block in footnote.raw_text. Default: false (compact).',
      },
    },
    required: ['file', 'change_id'],
  },
};

export interface GetChangeResponse {
  change_id: string;
  file: string;
  type: 'ins' | 'del' | 'sub' | 'highlight' | 'comment';
  status: 'proposed' | 'accepted' | 'rejected';

  inline: {
    line_number: number;
    end_line_number: number;
    markup: string;
    original_text: string | null;
    modified_text: string | null;
    context_before: string[];
    context_after: string[];
  };

  footnote: {
    author: string;
    date: string;
    raw_text?: string;
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

export interface GetChangeResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

import { TYPE_MAP, offsetToLineNumber } from './change-utils.js';

function buildGroupInfo(
  doc: ReturnType<CriticMarkupParser['parse']>,
  lines: string[],
  parentId: string
): GetChangeResponse['group'] {
  const parentBlock = findFootnoteBlock(lines, parentId);
  let description: string | null = null;
  if (parentBlock) {
    // First discussion comment line (reasoning) as group description
    for (let i = parentBlock.headerLine + 1; i <= parentBlock.blockEnd; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('reason:') || trimmed.startsWith('context:')) continue;
      if (trimmed && !trimmed.startsWith('approved:') && !trimmed.startsWith('rejected:') && !trimmed.startsWith('request-changes:')) {
        description = trimmed;
        break;
      }
    }
  }
  // Siblings: same groupId (move groups) or id starting with parentId. (dotted-ID groups)
  const siblings = doc
    .getChanges()
    .filter(
      (c) =>
        (c.groupId === parentId || c.id.startsWith(parentId + '.')) && c.id !== parentId
    )
    .map((c) => c.id);
  return {
    parent_id: parentId,
    description,
    siblings,
  };
}

export async function handleGetChange(
  args: Record<string, unknown>,
  resolver: ConfigResolver
): Promise<GetChangeResult> {
  try {
    const fileArg = args.file as string | undefined;
    const changeId = optionalStrArg(args, 'change_id', 'changeId');
    const contextLines = ((args.context_lines ?? args.contextLines) as number | undefined) ?? 3;
    const includeRawFootnote = args.include_raw_footnote === true;

    if (fileArg === undefined || fileArg === '') {
      return errorResult('Missing required argument: "file".');
    }
    if (changeId === undefined || changeId === '') {
      return errorResult('Missing required argument: "change_id".');
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

    const parser = new CriticMarkupParser();
    const doc = parser.parse(fileContent);
    const change = doc.getChanges().find((c) => c.id === changeId);

    if (!change) {
      // Check if change exists in footnotes (settled/compacted — inline markup removed but footnote retained)
      const lines = fileContent.split('\n');
      const settledBlock = findFootnoteBlock(lines, changeId);
      if (settledBlock) {
        const header = parseFootnoteHeader(settledBlock.headerContent);
        const status = header?.status ?? 'unknown';
        return errorResult(
          `Change ${changeId} has been settled (status: ${status}). Inline markup was compacted. See git history for the original change.`,
          'CHANGE_SETTLED',
          { status },
        );
      }
      return errorResult(`Change ${changeId} not found in file`);
    }

    const lines = fileContent.split('\n');
    const startLine = offsetToLineNumber(fileContent, change.range.start);
    const endLine = offsetToLineNumber(fileContent, change.range.end);
    const contextN = Math.max(0, contextLines);

    const markup = fileContent.slice(change.range.start, change.range.end);
    // startLine/endLine are 1-based; slice uses 0-based indices
    const contextBefore = lines.slice(Math.max(0, startLine - 1 - contextN), startLine - 1);
    const contextAfter = lines.slice(endLine, Math.min(lines.length, endLine + contextN));

    const typeStr = TYPE_MAP[change.type];
    const statusStr = change.status.toLowerCase() as GetChangeResponse['status'];

    let footnoteAuthor = '';
    let footnoteDate = '';
    let rawFootnoteText = '';
    let reasoning: string | null = null;
    let discussionCount = 0;
    const approvals: string[] = [];
    const rejections: string[] = [];
    const requestChanges: string[] = [];

    const block = findFootnoteBlock(lines, changeId);
    if (block) {
      rawFootnoteText = lines.slice(block.headerLine, block.blockEnd + 1).join('\n');
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
    const participants = [...participantsSet];

    const dotIndex = changeId.lastIndexOf('.');
    const group =
      dotIndex > 0 ? buildGroupInfo(doc, lines, changeId.slice(0, dotIndex)) : null;

    const footnote: GetChangeResponse['footnote'] = {
      author: footnoteAuthor,
      date: footnoteDate,
      reasoning,
      discussion_count: discussionCount,
      approvals,
      rejections,
      request_changes: requestChanges,
    };
    if (includeRawFootnote) {
      footnote.raw_text = rawFootnoteText;
    }

    const response: GetChangeResponse = {
      change_id: changeId,
      file: toRelativePath(projectDir, filePath),
      type: typeStr,
      status: statusStr,
      inline: {
        line_number: startLine,
        end_line_number: endLine,
        markup,
        original_text: change.type === ChangeType.Insertion ? null : (change.originalText ?? null),
        modified_text: change.type === ChangeType.Deletion ? null : (change.modifiedText ?? null),
        context_before: contextBefore,
        context_after: contextAfter,
      },
      footnote,
      participants,
      group,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(response) }],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}

function errorResult(
  message: string,
  code?: string,
  details?: Record<string, unknown>,
): GetChangeResult {
  if (code) {
    const payload: Record<string, unknown> = {
      error: {
        code,
        message,
        ...(details ?? {}),
      },
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(payload) }],
      isError: true,
    };
  }
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}
