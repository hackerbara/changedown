// src/analyzer.ts
import type { ToolCall, FileOperation, Recognizer } from './types.js';
import { analyzeEditWriteRead } from './recognizers/edit-write-read.js';
import { analyzeBash, registerRecognizer, getRecognizers } from './recognizers/bash.js';
import { sedRecognizer } from './recognizers/sed.js';
import { fileCommandRecognizers } from './recognizers/file-commands.js';
import { redirectRecognizers } from './recognizers/redirects.js';
import { interpreterRecognizers } from './recognizers/interpreters.js';

let initialized = false;

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;

  // Register all built-in recognizers
  registerRecognizer(sedRecognizer);
  for (const r of fileCommandRecognizers) registerRecognizer(r);
  for (const r of redirectRecognizers) registerRecognizer(r);
  for (const r of interpreterRecognizers) registerRecognizer(r);
}

/**
 * Analyze a tool call and return all detected file operations.
 * Routes to the appropriate analyzer based on tool name.
 * Returns [] for unrecognized tools (fail-open).
 */
export function analyze(call: ToolCall): FileOperation[] {
  ensureInitialized();

  const tool = call.tool.toLowerCase();

  if (tool === 'edit' || tool === 'write' || tool === 'read') {
    return analyzeEditWriteRead(call);
  }

  if (tool === 'bash') {
    return analyzeBash(call);
  }

  // Unrecognized tool (MCP tools, etc.) — fail-open
  return [];
}

/**
 * Register a custom recognizer for the Bash analyzer.
 */
export function addRecognizer(r: Recognizer): void {
  ensureInitialized();
  registerRecognizer(r);
}

/**
 * Reset recognizers to empty state (for testing).
 */
export function resetRecognizers(): void {
  // Clear the registry in bash.ts and re-initialize
  const recognizers = getRecognizers();
  recognizers.length = 0;
  initialized = false;
}
