import type { EditClass, PolicyMode } from './types.js';
export declare function classifyEdit(toolName: string, oldText: string, newText: string): EditClass;
export declare function shouldLogEdit(policyMode: PolicyMode): boolean;
export declare function logEdit(projectDir: string, sessionId: string, filePath: string, oldText: string, newText: string, toolName: string, contextBefore?: string, contextAfter?: string): Promise<void>;
export declare function logReadAudit(projectDir: string, sessionId: string, filePath: string): Promise<void>;
