import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { CriticMarkupParser } from '@changedown/core';
import { errorResult } from '../shared/error-result.js';
import { optionalStrArg } from '../args.js';
import { isFileInScope, type ChangeDownConfig } from '../config.js';
import { ConfigResolver } from '../config-resolver.js';
import { toRelativePath } from '../path-utils.js';
import { SessionState } from '../state.js';

const TRACKING_HEADER_TRACKED = '<!-- changedown.com/v1: tracked -->';
const VALID_STATUSES = ['proposed', 'accepted', 'rejected'] as const;

/**
 * Tool definition for the list_open_threads MCP tool.
 * Raw JSON Schema — used when registering the tool with the MCP server.
 */
export const listOpenThreadsTool = {
  name: 'list_open_threads',
  description:
    'List changes with proposed status or open discussion threads. Pass path (file or directory) to scope the query.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description:
          'Path to a markdown file or directory (relative to project root or absolute). If directory, scans **/*.md for tracked files. Required.',
      },
      status: {
        type: 'array',
        items: { type: 'string', enum: ['proposed', 'accepted', 'rejected'] },
        description:
          'Filter by change status. Defaults to ["proposed"]. Pass multiple to match any.',
      },
      author: {
        type: 'string',
        description:
          'Filter by author (e.g. "@ai:claude-opus-4.6", "@alice"). Returns only changes where this author is a participant.',
      },
      limit: {
        type: 'number',
        description: 'Max number of changes to return. Default 25, max 100.',
      },
    },
    required: ['path'],
  },
};

export interface ListOpenThreadsResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Quick-check: does the file content start with a tracked header (first 400 chars)?
 */
async function hasTrackingHeader(filePath: string): Promise<boolean> {
  try {
    const fd = await fs.open(filePath, 'r');
    const buf = Buffer.alloc(400);
    const { bytesRead } = await fd.read(buf as Uint8Array, 0, 400, 0);
    await fd.close();
    const head = buf.slice(0, bytesRead).toString('utf-8');
    return head.includes(TRACKING_HEADER_TRACKED);
  } catch {
    return false;
  }
}

/**
 * Collect .md files under dirPath that are in scope and have a tracked header.
 */
async function collectTrackedMdFiles(
  dirPath: string,
  config: ChangeDownConfig,
  projectDir: string
): Promise<string[]> {
  const out: string[] = [];
  try {
    const entries = await fs.readdir(dirPath, { recursive: true });
    for (const raw of entries) {
      const entry = typeof raw === 'string' ? raw : String(raw);
      const full = path.join(dirPath, entry);
      if (!entry.endsWith('.md')) continue;
      try {
        const stat = await fs.stat(full);
        if (!stat.isFile()) continue;
      } catch {
        continue;
      }
      if (!isFileInScope(full, config, projectDir)) continue;
      if (!(await hasTrackingHeader(full))) continue;
      out.push(full);
    }
  } catch {
    // Directory unreadable
  }
  return out;
}

/**
 * Handles a `list_open_threads` tool call.
 *
 * Requires `path` — file or directory. If file: lists changes for that file.
 * If directory: scans for .md files, quick-checks for tracking header, parses only tracked files, aggregates results.
 * Each result includes `file` so the caller knows which file each change came from.
 *
 * Uses @changedown/core's CriticMarkupParser for footnote parsing.
 *
 * Returns an array of changes with metadata, filtered by status (default proposed) and optional author.
 */
export async function handleListOpenThreads(
  args: Record<string, unknown>,
  resolver: ConfigResolver,
  _state: SessionState
): Promise<ListOpenThreadsResult> {
  try {
    const pathArg = optionalStrArg(args, 'path', 'path');
    const authorFilter = optionalStrArg(args, 'author', 'author');
    const statusParam = args.status as unknown;

    if (pathArg === undefined || pathArg === '') {
      return errorResult(
        'Missing required argument: "path". Pass a file or directory to list open threads for.'
      );
    }

    const resolvedPath = resolver.resolveFilePath(pathArg);
    const { config, projectDir } = await resolver.forFile(resolvedPath);

    let filesToScan: string[] = [];
    try {
      const stat = await fs.stat(resolvedPath);
      if (stat.isFile()) {
        if (!isFileInScope(resolvedPath, config, projectDir)) {
          return errorResult(
            `File is not in scope for tracking: "${resolvedPath}". ` +
              'Check .changedown/config.toml include/exclude patterns.'
          );
        }
        filesToScan = [resolvedPath];
      } else if (stat.isDirectory()) {
        filesToScan = await collectTrackedMdFiles(resolvedPath, config, projectDir);
      } else {
        return errorResult(`Path is not a file or directory: "${resolvedPath}"`);
      }
    } catch {
      return errorResult(`File not found or unreadable: "${resolvedPath}"`);
    }

    const statusFilter: string[] =
      Array.isArray(statusParam) && statusParam.length > 0
        ? statusParam.filter((s) => typeof s === 'string' && VALID_STATUSES.includes(s as typeof VALID_STATUSES[number]))
        : ['proposed'];
    if (statusFilter.length === 0) {
      statusFilter.push('proposed');
    }

    // Parse each file and collect proposed changes
    const allChanges: Array<{
      change_id: string;
      file: string;
      type: string;
      status: string;
      author: string;
      date: string;
      comment?: string;
      participants: string[];
      has_request_changes: boolean;
    }> = [];

    const parser = new CriticMarkupParser();

    for (const fp of filesToScan) {
      let content: string;
      try {
        content = await fs.readFile(fp, 'utf-8');
      } catch {
        // Skip unreadable files in project-wide scan
        continue;
      }

      const doc = parser.parse(content);
      const changes = doc.getChanges();

      for (const node of changes) {
        // Only include changes with footnote metadata (author/date come from footnotes)
        if (!node.metadata?.author) continue;

        const meta = node.metadata;

        // Map ChangeStatus enum to lowercase string for output
        const statusStr = node.status.toLowerCase();

        if (!statusFilter.includes(statusStr)) continue;

        // Build participants set from metadata
        const participantSet = new Set<string>();
        if (meta.author) participantSet.add(meta.author);

        // Discussion authors
        if (meta.discussion) {
          for (const disc of meta.discussion) {
            participantSet.add(disc.author);
          }
        }

        // Approval/rejection/request-changes authors
        if (meta.approvals) {
          for (const a of meta.approvals) participantSet.add(a.author);
        }
        if (meta.rejections) {
          for (const a of meta.rejections) participantSet.add(a.author);
        }
        if (meta.requestChanges) {
          for (const a of meta.requestChanges) participantSet.add(a.author);
        }

        // Apply author filter
        if (authorFilter && !participantSet.has(authorFilter)) {
          continue;
        }

        // Map ChangeType enum to lowercase short form for output
        const typeMap: Record<string, string> = {
          'Insertion': 'ins',
          'Deletion': 'del',
          'Substitution': 'sub',
          'Highlight': 'highlight',
          'Comment': 'comment',
        };
        const typeStr = typeMap[node.type] || node.type.toLowerCase();

        // Extract comment: first discussion comment text, or inline comment
        const comment = meta.discussion?.[0]?.text ?? meta.comment;

        allChanges.push({
          change_id: node.id,
          file: toRelativePath(projectDir, fp),
          type: typeStr,
          status: statusStr,
          author: meta.author ?? '',
          date: meta.date || '',
          comment,
          participants: [...participantSet],
          has_request_changes: (meta.requestChanges?.length ?? 0) > 0,
        });
      }
    }

    const limit = Math.max(1, Math.min(100, Number(args.limit ?? 25) || 25));
    const sorted = [...allChanges].sort(
      (a, b) => a.file.localeCompare(b.file) || a.change_id.localeCompare(b.change_id)
    );
    const visible = sorted.slice(0, limit);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(visible),
        },
      ],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}

