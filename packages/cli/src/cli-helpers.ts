/**
 * Shared helpers for CLI command modules.
 * Eliminates repeated patterns across all 11 commands.
 */
import { parseArgs, type ParseArgsConfig } from 'node:util';
import type { CliResult } from './cli-output.js';

/** Try parseArgs, return null on unknown-flag errors. */
export function tryParseArgs(config: ParseArgsConfig): ReturnType<typeof parseArgs> | null {
  try {
    return parseArgs(config);
  } catch {
    return null;
  }
}

/**
 * Extract a string value from parseArgs result.
 * Node's parseArgs types values as `string | boolean | (string | boolean)[] | undefined`
 * even when the option is declared as `type: 'string'`. This helper narrows safely.
 */
export function stringFlag(value: string | boolean | (string | boolean)[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Parse a string flag as an integer, returning undefined on NaN. */
export function parseIntFlag(value: string | boolean | (string | boolean)[] | undefined): number | undefined {
  const s = stringFlag(value);
  if (s === undefined) return undefined;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? undefined : n;
}

/** Check if subArgs contain --help or -h. */
export function hasHelpFlag(subArgs: string[]): boolean {
  return subArgs.includes('--help') || subArgs.includes('-h');
}

/** Return a successful result containing usage text. */
export function helpResult(usage: string): CliResult {
  return { success: true, data: {}, message: '', rawText: usage };
}

/** Standard USAGE_ERROR result. */
export function usageError(message: string): CliResult {
  return { success: false, data: {}, message, error: 'USAGE_ERROR' };
}

/** Standard INVALID_JSON result. */
export function invalidJsonError(message: string): CliResult {
  return { success: false, data: {}, message, error: 'INVALID_JSON' };
}
