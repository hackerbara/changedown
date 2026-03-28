/**
 * Single-episode trial: workflow A with ChangeDown plugin disabled.
 * Run from repo root: node packages/benchmark-harness/dist/run-trial.js
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createTempWorkspace } from "./workspace.js";
import { runEpisode } from "./opencode-runner.js";
import type { PromptsConfig } from "./workflows.js";

const FIXTURE_DIR = path.join(process.cwd(), "packages", "benchmarks", "fixtures", "benchmark-adr");

async function main(): Promise<void> {
  const fixtureDir = path.isAbsolute(FIXTURE_DIR) ? FIXTURE_DIR : path.resolve(process.cwd(), FIXTURE_DIR);
  await fs.access(fixtureDir).catch(() => {
    throw new Error(`Fixture dir not found: ${fixtureDir}. Run from repo root.`);
  });

  const promptsPath = path.join(fixtureDir, "prompts.json");
  const promptsJson = await fs.readFile(promptsPath, "utf-8");
  const prompts = JSON.parse(promptsJson) as PromptsConfig;

  const tempDir = await createTempWorkspace(fixtureDir, { inside: "." });
  console.log("Temp workspace (inside repo):", tempDir);
  console.log("Running workflow A (plugin disabled)...\n");

  const serverUrl = process.env.OPENCODE_SERVER_URL;
  const result = await runEpisode({
    cwd: tempDir,
    taskPrompt: prompts.taskDescription,
    workflow: "A",
    prompts,
    disableChangeDownPlugin: true,
    timeoutMs: 300_000,
    logProgress: true,
    serverUrl: serverUrl || undefined,
  });

  console.log("EpisodeResult:", JSON.stringify(result, null, 2));
  process.exit(result.error ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
