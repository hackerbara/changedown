// types.ts — All type definitions for llm-jail

export interface ToolCall {
  tool: string;            // 'edit', 'write', 'read', 'bash', or any MCP tool name
  input: Record<string, unknown>;
  cwd: string;             // working directory, used for resolving relative paths
}

export interface FileOperation {
  op: 'read' | 'write' | 'delete';
  file: string;           // absolute path
  source: ToolCall;
}

export interface Verdict {
  action: 'allow' | 'deny' | 'warn';
  reason?: string;         // permissionDecisionReason → shown to agent on deny
  agentHint?: string;      // additionalContext → shown to agent on allow/warn
  userMessage?: string;    // systemMessage → shown to user in notification
  audit?: string;          // logged but not blocking
}

export interface ToolResult {
  tool_response: unknown;  // raw output from Claude Code PostToolUse input
}

export interface Rule {
  name: string;
  scope: (file: string) => boolean;

  // Tool-level gate: fires before file-operation analysis for ALL tool calls
  // Use for checks that don't map to file operations (e.g., MCP author enforcement)
  onToolCall?: (call: ToolCall) => Verdict | Promise<Verdict>;

  // Pre-phase: should this tool call proceed?
  // Async supported for handlers that need to read files (e.g., warm redirect formatting)
  onWrite?: (op: FileOperation) => Verdict | Promise<Verdict>;
  onRead?: (op: FileOperation) => Verdict | Promise<Verdict>;
  onDelete?: (op: FileOperation) => Verdict | Promise<Verdict>;

  // Post-phase: augment the result and/or perform side effects
  // Return string for additionalContext injection, or void for side-effect-only.
  // Void handlers always run. String handlers short-circuit further evaluation.
  afterRead?: (op: FileOperation, result: ToolResult) => string | void | Promise<string | void>;
  afterWrite?: (op: FileOperation, result: ToolResult) => string | void | Promise<string | void>;
}

// Lighter type for recognizer output — source is attached by the Bash analyzer
export interface RecognizerMatch {
  op: 'read' | 'write' | 'delete';
  file: string;            // may be relative (resolved by analyzer using ToolCall.cwd)
}

export interface Recognizer {
  command: string | RegExp;
  extract: (argv: string[], raw: string) => RecognizerMatch[];
}

// Handler lookup keys
export type PreHandlerKey = 'onRead' | 'onWrite' | 'onDelete';
export type PostHandlerKey = 'afterRead' | 'afterWrite';

// Maps operation type to handler key
export const PRE_HANDLER_MAP: Record<FileOperation['op'], PreHandlerKey> = {
  read: 'onRead',
  write: 'onWrite',
  delete: 'onDelete',
};

export const POST_HANDLER_MAP: Partial<Record<FileOperation['op'], PostHandlerKey>> = {
  read: 'afterRead',
  write: 'afterWrite',
};
