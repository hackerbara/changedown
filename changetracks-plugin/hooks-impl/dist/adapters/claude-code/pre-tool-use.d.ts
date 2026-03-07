import type { HookInput } from '../shared.js';
export interface PreToolUseResult {
    /** Empty object = allow. Object with permissionDecision = deny/allow/ask. */
    hookSpecificOutput?: {
        hookEventName: string;
        permissionDecision: 'deny' | 'allow' | 'ask';
        permissionDecisionReason?: string;
        additionalContext?: string;
    };
}
/**
 * Core logic for the PreToolUse handler.
 * Delegates policy decisions to core/policy-engine.ts.
 */
export declare function handlePreToolUse(input: HookInput): Promise<PreToolUseResult>;
