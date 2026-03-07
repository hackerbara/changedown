// adapters/claude-code/pre-tool-use.ts — Claude Code PreToolUse handler
//
// Contains the handler logic for Claude Code's PreToolUse hook event.
// Reads config, evaluates raw-edit policy.
// When strict mode denies an edit, computes a warm redirect with a pre-formatted
// propose_change call the agent can copy and add reasoning to.
// The root-level pre-tool-use.ts remains the entrypoint (main + stdin/stdout).
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { loadConfig } from '../../config.js';
import { evaluateRawEdit, evaluateRawRead } from '../../core/policy-engine.js';
import { formatRedirect, formatReadRedirect } from '../../core/redirect-formatter.js';
/**
 * Core logic for the PreToolUse handler.
 * Delegates policy decisions to core/policy-engine.ts.
 */
export async function handlePreToolUse(input) {
    const { tool_name, tool_input, cwd } = input;
    // read_tracked_file is read-only — always pass through
    if (tool_name === 'read_tracked_file') {
        return {};
    }
    // Handle Read tool — redirect to read_tracked_file in strict mode
    if (tool_name === 'Read') {
        const filePath = tool_input?.file_path ?? '';
        if (!filePath || !cwd) {
            return {};
        }
        const config = await loadConfig(cwd);
        const decision = evaluateRawRead(filePath, config, cwd);
        if (decision.action === 'deny') {
            const hint = formatReadRedirect(path.relative(cwd, filePath), { policy: config.policy });
            return {
                hookSpecificOutput: {
                    hookEventName: 'PreToolUse',
                    permissionDecision: 'deny',
                    permissionDecisionReason: hint,
                },
            };
        }
        if (decision.agentHint) {
            return {
                hookSpecificOutput: {
                    hookEventName: 'PreToolUse',
                    permissionDecision: 'allow',
                    additionalContext: decision.agentHint,
                },
            };
        }
        return {};
    }
    // Only handle Edit and Write tools beyond this point
    if (tool_name !== 'Edit' && tool_name !== 'Write') {
        return {};
    }
    if (!cwd || !tool_input) {
        return {};
    }
    const projectDir = cwd;
    const filePath = tool_input.file_path ?? '';
    if (!filePath) {
        return {};
    }
    const config = await loadConfig(projectDir);
    const oldText = tool_input.old_string ?? '';
    const newText = tool_input.new_string ?? tool_input.content ?? '';
    const decision = evaluateRawEdit(filePath, config, projectDir, {
        checkFileExists: tool_name === 'Write',
    });
    if (decision.action === 'allow') {
        // Creation bypass or other advisory allows: surface agentHint as informational output
        if (decision.agentHint) {
            return {
                hookSpecificOutput: {
                    hookEventName: 'PreToolUse',
                    permissionDecision: 'allow',
                    additionalContext: decision.agentHint,
                },
            };
        }
        return {};
    }
    if (decision.action === 'deny') {
        let hint = decision.agentHint ?? '';
        // Warm redirect: read the file and compute a pre-formatted propose_change call
        try {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            if (config.hashline.enabled) {
                const { initHashline } = await import('@changetracks/core');
                await initHashline();
            }
            hint = formatRedirect({
                toolName: tool_name,
                filePath: path.relative(projectDir, filePath),
                oldText: oldText,
                newText: newText,
                fileContent,
                config: { protocol: config.protocol, hashline: config.hashline },
            });
        }
        catch {
            // Fall back to generic agentHint from policy engine on any error
        }
        return {
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'deny',
                permissionDecisionReason: hint,
            },
        };
    }
    // warn → allow with advisory context
    return {
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
            additionalContext: decision.agentHint,
        },
    };
}
//# sourceMappingURL=pre-tool-use.js.map