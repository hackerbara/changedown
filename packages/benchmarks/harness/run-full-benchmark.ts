/**
 * Full benchmark: run all surfaces (A/B/C/D) × tasks (1-4) with transcript capture.
 * Run from repo root: node packages/benchmark-harness/dist/run-full-benchmark.js
 *
 * Environment variables:
 *   MODEL=anthropic/claude-sonnet-4-5  (default: opencode/kimi-k2.5-free)
 *   TASKS=task1,task2                   (default: all tasks)
 *   SURFACES=A,B                        (default: all surfaces)
 *   RESULTS_DIR=./results               (default: ./results)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createTempWorkspace, cpRecursive } from "./workspace.js";

const execFileAsync = promisify(execFile);
import { runEpisode, type EpisodeResult } from "./opencode-cli-runner.js";
import type { SurfaceId, TaskId, BenchmarkPrompts } from "./workflows.js";
import { getTaskPromptForSurface } from "./workflows.js";
import { generateToolCallReport } from "./tool-call-report.js";
import { verify, type VerificationResult } from "./verify.js";

const BENCHMARK_FIXTURE_ROOT = path.join(process.cwd(), "packages", "benchmarks", "fixtures");

/**
 * Extract a short, filesystem-safe model identifier from a full model string.
 * Examples:
 *   "anthropic/claude-sonnet-4-5"  → "sonnet-4-5"
 *   "opencode/minimax-m2.5-free"   → "minimax-m2.5"
 *   "opencode/kimi-k2.5-free"      → "kimi-k2.5"
 *   "anthropic/claude-opus-4"      → "opus-4"
 *   "google/gemini-2.0-flash"      → "gemini-2.0-flash"
 */
function sanitizeModelId(model: string): string {
  // Strip provider prefix (everything before and including the first "/")
  let id = model.includes("/") ? model.split("/").slice(1).join("/") : model;

  // Strip "claude-" prefix since the model family (sonnet, opus, haiku) is sufficient
  id = id.replace(/^claude-/, "");

  // Strip "-free" suffix (common for free-tier models, not informative)
  id = id.replace(/-free$/, "");

  // Replace any remaining filesystem-unsafe characters
  id = id.replace(/[^a-zA-Z0-9._-]/g, "-");

  return id;
}

interface RunResult {
  surface: SurfaceId;
  task: TaskId;
  model: string;
  success: boolean;
  result: EpisodeResult;
  quality?: VerificationResult;
}

async function saveTranscript(
  resultDir: string,
  surface: SurfaceId,
  taskId: TaskId,
  modelStr: string,
  result: EpisodeResult,
  workspaceDir: string
): Promise<void> {
  await fs.mkdir(resultDir, { recursive: true });

  // Save raw event stream as JSONL
  await fs.writeFile(
    path.join(resultDir, "events.jsonl"),
    result.rawEvents.map((e) => JSON.stringify(e)).join("\n") + "\n"
  );

  // Save summary
  const summary = {
    meta: {
      surface,
      taskId,
      model: modelStr,
      sessionId: result.sessionId,
      durationMs: result.durationMs,
    },
    tokens: result.tokens,
    finalContextSize: result.finalContextSize,
    cost: result.cost,
    toolSummary: {
      totalCalls: result.toolCalls,
      byTool: result.toolCounts,
      llmCalls: result.llmCalls,
    },
  };
  await fs.writeFile(
    path.join(resultDir, "summary.json"),
    JSON.stringify(summary, null, 2)
  );

  // Generate tool call report
  generateToolCallReport(result.rawEvents, summary, resultDir);

  // Snapshot workspace after-state (exclude .git, node_modules, .opencode)
  const afterDir = path.join(resultDir, "after");
  try {
    await cpRecursive(workspaceDir, afterDir, [
      ".git",
      "node_modules",
      ".opencode",
    ]);
  } catch (err) {
    console.error(`  Warning: failed to snapshot after-state: ${err}`);
  }
}

/**
 * Git setup for task4_git: create a two-commit history from base.md and changed.md.
 * After setup, the workspace has a single file `reviewed-doc.md` with:
 *   - HEAD~1: the original document (base version)
 *   - HEAD: the document with all 3 proposed changes applied
 */
async function task4GitSetup(tempDir: string): Promise<void> {
  const basePath = path.join(tempDir, "base.md");
  const changedPath = path.join(tempDir, "changed.md");
  const docPath = path.join(tempDir, "reviewed-doc.md");

  const baseContent = await fs.readFile(basePath, "utf-8");
  const changedContent = await fs.readFile(changedPath, "utf-8");

  // Reset to base version: write base as the doc, remove staging files
  await fs.writeFile(docPath, baseContent);
  await fs.unlink(basePath);
  await fs.unlink(changedPath);

  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: "bench",
    GIT_AUTHOR_EMAIL: "bench@test",
    GIT_COMMITTER_NAME: "bench",
    GIT_COMMITTER_EMAIL: "bench@test",
  };

  // Amend the initial commit to have just the base document
  await execFileAsync("git", ["add", "-A"], { cwd: tempDir });
  await execFileAsync("git", ["commit", "--amend", "-m", "Initial API caching strategy document"], {
    cwd: tempDir,
    env: gitEnv,
  });

  // Apply changes and create second commit
  await fs.writeFile(docPath, changedContent);
  await execFileAsync("git", ["add", "-A"], { cwd: tempDir });
  await execFileAsync("git", ["commit", "-m", "Proposed changes: add edge cache perf note, change REST to GraphQL, remove Redis cache layer"], {
    cwd: tempDir,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "ai-reviewer",
      GIT_AUTHOR_EMAIL: "ai@review.test",
      GIT_COMMITTER_NAME: "ai-reviewer",
      GIT_COMMITTER_EMAIL: "ai@review.test",
    },
  });
}

async function main(): Promise<void> {
  const allSurfaces: SurfaceId[] = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const allTasks: TaskId[] = ["task1", "task2", "task3", "task4", "task5", "task6_patch"];

  const modelOverride = process.env.MODEL || "opencode/kimi-k2.5-free";
  const surfaces = process.env.SURFACES
    ? (process.env.SURFACES.split(",") as SurfaceId[])
    : allSurfaces;
  const taskIds = process.env.TASKS
    ? (process.env.TASKS.split(",") as TaskId[])
    : allTasks;
  const resultsDir = path.resolve(
    process.cwd(),
    process.env.RESULTS_DIR || "results"
  );

  console.log(
    `Benchmark: ${surfaces.length} surfaces × ${taskIds.length} tasks`
  );
  console.log(`Model: ${modelOverride}`);
  console.log(`Results: ${resultsDir}\n`);

  // Load prompts
  const promptsPath = path.join(BENCHMARK_FIXTURE_ROOT, "prompts.json");
  await fs.access(promptsPath).catch(() => {
    throw new Error(
      `Prompts not found: ${promptsPath}. Run from repo root.`
    );
  });
  const promptsJson = await fs.readFile(promptsPath, "utf-8");
  const prompts = JSON.parse(promptsJson) as BenchmarkPrompts;

  await fs.mkdir(resultsDir, { recursive: true });

  // Validate Surface D prerequisites before starting runs
  if (surfaces.includes("D")) {
    const cliPath = path.join(process.cwd(), "changedown-plugin", "mcp-server", "dist", "cli.js");
    try {
      await fs.access(cliPath);
    } catch {
      throw new Error(
        `Surface D requires sc CLI at ${cliPath}. Run: npm run build:plugin`
      );
    }
    console.log(`✓ Surface D CLI found at ${cliPath}`);
  }

  const results: RunResult[] = [];

  for (const taskId of taskIds) {
    const task = prompts.tasks[taskId];
    if (!task) {
      console.log(`Skipping unknown task: ${taskId}`);
      continue;
    }
    const fixtureDir = path.join(BENCHMARK_FIXTURE_ROOT, task.fixtureDir);
    await fs.access(fixtureDir).catch(() => {
      throw new Error(`Fixture dir not found: ${fixtureDir}`);
    });

    console.log(`\n=== ${taskId}: ${task.description.slice(0, 60)}... ===`);

    for (const surface of surfaces) {
      const prompt = getTaskPromptForSurface(task, surface, prompts.constraint);
      if (!prompt) {
        console.log(`  Skipping ${surface}-${taskId} (no surface instruction)`);
        continue;
      }

      console.log(`\n  --- Surface ${surface} ---`);

      const needsChangeDown = surface !== "A";
      const isCompact = surface === "C" || surface === "D" || surface === "E" || surface === "G";
      const protocolMode = isCompact ? "compact" as const : "classic" as const;
      const disableMcpPlugin = surface === "D";
      const isV1 = surface === "F" || surface === "G" || surface === "H";
      const patchWrapExperimental = surface === "H";

      const tempDir = await createTempWorkspace(fixtureDir, {
        gitInit: true,
        injectChangeDown: needsChangeDown,
        protocolMode: needsChangeDown ? protocolMode : undefined,
        disableChangeDownPlugin: disableMcpPlugin,
        v1Config: isV1,
        patchWrapExperimental,
        // @ts-expect-error gitSetup not yet in CreateTempWorkspaceOptions type
        gitSetup: taskId === ("task4_git" as string) ? task4GitSetup : undefined,
      });
      console.log(`  Workspace: ${tempDir}`);

      const result = await runEpisode({
        cwd: tempDir,
        taskPrompt: prompt,
        disableChangeDownPlugin: surface === "A" || surface === "D",
        model: modelOverride,
        timeoutMs: 600_000,
        logProgress: true,
      });

      const success = !result.error;

      console.log(
        `  ${success ? "✓" : "✗"} ${result.toolCalls} tools, ${result.llmCalls} llm-calls, ctx=${result.finalContextSize}, in=${result.tokens.input} out=${result.tokens.output} cache=${result.tokens.cacheRead}, ${Math.round(result.durationMs / 1000)}s, ${result.rawEvents.length} events`
      );

      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }

      // Save transcript — include model in path to prevent cross-model overwrites
      const modelId = sanitizeModelId(modelOverride);
      const runDir = path.join(resultsDir, `${surface}-${taskId}_${modelId}`);
      await saveTranscript(runDir, surface, taskId, modelOverride, result, tempDir);
      console.log(`  Saved: ${runDir}/`);

      // Quality verification (if assertions exist for this task)
      const taskConfig = prompts.tasks[taskId]!;
      const assertionsPath = path.join(BENCHMARK_FIXTURE_ROOT, taskConfig.fixtureDir, "assertions.json");
      let quality: VerificationResult | undefined;
      try {
        await fs.access(assertionsPath);
        const afterDir = path.join(runDir, "after");
        quality = await verify(afterDir, assertionsPath, surface);
        console.log(`  Quality: ${quality.corrections.score}/${quality.corrections.max} corrections, ${quality.decisions.correct}/${quality.decisions.total} decisions, ${quality.regressions.count} regressions`);
      } catch {
        // No assertions file for this task — skip quality verification
      }

      results.push({ surface, task: taskId, model: modelOverride, success, result, quality });
    }
  }

  // Write aggregate report
  const reportPath = path.join(resultsDir, "benchmark-report.json");
  await fs.writeFile(
    reportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        model: modelOverride,
        surfaces,
        tasks: taskIds,
        results: results.map(({ surface, task, model, success, result, quality }) => ({
          surface,
          task,
          model,
          success,
          tokens: result.tokens,
          finalContextSize: result.finalContextSize,
          cost: result.cost,
          toolCalls: result.toolCalls,
          toolCounts: result.toolCounts,
          llmCalls: result.llmCalls,
          durationMs: result.durationMs,
          eventCount: result.rawEvents.length,
          error: result.error,
          quality: quality ? {
            corrections: { score: quality.corrections.score, max: quality.corrections.max, accuracy: quality.corrections.accuracy, byCategory: quality.corrections.byCategory },
            decisions: { correct: quality.decisions.correct, total: quality.decisions.total, accuracy: quality.decisions.accuracy },
            regressions: { count: quality.regressions.count },
            overallAccuracy: quality.overallAccuracy,
          } : undefined,
        })),
      },
      null,
      2
    )
  );
  console.log(`\n✓ Report: ${reportPath}`);

  // Summary table
  console.log("\n=== Summary ===");
  const header = `${"Surface"} ${"Task".padEnd(8)} ${"Status".padEnd(8)} ${"Tools".padEnd(6)} ${"LLM".padEnd(5)} ${"Input".padEnd(8)} ${"Output".padEnd(8)} ${"Cache".padEnd(8)} ${"Events".padEnd(8)} ${"Time"}`;
  console.log(header);
  console.log("-".repeat(header.length));
  for (const r of results) {
    console.log(
      `${r.surface.padEnd(8)} ${r.task.padEnd(8)} ${(r.success ? "OK" : "FAIL").padEnd(8)} ${String(r.result.toolCalls).padEnd(6)} ${String(r.result.llmCalls).padEnd(5)} ${String(r.result.tokens.input).padEnd(8)} ${String(r.result.tokens.output).padEnd(8)} ${String(r.result.tokens.cacheRead).padEnd(8)} ${String(r.result.rawEvents.length).padEnd(8)} ${Math.round(r.result.durationMs / 1000)}s`
    );
  }

  // Quality summary (if any results have quality data)
  const qualityResults = results.filter((r) => r.quality);
  if (qualityResults.length > 0) {
    console.log("\n=== Quality ===");
    for (const r of qualityResults) {
      const q = r.quality!;
      const parts: string[] = [`${r.surface.padEnd(4)} ${r.task.padEnd(12)}`];
      if (q.corrections.max > 0) {
        parts.push(`${q.corrections.score}/${q.corrections.max} (${(q.corrections.accuracy * 100).toFixed(1)}%)`);
      }
      if (q.decisions.total > 0) {
        parts.push(`decisions: ${q.decisions.correct}/${q.decisions.total}`);
      }
      parts.push(`regressions: ${q.regressions.count}`);
      console.log(`  ${parts.join("  ")}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
