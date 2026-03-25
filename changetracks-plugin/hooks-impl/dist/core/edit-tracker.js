import { appendPendingEdit } from '../pending.js';
export function classifyEdit(toolName, oldText, newText) {
    if (toolName.toLowerCase() === 'write')
        return 'creation';
    if (oldText === '' && newText !== '')
        return 'insertion';
    if (newText === '' && oldText !== '')
        return 'deletion';
    return 'substitution';
}
export function shouldLogEdit(policyMode) {
    return policyMode === 'safety-net';
}
export async function logEdit(projectDir, sessionId, filePath, oldText, newText, toolName, contextBefore, contextAfter) {
    const editClass = classifyEdit(toolName, oldText, newText);
    const edit = {
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
export async function logReadAudit(projectDir, sessionId, filePath) {
    const edit = {
        file: filePath,
        old_text: '',
        new_text: '',
        timestamp: new Date().toISOString(),
        session_id: sessionId,
        context_before: 'read_tracked_file',
    };
    await appendPendingEdit(projectDir, edit);
}
//# sourceMappingURL=edit-tracker.js.map