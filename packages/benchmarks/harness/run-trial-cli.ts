/**
 * Single-episode trial using the CLI runner (CORRECT approach).
 * Run from repo root: WORKFLOW=A MODEL=lmstudio/qwen/qwen3-30b-a3b-2507 node packages/benchmark-harness/dist/run-trial-cli.js
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createTempWorkspace } from "./workspace.js";
import { runEpisode } from "./opencode-cli-runner.js";
import type { PromptsConfig, WorkflowId } from "./workflows.js";

const FIXTURE_DIR = path.join(process.cwd(), "packages", "benchmarks", "fixtures", "benchmark-adr");

async function main(): Promise<void> {
  const workflow = (process.env.WORKFLOW || "A") as WorkflowId;
  if (!["A", "B", "C", "D"].includes(workflow)) {
    throw new Error(`Invalid WORKFLOW="${workflow}". Must be A, B, C, or D.`);
  }

  const fixtureDir = path.isAbsolute(FIXTURE_DIR) ? FIXTURE_DIR : path.resolve(process.cwd(), FIXTURE_DIR);
  await fs.access(fixtureDir).catch(() => {
    throw new Error(`Fixture dir not found: ${fixtureDir}. Run from repo root.`);
  });

  const promptsPath = path.join(fixtureDir, "prompts.json");
  const promptsJson = await fs.readFile(promptsPath, "utf-8");
  const prompts = JSON.parse(promptsJson) as PromptsConfig;

  // All workspaces go to /tmp/ for full isolation (own git root).
  // B & C get SC injected: .opencode/opencode.json + .changetracks/config.toml
  const needsChangeTracks = workflow === "B" || workflow === "C";
  const tempDir = await createTempWorkspace(fixtureDir, {
    gitInit: true,
    injectChangeTracks: needsChangeTracks,
  });

  console.log(`Temp workspace: ${tempDir}`);
  console.log(`SC plugin: ${needsChangeTracks ? "INJECTED" : "none"}`);
  console.log(`Running workflow ${workflow} (SC ${needsChangeTracks ? "enabled" : "disabled"}) via CLI...\n`);

  const result = await runEpisode({
    cwd: tempDir,
    taskPrompt: prompts.taskDescription,
    workflow,
    prompts,
    disableChangeTracksPlugin: !needsChangeTracks,
    model: process.env.MODEL || "opencode/kimi-k2.5-free",
    timeoutMs: 600_000,
    logProgress: true,
  });

  console.log("\nEpisodeResult:", JSON.stringify(result, null, 2));
  process.exit(result.error ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
