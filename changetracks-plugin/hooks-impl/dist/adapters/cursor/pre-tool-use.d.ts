#!/usr/bin/env node
import { type HookInput } from '../shared.js';
interface CursorPreToolUseResponse {
    decision: 'allow' | 'deny';
    reason?: string;
    updated_input?: Record<string, unknown>;
}
export declare function handlePreToolUse(input: HookInput): Promise<CursorPreToolUseResponse>;
export {};
