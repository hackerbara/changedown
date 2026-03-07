/**
 * Output formatting layer for the `sc` CLI.
 *
 * Converts MCP handler results into CLI-friendly stdout strings.
 * Three formats: json (machine), pretty (human), quiet (scripting).
 */

import type { OutputFormat } from './cli-parse.js';

export type { OutputFormat };

export interface CliResult {
  success: boolean;
  data: Record<string, unknown>;
  message: string;
  error?: string;
  rawText?: string;
}

interface HandlerResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Render a list of items (from list/files commands) as a human-readable table or path list.
 */
function summarizeItems(items: unknown[]): string {
  if (items.length === 0) return 'No results';

  // Detect if these are strings (files command) or objects (list command)
  if (typeof items[0] === 'string') {
    return (items as string[]).join('\n');
  }

  // list command returns change objects
  const rows: string[] = [];
  rows.push('ID         File                               Type  Status    Author');
  rows.push('\u2500'.repeat(72));
  for (const item of items as Record<string, unknown>[]) {
    const id = String(item.change_id ?? item.id ?? '').padEnd(10);
    const rawFile = String(item.file ?? '');
    const file = (rawFile.length > 33 ? '\u2026' + rawFile.slice(-32) : rawFile).padEnd(33);
    const type = String(item.type ?? '').slice(0, 3).padEnd(5);
    const status = String(item.status ?? '').slice(0, 8).padEnd(9);
    const author = String(item.author ?? '');
    rows.push(`${id} ${file} ${type} ${status} ${author}`);
  }
  rows.push(`\n${items.length} change(s)`);
  return rows.join('\n');
}

/**
 * Build a human-readable summary from data fields.
 * Pattern: `change_id (type) in file` — omitting parts that are absent.
 */
function summarize(data: Record<string, unknown>): string {
  // Handle list/files results with items array
  if (Array.isArray(data.items)) {
    return summarizeItems(data.items);
  }

  const parts: string[] = [];

  const changeId = data.change_id ?? data.group_id;
  if (typeof changeId === 'string') {
    parts.push(changeId);
  }

  if (typeof data.type === 'string') {
    parts.push(`(${data.type})`);
  }

  if (typeof data.file === 'string') {
    parts.push(`in ${data.file}`);
  }

  if (parts.length === 0) return 'OK';

  // Prefix with "Proposed" when we have a change_id (propose results)
  const prefix = data.change_id && !data.amended && !data.decision ? 'Proposed ' : '';
  return prefix + parts.join(' ');
}

/**
 * Convert an MCP handler result into a normalized CliResult.
 *
 * - `opts.raw = true`: bypass JSON parsing, pass text through as rawText
 * - Otherwise: attempt JSON.parse on the handler text
 */
export function handlerToCliResult(
  handlerResult: HandlerResult,
  opts?: { raw?: boolean },
): CliResult {
  const text = handlerResult.content.map((c) => c.text).join('');
  const isError = handlerResult.isError === true;

  // Raw mode: used by read_tracked_file
  if (opts?.raw) {
    if (isError) {
      return { success: false, data: {}, message: text };
    }
    return { success: true, data: {}, message: '', rawText: text };
  }

  // Try JSON parse
  let parsed: Record<string, unknown> | undefined;
  try {
    const raw = JSON.parse(text);
    // Wrap arrays for consistent data shape
    parsed = Array.isArray(raw) ? { items: raw as unknown[] } : (raw as Record<string, unknown>);
  } catch {
    // Not JSON — treat as plain text
    if (isError) {
      return { success: false, data: {}, message: text };
    }
    return { success: true, data: {}, message: '', rawText: text };
  }

  if (isError) {
    const code = typeof parsed.code === 'string' ? parsed.code : 'ERROR';
    const msg = typeof parsed.message === 'string' ? parsed.message : text;
    return { success: false, data: {}, message: msg, error: code };
  }

  return {
    success: true,
    data: parsed,
    message: summarize(parsed),
  };
}

/**
 * Format a CliResult for stdout in the requested output format.
 * Always returns a string ending with '\n'.
 */
export function formatResult(result: CliResult, format: OutputFormat): string {
  switch (format) {
    case 'json':
      return formatJson(result);
    case 'pretty':
      return formatPretty(result);
    case 'quiet':
      return formatQuiet(result);
  }
}

function formatJson(result: CliResult): string {
  if (!result.success) {
    return JSON.stringify({ error: result.error, message: result.message }, null, 2) + '\n';
  }
  if (result.rawText !== undefined) {
    return JSON.stringify({ content: result.rawText }, null, 2) + '\n';
  }
  return JSON.stringify(result.data, null, 2) + '\n';
}

function formatPretty(result: CliResult): string {
  if (!result.success) {
    return `Error: ${result.message}\n`;
  }
  if (result.rawText !== undefined) {
    return result.rawText + '\n';
  }
  return result.message + '\n';
}

function formatQuiet(result: CliResult): string {
  if (!result.success) {
    return (result.error ?? 'ERROR') + '\n';
  }
  if (result.rawText !== undefined) {
    return result.rawText + '\n';
  }
  const id = result.data.change_id ?? result.data.group_id;
  if (typeof id === 'string') {
    return id + '\n';
  }
  return 'OK\n';
}
