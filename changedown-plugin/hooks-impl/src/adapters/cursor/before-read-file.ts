#!/usr/bin/env node
// adapters/cursor/before-read-file.ts — Cursor beforeReadFile hook handler
//
// Evaluates whether a raw file read should be allowed or redirected
// to read_tracked_file. Only blocks in strict mode for tracked files.

import { loadConfig } from '../../config.js';
import { evaluateRawRead } from '../../core/mcp-validation.js';
import { deriveProjectDir, readStdin, writeStdout, type HookInput } from '../shared.js';

interface CursorReadResponse {
  continue: boolean;
  permission?: 'allow' | 'deny';
}

export async function handleBeforeReadFile(input: HookInput): Promise<CursorReadResponse> {
  const filePath = input.file_path ?? '';
  const projectDir = deriveProjectDir(input);

  // Skip Cursor internal reads (.cursor/ directory)
  if (filePath.includes('/.cursor/')) {
    return { continue: true };
  }

  // Skip files outside workspace
  if (!filePath.startsWith(projectDir)) {
    return { continue: true };
  }

  const config = await loadConfig(projectDir);
  const decision = evaluateRawRead(filePath, config, projectDir);

  if (decision.action === 'deny') {
    return { continue: false, permission: 'deny' };
  }

  return { continue: true, permission: 'allow' };
}

async function main(): Promise<void> {
  try {
    const input = await readStdin();
    const result = await handleBeforeReadFile(input);
    writeStdout(result as unknown as Record<string, unknown>);
  } catch {
    writeStdout({ continue: true }); // fail-open for Cursor
  }
}

main();
