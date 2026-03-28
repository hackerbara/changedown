// src/recognizers/bash.ts
import * as path from 'node:path';
import type { ToolCall, FileOperation, Recognizer } from '../types.js';

/**
 * Split a bash command string on &&, ||, ;, | operators.
 * Respects single quotes, double quotes, and backslash escapes.
 */
export function splitCommand(command: string): string[] {
  const segments: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      current += ch;
      escaped = true;
      continue;
    }

    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += ch;
      continue;
    }

    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += ch;
      continue;
    }

    if (inSingleQuote || inDoubleQuote) {
      current += ch;
      continue;
    }

    // Check for two-character operators: && and ||
    if ((ch === '&' && command[i + 1] === '&') || (ch === '|' && command[i + 1] === '|')) {
      if (current.trim()) segments.push(current.trim());
      current = '';
      i++; // skip second character
      continue;
    }

    // Single-character operators: ; and |
    if (ch === ';' || ch === '|') {
      if (current.trim()) segments.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.trim()) segments.push(current.trim());
  return segments;
}

/**
 * Extract a shell redirect (> or >>) from a command segment.
 * Returns the target file and the command without the redirect, or null.
 */
export function extractRedirect(
  segment: string,
): { file: string; command: string } | null {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];

    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === "'" && !inDoubleQuote) { inSingleQuote = !inSingleQuote; continue; }
    if (ch === '"' && !inSingleQuote) { inDoubleQuote = !inDoubleQuote; continue; }
    if (inSingleQuote || inDoubleQuote) continue;

    if (ch === '>') {
      const isAppend = segment[i + 1] === '>';
      const afterOp = isAppend ? i + 2 : i + 1;
      const file = segment.slice(afterOp).trim();
      const command = segment.slice(0, i).trim();
      if (file) return { file, command };
    }
  }

  return null;
}

/**
 * Parse argv from a command string segment.
 * Simple tokenizer that respects quotes.
 */
export function parseArgv(segment: string): string[] {
  const args: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (const ch of segment) {
    if (escaped) { current += ch; escaped = false; continue; }
    if (ch === '\\') { escaped = true; current += ch; continue; }
    if (ch === "'" && !inDoubleQuote) { inSingleQuote = !inSingleQuote; continue; }
    if (ch === '"' && !inSingleQuote) { inDoubleQuote = !inDoubleQuote; continue; }

    if (ch === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current) { args.push(current); current = ''; }
      continue;
    }

    current += ch;
  }

  if (current) args.push(current);
  return args;
}

// Recognizer registry
const recognizers: Recognizer[] = [];

export function registerRecognizer(r: Recognizer): void {
  recognizers.push(r);
}

export function getRecognizers(): Recognizer[] {
  return recognizers;
}

/**
 * Analyze a Bash tool call.
 * Splits the command, runs recognizers on each segment, collects FileOperations.
 */
export function analyzeBash(call: ToolCall): FileOperation[] {
  const command = call.input.command as string | undefined;
  if (!command) return [];

  const segments = splitCommand(command);
  const ops: FileOperation[] = [];

  for (const segment of segments) {
    // Check for redirects first
    const redirect = extractRedirect(segment);
    if (redirect) {
      const absFile = path.isAbsolute(redirect.file)
        ? redirect.file
        : path.resolve(call.cwd, redirect.file);
      ops.push({ op: 'write', file: absFile, source: call });
    }

    // Parse command name and run recognizers
    const argv = parseArgv(redirect ? redirect.command : segment);
    if (argv.length === 0) continue;

    const cmdName = path.basename(argv[0]);

    for (const recognizer of recognizers) {
      const matches = typeof recognizer.command === 'string'
        ? cmdName === recognizer.command
        : recognizer.command.test(cmdName);

      if (matches) {
        const results = recognizer.extract(argv, segment);
        for (const match of results) {
          const absFile = path.isAbsolute(match.file)
            ? match.file
            : path.resolve(call.cwd, match.file);
          ops.push({ op: match.op, file: absFile, source: call });
        }
        break; // first matching recognizer wins per segment
      }
    }
  }

  return ops;
}
