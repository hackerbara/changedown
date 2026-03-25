// adapters/claude-code/pre-tool-use.ts — Claude Code PreToolUse handler
//
// Thin adapter: delegates all policy decisions to llm-jail evaluate().
import { evaluate } from 'llm-jail';
import { loadConfig } from '../../config.js';
import { buildChangeTracksRule } from '../../changetracks-rules.js';
export async function handlePreToolUse(input) {
    if (!input.tool_name || !input.cwd)
        return {};
    const projectDir = input.cwd;
    const sessionId = input.session_id ?? 'unknown';
    const config = await loadConfig(projectDir);
    const tool = input.tool_name.toLowerCase();
    // Skip interception based on config toggles
    const isBuiltInTool = tool === 'edit' || tool === 'write' || tool === 'read';
    const isBashTool = tool === 'bash';
    if (isBuiltInTool && !config.hooks.intercept_tools)
        return {};
    if (isBashTool && !config.hooks.intercept_bash)
        return {};
    const toolCall = {
        tool,
        input: input.tool_input ?? {},
        cwd: projectDir,
    };
    const rule = buildChangeTracksRule(config, projectDir, sessionId);
    const verdict = await evaluate(toolCall, [rule]);
    return verdictToHookResult(verdict);
}
function verdictToHookResult(verdict) {
    if (verdict.action === 'deny') {
        return {
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'deny',
                permissionDecisionReason: verdict.reason ?? verdict.agentHint ?? 'Blocked by LLM Jail',
            },
        };
    }
    if (verdict.action === 'warn' || verdict.agentHint) {
        return {
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'allow',
                additionalContext: verdict.agentHint,
            },
        };
    }
    return {};
}
//# sourceMappingURL=pre-tool-use.js.map