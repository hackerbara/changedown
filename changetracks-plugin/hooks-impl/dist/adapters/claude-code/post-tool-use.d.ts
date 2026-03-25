import type { HookInput } from '../shared.js';
export interface PostToolUseResult {
    logged?: boolean;
    hookSpecificOutput?: {
        hookEventName: string;
        additionalContext?: string;
    };
}
export declare function handlePostToolUse(input: HookInput): Promise<PostToolUseResult>;
