import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk";
import type { Event } from "@opencode-ai/sdk";
import { getAvailablePort } from "./port.js";
import type { PromptsConfig } from "./workflows.js";
import { getTaskPromptForWorkflow } from "./workflows.js";
import type { WorkflowId } from "./workflows.js";

export interface EpisodeResult {
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cache?: { read: number; write: number };
  };
  cost?: number;
  toolCalls: number;
  toolCounts: Record<string, number>;
  roundTrips: number;
  durationMs?: number;
  rawMessage?: unknown;
  error?: string;
}

export interface RunEpisodeOptions {
  cwd: string;
  taskPrompt: string;
  workflow?: WorkflowId;
  prompts?: PromptsConfig;
  /** When true, pass plugin: [] so OpenCode does not load ChangeTracks (sharp baseline for A/D). */
  disableChangeTracksPlugin?: boolean;
  model?: string;
  timeoutMs?: number;
  /** Log progress to stderr (e.g. "[runner] Server up") */
  logProgress?: boolean;
  /** If set, connect to this server URL instead of spawning one (e.g. http://127.0.0.1:4096). Use when you run `opencode serve` manually. */
  serverUrl?: string;
}

/**
 * Run a single episode: create OpenCode server, create session, send prompt,
 * wait for completion, collect token/cost and tool-call metrics.
 */
export async function runEpisode(options: RunEpisodeOptions): Promise<EpisodeResult> {
  const timeoutMs = options.timeoutMs ?? 600_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const result: EpisodeResult = {
    tokens: { input: 0, output: 0, reasoning: 0 },
    toolCalls: 0,
    toolCounts: {},
    roundTrips: 0,
  };

  const taskPrompt =
    options.workflow != null && options.prompts
      ? getTaskPromptForWorkflow(options.workflow, options.taskPrompt, options.prompts)
      : options.taskPrompt;

  const log = options.logProgress ? (msg: string) => console.error("[runner]", msg) : () => {};
  let server: { url: string; close: () => void } | undefined;
  const startTime = Date.now();

  const pluginConfig = options.disableChangeTracksPlugin === true
    ? { plugin: [] as string[] }
    : { plugin: ["@changetracks/opencode-plugin"] as string[] };
  const modelStr = options.model ?? "anthropic/claude-sonnet-4-5";
  const [providerID, modelID] = modelStr.includes("/") ? modelStr.split("/", 2) : ["anthropic", "claude-sonnet-4-5"];

  try {
    let client: Awaited<ReturnType<typeof createOpencode>>["client"];
    if (options.serverUrl) {
      log(`Connecting to existing server at ${options.serverUrl}`);
      client = createOpencodeClient({ baseUrl: options.serverUrl });
    } else {
      log("Getting port...");
      const port = await getAvailablePort(4096);
      log(`Port ${port}; starting OpenCode server (plugin ${options.disableChangeTracksPlugin === true ? "off" : "on"})...`);
      const created = await createOpencode({
        port,
        signal: controller.signal,
        timeout: 60_000,
        config: {
          model: modelStr,
          permission: { edit: "allow", bash: "allow" },
          ...pluginConfig,
        },
      });
      client = created.client;
      server = created.server;
    }
    log("Server ready; creating session...");

    const createRes = await client.session.create({
      body: { title: "benchmark-run" },
      query: { directory: options.cwd },
    });
    const createPayload = createRes as { data?: unknown; error?: unknown };
    const sessionData = createPayload.data;
    const sessionId = typeof sessionData === "object" && sessionData !== null && "id" in sessionData ? (sessionData as { id: string }).id : undefined;
    if (!sessionId) {
      result.error = "Failed to create session";
      if (options.logProgress && (createPayload.error || createPayload.data)) {
        console.error("[runner] session.create error:", createPayload.error, "data:", JSON.stringify(createPayload.data));
      }
      return result;
    }
    log("Subscribing to event stream (for session.idle + tool counts)...");
    const toolCounts: Record<string, number> = {};
    let idleResolved = false;
    let seenBusy = false;
    const idlePromise = new Promise<void>((resolve) => {
      const checkIdle = (): void => {
        if (idleResolved) return;
        if (!seenBusy) return;
        idleResolved = true;
        resolve();
      };
      void client.event.subscribe({ query: { directory: options.cwd } }).then((sse) => {
        (async () => {
          try {
            for await (const event of sse.stream as AsyncGenerator<Event>) {
              if (event.type === "session.status") {
                const props = (event as { properties?: { sessionID?: string; status?: { type?: string } } }).properties;
                if (props?.sessionID === sessionId && props?.status?.type === "busy") seenBusy = true;
              }
              if (event.type === "session.idle") {
                const props = (event as { properties?: { sessionID?: string } }).properties;
                if (props?.sessionID === sessionId) checkIdle();
              }
              if (event.type === "message.part.updated") {
                const props = (event as { properties?: { part?: unknown } }).properties;
                const part = props?.part as
                  | { type?: string; tool?: string; state?: { status?: string } }
                  | undefined;
                if (part?.type === "tool" && typeof part.tool === "string") {
                  const status = part.state?.status;
                  if (status === "completed") {
                    toolCounts[part.tool] = (toolCounts[part.tool] ?? 0) + 1;
                  }
                }
              }
            }
          } catch {
            // stream ended or error
          }
        })();
      });
    });

    // Use synchronous prompt(): it blocks until the agent turn completes and returns the assistant
    // message with tokens. Use a long timeout so we don't abort mid-turn.
    const promptTimeoutMs = Math.min(timeoutMs, 10 * 60 * 1000);
    log(`Sending prompt (sync, timeout ${promptTimeoutMs / 1000}s)...`);
    const promptRes = await Promise.race([
      client.session.prompt({
        path: { id: sessionId },
        query: { directory: options.cwd },
        body: {
          model: { providerID, modelID },
          parts: [{ type: "text" as const, text: taskPrompt }],
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`session.prompt timed out after ${promptTimeoutMs / 1000}s`)), promptTimeoutMs)
      ),
    ]);
    log("Prompt returned; extracting metrics...");
    if (options.logProgress) {
      const hasData = (promptRes as { data?: unknown }).data !== undefined;
      const dataKeys = (promptRes as { data?: Record<string, unknown> }).data ? Object.keys((promptRes as { data: Record<string, unknown> }).data) : [];
      console.error("[runner] prompt response hasData:", hasData, "dataKeys:", dataKeys);
    }

    const response = promptRes as {
      data?: { info?: { tokens?: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } }; cost?: number } };
      error?: unknown;
    };
    if (response.error) {
      result.error = String(response.error);
    }
    const info = response.data?.info;
    if (info) {
      result.rawMessage = info;
      if (info.tokens) {
        result.tokens = {
          input: info.tokens.input ?? 0,
          output: info.tokens.output ?? 0,
          reasoning: info.tokens.reasoning ?? 0,
          cache: info.tokens.cache ? { read: info.tokens.cache.read ?? 0, write: info.tokens.cache.write ?? 0 } : undefined,
        };
      }
      if (typeof info.cost === "number") result.cost = info.cost;
    }

    result.toolCounts = toolCounts;
    result.toolCalls = Object.values(toolCounts).reduce((a, b) => a + b, 0);
    result.roundTrips = result.toolCalls;
    result.durationMs = Date.now() - startTime;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(timeoutId);
    if (server) server.close();
  }

  return result;
}
