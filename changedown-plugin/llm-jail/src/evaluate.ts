// src/evaluate.ts
import type { ToolCall, Verdict, Rule } from './types.js';
import { PRE_HANDLER_MAP } from './types.js';
import { analyze } from './analyzer.js';

/**
 * Pre-phase evaluation: should this tool call proceed?
 *
 * For each FileOperation extracted from the tool call, iterates the rule stack.
 * First deny wins. If no deny, returns first warn. Otherwise allows.
 */
export async function evaluate(call: ToolCall, rules: Rule[]): Promise<Verdict> {
  let advisory: Verdict | null = null;

  // Phase 1: Tool-level gate (fires for ALL tool calls, including MCP)
  for (const rule of rules) {
    if (!rule.onToolCall) continue;
    const verdict = await rule.onToolCall(call);
    if (verdict.action === 'deny') return verdict;
    if ((verdict.action === 'warn' || verdict.agentHint) && !advisory) advisory = verdict;
  }

  // Phase 2: File-operation analysis
  const ops = analyze(call);

  if (ops.length === 0) return advisory ?? { action: 'allow' };

  for (const op of ops) {
    for (const rule of rules) {
      if (!rule.scope(op.file)) continue;

      const handlerKey = PRE_HANDLER_MAP[op.op];
      const handler = rule[handlerKey];
      if (!handler) continue;

      const verdict = await handler(op);
      if (verdict.action === 'deny') return verdict;
      if ((verdict.action === 'warn' || verdict.agentHint) && !advisory) advisory = verdict;
    }
  }

  return advisory ?? { action: 'allow' };
}
