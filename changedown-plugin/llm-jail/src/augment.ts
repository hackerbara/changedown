// src/augment.ts
import type { ToolCall, ToolResult, Rule } from './types.js';
import { POST_HANDLER_MAP } from './types.js';
import { analyze } from './analyzer.js';

/**
 * Post-phase evaluation: augment the tool result and/or run side effects.
 *
 * Void handlers (returning undefined) always run — they perform side effects
 * like logging edits. String handlers short-circuit: the first string return
 * becomes the additionalContext, and subsequent handlers are skipped.
 */
export async function augment(
  call: ToolCall,
  result: ToolResult,
  rules: Rule[],
): Promise<string | null> {
  const ops = analyze(call);

  if (ops.length === 0) return null;

  let contextResult: string | null = null;

  for (const op of ops) {
    for (const rule of rules) {
      if (!rule.scope(op.file)) continue;

      const handlerKey = POST_HANDLER_MAP[op.op];
      if (!handlerKey) continue;

      const handler = rule[handlerKey];
      if (!handler) continue;

      // If we already have a string result, skip further handlers
      // (but void/side-effect handlers already ran for earlier ops)
      if (contextResult !== null) continue;

      const output = await handler(op, result);
      if (typeof output === 'string') {
        contextResult = output;
      }
      // void return: side effect ran, continue to next rule
    }
  }

  return contextResult;
}
