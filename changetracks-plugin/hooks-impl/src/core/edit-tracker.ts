// core/edit-tracker.ts — Edit classification and logging
import type { EditClass, PolicyMode } from './types.js';
import { appendPendingEdit } from '../pending.js';
import type { PendingEdit } from '../pending.js';

export function classifyEdit(toolName: string, oldText: string, newText: string): EditClass {
  if (toolName === 'Write') return 'creation';
  if (oldText === '' && newText !== '') return 'insertion';
  if (newText === '' && oldText !== '') return 'deletion';
  return 'substitution';
}

export function shouldLogEdit(policyMode: PolicyMode): boolean {
  return policyMode === 'safety-net';
}

export async function logEdit(
  projectDir: string,
  sessionId: string,
  filePath: string,
  oldText: string,
  newText: string,
  toolName: string,
  contextBefore?: string,
  contextAfter?: string,
): Promise<void> {
  const editClass = classifyEdit(toolName, oldText, newText);
  const edit: PendingEdit = {
    file: filePath,
    old_text: oldText,
    new_text: newText,
    timestamp: new Date().toISOString(),
    session_id: sessionId,
    context_before: contextBefore,
    context_after: contextAfter,
    tool_name: toolName,
    edit_class: editClass,
  };
  await appendPendingEdit(projectDir, edit);
}

export async function logReadAudit(
  projectDir: string,
  sessionId: string,
  filePath: string,
): Promise<void> {
  const edit: PendingEdit = {
    file: filePath,
    old_text: '',
    new_text: '',
    timestamp: new Date().toISOString(),
    session_id: sessionId,
    context_before: 'read_tracked_file',
  };
  await appendPendingEdit(projectDir, edit);
}
