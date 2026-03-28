/**
 * OpenCode CLI-based runner - the CORRECT approach.
 * Uses `opencode run --format json` instead of the SDK HTTP server.
 */
import { spawn } from "node:child_process";
import type { WorkflowId, PromptsConfig } from "./workflows.js";
import { getTaskPromptForWorkflow } from "./workflows.js";

export interface EpisodeResult {
  /** Cumulative tokens across ALL LLM calls */
  tokens: {
    /** Sum of non-cached input tokens across all calls */
    input: number;
    output: number;
    reasoning: number;
    /** Sum of cached token reads (cheaper/free, NOT additive with input) */
    cacheRead: number;
  };
  /** Last step's input = final context window size (meaningful for comparison) */
  finalContextSize: number;
  cost: number;
  toolCalls: number;
  toolCounts: Record<string, number>;
  /** Number of LLM calls (step_finish events) */
  llmCalls: number;
  durationMs: number;
  sessionId?: string;
  error?: string;
  /** Raw JSON events from opencode --format json, for offline tiktoken analysis */
  rawEvents: unknown[];
}

export interface RunEpisodeOptions {
  cwd: string;
  taskPrompt: string;
  workflow?: WorkflowId;
  prompts?: PromptsConfig;
  /** When true, disable ChangeDown plugin via env var or config */
  disableChangeDownPlugin?: boolean;
  model?: string;
  timeoutMs?: number;
  logProgress?: boolean;
  /** If set, write full JSON event log to this file path */
  logFilePath?: string;
}

interface OpenCodeEvent {
  type: string;
  sessionID?: string;
  part?: {
    type?: string;
    tool?: string;
    cost?: number;
    tokens?: {
      input?: number;
      output?: number;
      reasoning?: number;
      cache?: { read?: number; write?: number };
    };
  };
}

interface MessageInfo {
  tokens?: {
    input?: number;
    output?: number;
    reasoning?: number;
    cache?: { read?: number; write?: number };
  };
  cost?: number;
}

/**
 * Run OpenCode via CLI with --format json to get event stream.
 * This is the correct way to run OpenCode programmatically.
 */
export async function runEpisode(options: RunEpisodeOptions): Promise<EpisodeResult> {
  const startTime = Date.now();
  const timeoutMs = options.timeoutMs ?? 600_000;

  const result: EpisodeResult = {
    tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0 },
    finalContextSize: 0,
    cost: 0,
    toolCalls: 0,
    toolCounts: {},
    llmCalls: 0,
    durationMs: 0,
    rawEvents: [],
  };

  // Collect all parsed events for transcript saving
  const rawEvents: unknown[] = [];

  // Accumulate tokens across ALL LLM calls
  const cumTokens = { input: 0, output: 0, reasoning: 0, cacheRead: 0 };
  let cumCost = 0;
  let stepCount = 0;
  let lastStepInput = 0;

  const taskPrompt =
    options.workflow != null && options.prompts
      ? getTaskPromptForWorkflow(options.workflow, options.taskPrompt, options.prompts)
      : options.taskPrompt;

  const log = options.logProgress ? (msg: string) => console.error("[cli-runner]", msg) : () => {};

  const args = [
    "run",
    "--format",
    "json",
    taskPrompt,
  ];

  if (options.model) {
    args.push("--model", options.model);
  }

  // For workflow A/D (no ChangeDown), we could set an env var or use a different agent
  // For now, just document that the workspace should not have ChangeDown plugin loaded
  if (options.disableChangeDownPlugin) {
    log("Note: To disable ChangeDown, ensure workspace has no .opencode config loading the plugin");
  }

  log(`Running: opencode ${args.join(" ")}`);
  log(`Working directory: ${options.cwd}`);

  return new Promise((resolve) => {
    const child = spawn("opencode", args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
      shell: false,
      env: {
        ...process.env,
        // Ensure SC MCP server resolves relative paths from the workspace,
        // not from wherever OpenCode's MCP subprocess inherits its CWD.
        CHANGEDOWN_PROJECT_DIR: options.cwd,
      },
    });

    const toolCounts: Record<string, number> = {};
    let sessionId: string | undefined;

    // Optional: log all events to file (use sync writes in callback)
    let logFd: number | undefined;
    if (options.logFilePath) {
      const fs = require("fs");
      logFd = fs.openSync(options.logFilePath, "w");
    }

    // Parse JSON events from stdout
    let buffer = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;

        // Write raw event to log file
        if (logFd !== undefined) {
          const fs = require("fs");
          fs.writeSync(logFd, line + "\n");
        }

        try {
          const event = JSON.parse(line) as OpenCodeEvent;
          rawEvents.push(event);

          // Extract session ID from any event (top level)
          if (event.sessionID && !sessionId) {
            sessionId = event.sessionID;
            log(`Session ID: ${sessionId}`);
          }

          // Track tool calls - events with type "tool_use" (note: NOT "tool")
          if (event.type === "tool_use" && event.part?.tool) {
            const toolName = event.part.tool;
            toolCounts[toolName] = (toolCounts[toolName] ?? 0) + 1;
            log(`Tool: ${toolName}`);
          }

          // ACCUMULATE token/cost from EVERY step_finish event
          if (event.type === "step_finish" && event.part) {
            stepCount++;
            const t = event.part.tokens;
            if (t) {
              const stepIn = t.input ?? 0;
              cumTokens.input += stepIn;
              cumTokens.output += t.output ?? 0;
              cumTokens.reasoning += t.reasoning ?? 0;
              cumTokens.cacheRead += t.cache?.read ?? 0;
              lastStepInput = stepIn + (t.cache?.read ?? 0); // full context = new + cached
              log(
                `Step ${stepCount}: in=${stepIn} out=${t.output ?? 0} cache=${t.cache?.read ?? 0} ctx=${lastStepInput}`
              );
            }
            if (event.part.cost != null) {
              cumCost += event.part.cost;
            }
          }
        } catch (err) {
          // Ignore parse errors for non-JSON lines
        }
      }
    });

    // Parse stderr for JSON events too - they might be there
    let stderrBuffer = "";
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderrBuffer += text;

      // Try to parse as JSON events
      const lines = stderrBuffer.split("\n");
      stderrBuffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;

        // Write raw event to log file
        if (logFd !== undefined) {
          const fs = require("fs");
          fs.writeSync(logFd, line + "\n");
        }

        try {
          const event = JSON.parse(line) as OpenCodeEvent;
          rawEvents.push(event);

          // Process events from stderr (same structure as stdout)
          if (event.sessionID && !sessionId) {
            sessionId = event.sessionID;
            log(`Session ID (stderr): ${sessionId}`);
          }

          if (event.type === "tool_use" && event.part?.tool) {
            const toolName = event.part.tool;
            toolCounts[toolName] = (toolCounts[toolName] ?? 0) + 1;
            log(`Tool (stderr): ${toolName}`);
          }

          if (event.type === "step_finish" && event.part) {
            stepCount++;
            const t = event.part.tokens;
            if (t) {
              cumTokens.input += t.input ?? 0;
              cumTokens.output += t.output ?? 0;
              cumTokens.reasoning += t.reasoning ?? 0;
              cumTokens.cacheRead += t.cache?.read ?? 0;
              // cacheWrite tracked but not reported (not meaningful for comparison)
            }
            if (event.part.cost != null) {
              cumCost += event.part.cost;
            }
          }
        } catch (err) {
          // Not JSON - just log if verbose
          if (options.logProgress && line.trim()) {
            console.error(line);
          }
        }
      }
    });

    child.on("close", (code) => {
      // Close log file
      if (logFd !== undefined) {
        const fs = require("fs");
        fs.closeSync(logFd);
      }

      const durationMs = Date.now() - startTime;

      if (code !== 0 && code !== null) {
        result.error = `opencode exited with code ${code}`;
      }

      // Use ACCUMULATED totals across all LLM calls
      result.tokens = {
        input: cumTokens.input,
        output: cumTokens.output,
        reasoning: cumTokens.reasoning,
        cacheRead: cumTokens.cacheRead,
      };
      result.finalContextSize = lastStepInput;
      result.cost = cumCost;
      result.llmCalls = stepCount;

      result.toolCounts = toolCounts;
      result.toolCalls = Object.values(toolCounts).reduce((a, b) => a + b, 0);
      result.durationMs = durationMs;
      result.sessionId = sessionId;
      result.rawEvents = rawEvents;

      log(`Completed in ${durationMs}ms with ${result.toolCalls} tool calls`);
      resolve(result);
    });

    child.on("error", (err) => {
      result.error = err.message;
      result.durationMs = Date.now() - startTime;
      resolve(result);
    });

    // Handle timeout
    setTimeout(() => {
      if (!child.killed) {
        log("Timeout reached, killing process");
        child.kill("SIGTERM");
        result.error = `Timeout after ${timeoutMs}ms`;
      }
    }, timeoutMs);
  });
}
