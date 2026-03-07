// Type stubs for @opencode-ai/plugin
// This module provides the OpenCode plugin API types

export interface HookContext {
  directory: string;
  worktree: string;
  sessionId: string;
  project?: {
    name: string;
    path: string;
  };
}

export interface PluginHooks {
  'tool.execute.before'?: (
    input: { tool: string; args: Record<string, unknown> },
    output: { args?: Record<string, unknown> }
  ) => Promise<void>;

  'tool.execute.after'?: (
    input: { tool: string; args: Record<string, unknown>; result: unknown; error?: Error }
  ) => Promise<void>;

  'stop'?: (
    input: Record<string, never>,
    output: { messages?: string[] }
  ) => Promise<void>;

  'experimental.chat.system.transform'?: (
    input: { sessionId?: string },
    output: { system: string[] }
  ) => Promise<void>;
}

export interface OpenCodeClient {
  app?: {
    log?(payload: { body: { service?: string; level?: string; message?: string; extra?: unknown } }): Promise<void>;
  };
}

/** Config hook: merge MCP servers, skills, instructions into OpenCode config. */
export interface ConfigInput {
  mcp?: Record<string, unknown>;
  /** Dir paths for skills (OpenCode may use input.skills.paths). */
  skills?: { paths?: string[] };
  /** File paths for instructions. */
  instructions?: string[];
}

/** Tool definitions from plugins: OpenCode expects Zod-based args (from @opencode-ai/plugin tool()). */
export interface Plugin {
  (ctx: {
    directory: string;
    worktree: string;
    project?: { name: string; path: string };
    client?: OpenCodeClient;
  }): Promise<PluginHooks & { config?: (input: ConfigInput) => Promise<void>; tool?: Record<string, unknown> }>;
}
