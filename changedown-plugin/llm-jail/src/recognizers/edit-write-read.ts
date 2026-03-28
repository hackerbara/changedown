// src/recognizers/edit-write-read.ts
import * as path from 'node:path';
import type { ToolCall, FileOperation } from '../types.js';

const TOOL_OP_MAP: Record<string, FileOperation['op']> = {
  edit: 'write',
  write: 'write',
  read: 'read',
};

export function analyzeEditWriteRead(call: ToolCall): FileOperation[] {
  const op = TOOL_OP_MAP[call.tool];
  if (!op) return [];

  const filePath = call.input.file_path as string | undefined;
  if (!filePath) return [];

  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(call.cwd, filePath);

  return [{ op, file: absPath, source: call }];
}
