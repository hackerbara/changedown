#!/usr/bin/env tsx
/**
 * Benchmark Token Analyzer
 *
 * Post-processes events.jsonl from benchmark runs to produce per-tool token
 * breakdowns and verify API-reported totals.
 *
 * Usage:
 *   npx tsx packages/benchmarks/harness/analyze-tokens.ts <run-dir>
 *   npx tsx packages/benchmarks/harness/analyze-tokens.ts --all
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { encoding_for_model } from "tiktoken";

// ── Types ──────────────────────────────────────────────────────────────

export interface ToolCall {
  tool: string;
  rawInput: unknown;
  rawOutput: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface StepTokens {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
}

export interface StepGroup {
  stepIndex: number;
  apiTokens: StepTokens;
  toolCalls: ToolCall[];
}

// ── Event Parsing ──────────────────────────────────────────────────────

export function parseEventsFromLines(lines: string[]): StepGroup[] {
  const steps: StepGroup[] = [];
  let currentToolCalls: ToolCall[] = [];
  let stepIndex = 0;

  for (const line of lines) {
    if (!line.trim()) continue;

    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      continue; // skip non-JSON lines
    }

    if (event.type === "step_start") {
      currentToolCalls = [];
    } else if (event.type === "tool_use" && event.part?.state) {
      const state = event.part.state;
      const output =
        typeof state.output === "string"
          ? state.output
          : JSON.stringify(state.output ?? "");
      currentToolCalls.push({
        tool: event.part.tool,
        rawInput: state.input,
        rawOutput: output,
      });
    } else if (event.type === "step_finish" && event.part?.tokens) {
      const t = event.part.tokens;
      steps.push({
        stepIndex: stepIndex++,
        apiTokens: {
          input: t.input ?? 0,
          output: t.output ?? 0,
          reasoning: t.reasoning ?? 0,
          cacheRead: t.cache?.read ?? 0,
        },
        toolCalls: currentToolCalls,
      });
      currentToolCalls = [];
    }
  }

  return steps;
}

// ── Tokenization ───────────────────────────────────────────────────────

let _enc: ReturnType<typeof encoding_for_model> | null = null;

function getEncoder() {
  if (!_enc) _enc = encoding_for_model("gpt-4o"); // cl100k_base
  return _enc;
}

export function countTokens(text: string): number {
  return getEncoder().encode(text).length;
}

export function tokenizeToolCalls(steps: StepGroup[]): StepGroup[] {
  for (const step of steps) {
    for (const tc of step.toolCalls) {
      const inputStr =
        typeof tc.rawInput === "string"
          ? tc.rawInput
          : JSON.stringify(tc.rawInput);
      tc.inputTokens = countTokens(inputStr);
      tc.outputTokens = countTokens(tc.rawOutput);
    }
  }
  return steps;
}

// ── Aggregation ────────────────────────────────────────────────────────

export interface PerToolSummary {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  avgInputPerCall: number;
  avgOutputPerCall: number;
}

export function aggregateByTool(
  steps: StepGroup[]
): Record<string, PerToolSummary> {
  const acc: Record<string, { calls: number; input: number; output: number }> =
    {};

  for (const step of steps) {
    for (const tc of step.toolCalls) {
      if (!acc[tc.tool]) acc[tc.tool] = { calls: 0, input: 0, output: 0 };
      acc[tc.tool].calls++;
      acc[tc.tool].input += tc.inputTokens ?? 0;
      acc[tc.tool].output += tc.outputTokens ?? 0;
    }
  }

  const result: Record<string, PerToolSummary> = {};
  for (const [tool, data] of Object.entries(acc)) {
    result[tool] = {
      calls: data.calls,
      inputTokens: data.input,
      outputTokens: data.output,
      avgInputPerCall: data.calls > 0 ? data.input / data.calls : 0,
      avgOutputPerCall: data.calls > 0 ? data.output / data.calls : 0,
    };
  }
  return result;
}

// ── Report Types ───────────────────────────────────────────────────────

export interface TokenAuditReport {
  verification: {
    apiReported: { input: number; output: number; reasoning: number; cacheRead: number };
    toolPayloadTokens: { totalInput: number; totalOutput: number };
    accountingGap: number;
  };
  perTool: Record<string, PerToolSummary>;
  perStep: Array<{
    step: number;
    apiTokens: StepTokens;
    toolCalls: Array<{ tool: string; inputTokens: number; outputTokens: number }>;
  }>;
  meta: {
    tokenizer: string;
    analyzedAt: string;
  };
}

// ── Report Builder ─────────────────────────────────────────────────────

export function buildAuditReport(
  steps: StepGroup[],
  summaryTokens: { input: number; output: number; reasoning: number; cacheRead: number }
): TokenAuditReport {
  const perTool = aggregateByTool(steps);

  let totalToolInput = 0;
  let totalToolOutput = 0;
  for (const step of steps) {
    for (const tc of step.toolCalls) {
      totalToolInput += tc.inputTokens ?? 0;
      totalToolOutput += tc.outputTokens ?? 0;
    }
  }

  const apiTotal =
    summaryTokens.input + summaryTokens.output + summaryTokens.reasoning + summaryTokens.cacheRead;
  const toolTotal = totalToolInput + totalToolOutput;
  const accountingGap = apiTotal > 0 ? (apiTotal - toolTotal) / apiTotal : 0;

  const perStep = steps.map((s) => ({
    step: s.stepIndex,
    apiTokens: s.apiTokens,
    toolCalls: s.toolCalls.map((tc) => ({
      tool: tc.tool,
      inputTokens: tc.inputTokens ?? 0,
      outputTokens: tc.outputTokens ?? 0,
    })),
  }));

  return {
    verification: {
      apiReported: summaryTokens,
      toolPayloadTokens: { totalInput: totalToolInput, totalOutput: totalToolOutput },
      accountingGap,
    },
    perTool,
    perStep,
    meta: {
      tokenizer: "tiktoken/cl100k_base",
      analyzedAt: new Date().toISOString(),
    },
  };
}

// ── File I/O ───────────────────────────────────────────────────────────

export function analyzeRunDirectory(dir: string): TokenAuditReport {
  const eventsPath = join(dir, "events.jsonl");
  const summaryPath = join(dir, "summary.json");

  if (!existsSync(eventsPath)) {
    throw new Error(`Missing events.jsonl in ${dir}`);
  }
  if (!existsSync(summaryPath)) {
    throw new Error(`Missing summary.json in ${dir}`);
  }

  const lines = readFileSync(eventsPath, "utf-8").split("\n");
  const summary = JSON.parse(readFileSync(summaryPath, "utf-8"));

  const steps = parseEventsFromLines(lines);
  tokenizeToolCalls(steps);

  const summaryTokens = {
    input: summary.tokens?.input ?? 0,
    output: summary.tokens?.output ?? 0,
    reasoning: summary.tokens?.reasoning ?? 0,
    cacheRead: summary.tokens?.cacheRead ?? 0,
  };

  const report = buildAuditReport(steps, summaryTokens);

  writeFileSync(join(dir, "token-audit.json"), JSON.stringify(report, null, 2));

  return report;
}

// ── CLI ────────────────────────────────────────────────────────────────

function findRunDirectories(baseDir: string): string[] {
  const dirs: string[] = [];
  for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = join(baseDir, entry.name);
    if (
      existsSync(join(candidate, "events.jsonl")) &&
      existsSync(join(candidate, "summary.json"))
    ) {
      dirs.push(candidate);
    }
  }
  return dirs.sort();
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: analyze-tokens <run-dir> | --all [results-base-dir]");
    process.exit(1);
  }

  if (args[0] === "--all") {
    const baseDir = resolve(args[1] ?? "results");
    const dirs = findRunDirectories(baseDir);
    if (dirs.length === 0) {
      console.error(`No run directories found in ${baseDir}`);
      process.exit(1);
    }

    console.log(`Analyzing ${dirs.length} runs in ${baseDir}...`);
    for (const dir of dirs) {
      try {
        const report = analyzeRunDirectory(dir);
        const toolCount = Object.keys(report.perTool).length;
        const gap = (report.verification.accountingGap * 100).toFixed(1);
        console.log(`  ${dir}: ${toolCount} tools, ${gap}% gap`);
      } catch (err: any) {
        console.error(`  ${dir}: ERROR — ${err.message}`);
      }
    }
  } else {
    const dir = resolve(args[0]);
    const report = analyzeRunDirectory(dir);
    console.log(JSON.stringify(report, null, 2));
  }
}

// Run if executed directly (works with both tsx and node ESM)
const entryScript = process.argv[1] ?? "";
if (entryScript.endsWith("analyze-tokens.ts") || entryScript.endsWith("analyze-tokens.js")) {
  main();
}
