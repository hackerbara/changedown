/**
 * Tool Call Report Generator
 *
 * Produces a human-readable markdown report (tool-calls.md) from benchmark
 * events.jsonl data. Shows the full tool call sequence, response quality
 * indicators, and efficiency metrics.
 *
 * Called automatically at the end of each benchmark run, or standalone:
 *   npx tsx packages/benchmarks/harness/tool-call-report.ts <run-dir>
 */

import { writeFileSync, readFileSync, existsSync, readdirSync } from "fs";
import { join, basename, resolve } from "path";

// ── Types ──────────────────────────────────────────────────────────────

interface ToolCallEntry {
  index: number;
  tool: string;
  /** Short human-readable summary of what this call did */
  summary: string;
  /** Short result description */
  result: string;
  /** Whether the output contained an error */
  isError: boolean;
  /** Error code if present */
  errorCode?: string;
  /** For propose_change: batch size (number of changes in `changes` array) */
  batchSize?: number;
  /** For propose_change: whether affected_lines was in the response */
  hasAffectedLines?: boolean;
  /** For propose_change: whether preview was in the response */
  hasPreview?: boolean;
  /** For review_changes: number of review decisions */
  reviewCount?: number;
  /** For review_changes: breakdown of decisions */
  reviewDecisions?: Record<string, number>;
  /** For review_changes: number of changes settled */
  settledCount?: number;
  /** For read_tracked_file: output character count */
  outputChars?: number;
  /** For read_tracked_file: view parameter */
  view?: string;
}

interface EfficiencyMetrics {
  totalCalls: number;
  durationS: number;
  reads: number;
  proposes: number;
  reviews: number;
  amends: number;
  getChanges: number;
  listChanges: number;
  supersedes: number;
  skills: number;
  other: number;
  readsPerPropose: number;
  wastedReReads: number;
  justifiedReReads: number;
  batchSizes: number[];
  avgBatchSize: number;
  errors: number;
  errorsByCode: Record<string, number>;
  affectedLinesRate: string;
  affectedLinesCount: number;
  affectedLinesTotal: number;
  previewRate: string;
  previewCount: number;
  previewTotal: number;
}

// ── Event Parsing ──────────────────────────────────────────────────────

interface ParsedEvent {
  type: string;
  timestamp?: number;
  part?: {
    tool?: string;
    state?: {
      status?: string;
      input?: Record<string, unknown>;
      output?: string;
    };
  };
}

function parseToolName(raw: string): string {
  // Strip "changedown_" prefix for readability
  return raw.replace(/^changedown_/, "");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

function escapeMarkdownCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function summarizeInput(tool: string, input: Record<string, unknown>): string {
  const shortTool = parseToolName(tool);

  switch (shortTool) {
    case "read_tracked_file": {
      const view = (input.view as string) || "default";
      const file = input.file ? basename(input.file as string) : "";
      return `view=${view}${file ? `, ${truncate(file, 20)}` : ""}`;
    }
    case "propose_change": {
      if (Array.isArray(input.changes)) {
        return `batch=${input.changes.length} changes`;
      }
      const at = input.at as string | undefined;
      const op = input.op as string | undefined;
      if (at && op) {
        return `at=${at}, op=${truncate(op, 30)}`;
      }
      if (input.old_text && input.new_text) {
        return `old_text/new_text (classic)`;
      }
      return "single change";
    }
    case "review_changes": {
      const reviews = input.reviews as unknown[] | undefined;
      const responses = input.responses as unknown[] | undefined;
      const parts: string[] = [];
      if (reviews && Array.isArray(reviews)) {
        parts.push(`${reviews.length} reviews`);
      }
      if (responses && Array.isArray(responses)) {
        parts.push(`${responses.length} responses`);
      }
      return parts.join(", ") || "review";
    }
    case "get_change": {
      const changeId = input.change_id as string | undefined;
      return changeId ? `change_id=${changeId}` : "get change";
    }
    case "list_changes": {
      const status = input.status as string | undefined;
      return status ? `status=${status}` : "all changes";
    }
    case "amend_change": {
      const changeId = input.change_id as string | undefined;
      return changeId ? `amend ${changeId}` : "amend";
    }
    case "supersede_change": {
      const changeId = input.change_id as string | undefined;
      return changeId ? `supersede ${changeId}` : "supersede";
    }
    case "skill": {
      const name = input.name as string | undefined;
      return name ? `load ${name}` : "skill";
    }
    default:
      return truncate(JSON.stringify(input), 40);
  }
}

function summarizeOutput(tool: string, rawOutput: string): {
  result: string;
  isError: boolean;
  errorCode?: string;
  batchSize?: number;
  hasAffectedLines?: boolean;
  hasPreview?: boolean;
  reviewCount?: number;
  reviewDecisions?: Record<string, number>;
  settledCount?: number;
  outputChars?: number;
} {
  const shortTool = parseToolName(tool);

  // Try to parse output as JSON
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(rawOutput);
  } catch {
    // Not JSON — use raw length
  }

  // Check for error
  if (parsed && typeof parsed === "object" && "error" in parsed) {
    const err = parsed.error as Record<string, unknown>;
    const code = (err.code as string) || "unknown";
    const msg = (err.message as string) || "";
    return {
      result: `ERROR: ${code}`,
      isError: true,
      errorCode: code,
    };
  }

  switch (shortTool) {
    case "read_tracked_file": {
      return {
        result: `${(rawOutput.length / 1000).toFixed(0)}K chars`,
        isError: false,
        outputChars: rawOutput.length,
      };
    }
    case "propose_change": {
      const parts: string[] = [];

      // Count applied changes
      const applied = parsed?.applied as unknown[] | undefined;
      const failed = parsed?.failed as unknown[] | undefined;

      if (applied && Array.isArray(applied)) {
        parts.push(`${applied.length} applied`);
      }
      if (failed && Array.isArray(failed)) {
        parts.push(`${failed.length} failed`);
      }

      // Check for affected_lines (new name) or updated_lines (old name)
      const hasAffected = parsed
        ? ("affected_lines" in parsed || "updated_lines" in parsed)
        : false;
      if (hasAffected) {
        const al = (parsed!.affected_lines ?? parsed!.updated_lines) as unknown[];
        parts.push(`affected=${Array.isArray(al) ? al.length : "?"}lines`);
      }

      const hasPreview = parsed ? "preview" in parsed : false;
      if (hasPreview) {
        parts.push("preview=yes");
      }

      // For single change (non-batch) that succeeded
      if (!applied && !failed && parsed && "change_id" in parsed) {
        parts.push(`${parsed.change_id}`);
      }

      return {
        result: parts.join(", ") || "ok",
        isError: false,
        hasAffectedLines: hasAffected,
        hasPreview: hasPreview,
      };
    }
    case "review_changes": {
      const results = parsed?.results as Array<Record<string, unknown>> | undefined;
      const settled = parsed?.settled as unknown[] | undefined;
      const decisions: Record<string, number> = {};
      let reviewCount = 0;

      if (results && Array.isArray(results)) {
        for (const r of results) {
          const d = (r.decision as string) || "unknown";
          decisions[d] = (decisions[d] ?? 0) + 1;
          reviewCount++;
        }
      }

      const decParts = Object.entries(decisions)
        .map(([d, c]) => `${c} ${d}`)
        .join(", ");
      const settledCount = Array.isArray(settled) ? settled.length : 0;
      const resultParts: string[] = [];
      if (decParts) resultParts.push(decParts);
      if (settledCount > 0) resultParts.push(`settled=${settledCount}`);

      return {
        result: resultParts.join(", ") || "ok",
        isError: false,
        reviewCount,
        reviewDecisions: decisions,
        settledCount,
      };
    }
    case "get_change": {
      return {
        result: parsed ? "ok" : `${(rawOutput.length / 1000).toFixed(0)}K chars`,
        isError: false,
      };
    }
    case "list_changes": {
      if (Array.isArray(parsed)) {
        return { result: `${parsed.length} changes`, isError: false };
      }
      return { result: "ok", isError: false };
    }
    case "amend_change": {
      return { result: "ok", isError: false };
    }
    case "skill": {
      return {
        result: `${(rawOutput.length / 1000).toFixed(0)}K chars`,
        isError: false,
      };
    }
    default:
      return {
        result: `${(rawOutput.length / 1000).toFixed(0)}K chars`,
        isError: false,
      };
  }
}

// ── Report Generation ──────────────────────────────────────────────────

function extractToolCalls(events: unknown[]): ToolCallEntry[] {
  const entries: ToolCallEntry[] = [];
  let index = 1;

  for (const raw of events) {
    const event = raw as ParsedEvent;
    if (event.type !== "tool_use") continue;
    if (!event.part?.tool) continue;
    if (!event.part.state) continue;

    const tool = event.part.tool;
    const state = event.part.state;
    const input = (state.input ?? {}) as Record<string, unknown>;
    const rawOutput =
      typeof state.output === "string"
        ? state.output
        : JSON.stringify(state.output ?? "");

    const inputSummary = summarizeInput(tool, input);
    const outputInfo = summarizeOutput(tool, rawOutput);

    const entry: ToolCallEntry = {
      index: index++,
      tool: parseToolName(tool),
      summary: inputSummary,
      result: outputInfo.result,
      isError: outputInfo.isError,
      errorCode: outputInfo.errorCode,
      hasAffectedLines: outputInfo.hasAffectedLines,
      hasPreview: outputInfo.hasPreview,
      reviewCount: outputInfo.reviewCount,
      reviewDecisions: outputInfo.reviewDecisions,
      settledCount: outputInfo.settledCount,
      outputChars: outputInfo.outputChars,
    };

    // Extract batch size from input
    if (parseToolName(tool) === "propose_change" && Array.isArray(input.changes)) {
      entry.batchSize = input.changes.length;
    }

    // Extract view from input
    if (parseToolName(tool) === "read_tracked_file") {
      entry.view = (input.view as string) || "default";
    }

    entries.push(entry);
  }

  return entries;
}

function computeMetrics(
  entries: ToolCallEntry[],
  durationMs: number
): EfficiencyMetrics {
  let reads = 0;
  let proposes = 0;
  let reviews = 0;
  let amends = 0;
  let getChanges = 0;
  let listChanges = 0;
  let supersedes = 0;
  let skills = 0;
  let other = 0;
  let errors = 0;
  const errorsByCode: Record<string, number> = {};
  const batchSizes: number[] = [];
  let affectedLinesCount = 0;
  let affectedLinesTotal = 0;
  let previewCount = 0;
  let previewTotal = 0;
  let wastedReReads = 0;
  let justifiedReReads = 0;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];

    switch (e.tool) {
      case "read_tracked_file":
        reads++;
        break;
      case "propose_change":
        proposes++;
        break;
      case "review_changes":
        reviews++;
        break;
      case "amend_change":
        amends++;
        break;
      case "get_change":
        getChanges++;
        break;
      case "list_changes":
        listChanges++;
        break;
      case "supersede_change":
        supersedes++;
        break;
      case "skill":
        skills++;
        break;
      default:
        other++;
        break;
    }

    if (e.isError) {
      errors++;
      if (e.errorCode) {
        errorsByCode[e.errorCode] = (errorsByCode[e.errorCode] ?? 0) + 1;
      }
    }

    // Batch sizes for propose_change
    if (e.tool === "propose_change" && !e.isError) {
      batchSizes.push(e.batchSize ?? 1);
    }

    // affected_lines and preview rates for successful proposes
    if (e.tool === "propose_change" && !e.isError) {
      affectedLinesTotal++;
      if (e.hasAffectedLines) affectedLinesCount++;
      previewTotal++;
      if (e.hasPreview) previewCount++;
    }

    // Re-read analysis: a read_tracked_file that follows a propose_change
    if (e.tool === "read_tracked_file" && i > 0) {
      // Look backwards for the most recent propose_change
      for (let j = i - 1; j >= 0; j--) {
        const prev = entries[j];
        if (prev.tool === "propose_change") {
          if (prev.isError) {
            justifiedReReads++;
          } else {
            wastedReReads++;
          }
          break;
        }
        // If we hit a non-propose tool, stop looking
        if (prev.tool !== "read_tracked_file") break;
      }
    }
  }

  const totalBatch = batchSizes.reduce((a, b) => a + b, 0);
  const avgBatchSize =
    batchSizes.length > 0 ? totalBatch / batchSizes.length : 0;
  const readsPerPropose = proposes > 0 ? reads / proposes : 0;

  return {
    totalCalls: entries.length,
    durationS: Math.round(durationMs / 1000),
    reads,
    proposes,
    reviews,
    amends,
    getChanges,
    listChanges,
    supersedes,
    skills,
    other,
    readsPerPropose,
    wastedReReads,
    justifiedReReads,
    batchSizes,
    avgBatchSize,
    errors,
    errorsByCode,
    affectedLinesRate:
      affectedLinesTotal > 0
        ? `${affectedLinesCount}/${affectedLinesTotal}`
        : "N/A",
    affectedLinesCount,
    affectedLinesTotal,
    previewRate:
      previewTotal > 0 ? `${previewCount}/${previewTotal}` : "N/A",
    previewCount,
    previewTotal,
  };
}

function formatBatchSizes(sizes: number[]): string {
  if (sizes.length === 0) return "none";
  if (sizes.length <= 10) return `[${sizes.join(", ")}]`;
  // Truncate long lists
  return `[${sizes.slice(0, 8).join(", ")}, ...] (${sizes.length} proposes)`;
}

function renderMarkdown(
  entries: ToolCallEntry[],
  metrics: EfficiencyMetrics,
  meta: { surface?: string; taskId?: string; model?: string }
): string {
  const lines: string[] = [];

  // Header
  const titleParts: string[] = [];
  if (meta.surface && meta.taskId) {
    titleParts.push(`${meta.surface}-${meta.taskId}`);
  }
  if (meta.model) {
    titleParts.push(`(${meta.model})`);
  }
  const title = titleParts.length > 0 ? titleParts.join(" ") : "Benchmark Run";
  lines.push(`# Tool Call Report: ${title}`);
  lines.push("");

  // Sequence table
  lines.push(
    `## Sequence (${metrics.totalCalls} calls, ${metrics.durationS}s)`
  );
  lines.push("");
  lines.push("| # | Tool | Summary | Result |");
  lines.push("|---|------|---------|--------|");

  for (const e of entries) {
    const errMark = e.isError ? " **ERR**" : "";
    lines.push(
      `| ${e.index} | ${escapeMarkdownCell(e.tool)} | ${escapeMarkdownCell(e.summary)} | ${escapeMarkdownCell(e.result)}${errMark} |`
    );
  }

  lines.push("");

  // Efficiency Metrics
  lines.push("## Efficiency Metrics");
  lines.push("");

  // Tool counts
  const countParts: string[] = [];
  if (metrics.reads > 0) countParts.push(`Reads: ${metrics.reads}`);
  if (metrics.proposes > 0) countParts.push(`Proposes: ${metrics.proposes}`);
  if (metrics.reviews > 0) countParts.push(`Reviews: ${metrics.reviews}`);
  if (metrics.amends > 0) countParts.push(`Amends: ${metrics.amends}`);
  if (metrics.getChanges > 0)
    countParts.push(`GetChange: ${metrics.getChanges}`);
  if (metrics.listChanges > 0)
    countParts.push(`ListChanges: ${metrics.listChanges}`);
  if (metrics.supersedes > 0)
    countParts.push(`Supersedes: ${metrics.supersedes}`);
  if (metrics.skills > 0) countParts.push(`Skills: ${metrics.skills}`);
  if (metrics.other > 0) countParts.push(`Other: ${metrics.other}`);
  if (countParts.length > 0) {
    lines.push(`- ${countParts.join(" | ")}`);
  }

  // Reads-per-propose
  if (metrics.proposes > 0) {
    const ideal = (1 / metrics.proposes).toFixed(2);
    lines.push(
      `- Reads-per-propose: ${metrics.readsPerPropose.toFixed(2)} (ideal: ${ideal} for 1 initial read + ${metrics.proposes} proposes)`
    );
  }

  // Re-read patterns
  if (metrics.wastedReReads > 0 || metrics.justifiedReReads > 0) {
    lines.push(
      `- Re-reads after propose (no error): ${metrics.wastedReReads} (wasted)`
    );
    lines.push(
      `- Re-reads after error: ${metrics.justifiedReReads} (justified)`
    );
  }

  // Batch sizes
  if (metrics.batchSizes.length > 0) {
    lines.push(
      `- Batch sizes: ${formatBatchSizes(metrics.batchSizes)} (avg ${metrics.avgBatchSize.toFixed(1)})`
    );
  }

  // Errors
  if (metrics.errors > 0) {
    const errorBreakdown = Object.entries(metrics.errorsByCode)
      .map(([code, count]) => `${code}: ${count}`)
      .join(", ");
    lines.push(`- Errors: ${metrics.errors} (${errorBreakdown})`);
  } else {
    lines.push("- Errors: 0");
  }

  // Response quality
  if (metrics.affectedLinesTotal > 0) {
    lines.push(
      `- affected_lines in response: ${metrics.affectedLinesRate} proposes`
    );
  }
  if (metrics.previewTotal > 0) {
    lines.push(`- preview in response: ${metrics.previewRate} proposes`);
  }

  lines.push("");
  return lines.join("\n");
}

// ── Public API ─────────────────────────────────────────────────────────

export interface ToolCallReportSummary {
  surface?: string;
  taskId?: string;
  model?: string;
  durationMs: number;
}

/**
 * Generate a tool-calls.md report from raw events and summary metadata.
 * Writes the report to `{outputDir}/tool-calls.md`.
 */
export function generateToolCallReport(
  events: unknown[],
  summary: {
    meta?: { surface?: string; taskId?: string; model?: string; durationMs?: number };
    durationMs?: number;
  },
  outputDir: string
): void {
  const meta = summary.meta ?? {};
  const durationMs = meta.durationMs ?? summary.durationMs ?? 0;

  const entries = extractToolCalls(events);
  const metrics = computeMetrics(entries, durationMs);

  // Sanitize model for display: strip provider prefix
  let modelDisplay = meta.model ?? "";
  if (modelDisplay.includes("/")) {
    modelDisplay = modelDisplay.split("/").slice(1).join("/");
  }
  modelDisplay = modelDisplay.replace(/-free$/, "");

  const md = renderMarkdown(entries, metrics, {
    surface: meta.surface,
    taskId: meta.taskId,
    model: modelDisplay,
  });

  writeFileSync(join(outputDir, "tool-calls.md"), md);
}

// ── Standalone CLI ─────────────────────────────────────────────────────

function analyzeDirectory(dir: string): void {
  const eventsPath = join(dir, "events.jsonl");
  const summaryPath = join(dir, "summary.json");

  if (!existsSync(eventsPath)) {
    throw new Error(`Missing events.jsonl in ${dir}`);
  }
  if (!existsSync(summaryPath)) {
    throw new Error(`Missing summary.json in ${dir}`);
  }

  const events = readFileSync(eventsPath, "utf-8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((e) => e !== null);

  const summary = JSON.parse(readFileSync(summaryPath, "utf-8"));

  generateToolCallReport(events, summary, dir);
  console.log(`Generated: ${join(dir, "tool-calls.md")}`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error(
      "Usage: tool-call-report <run-dir> | --all [results-base-dir]"
    );
    process.exit(1);
  }

  if (args[0] === "--all") {
    const baseDir = resolve(args[1] ?? "results");
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

    if (dirs.length === 0) {
      console.error(`No run directories found in ${baseDir}`);
      process.exit(1);
    }

    console.log(`Generating tool-calls.md for ${dirs.length} runs...`);
    for (const dir of dirs.sort()) {
      try {
        analyzeDirectory(dir);
      } catch (err: any) {
        console.error(`  ${dir}: ERROR -- ${err.message}`);
      }
    }
  } else {
    analyzeDirectory(resolve(args[0]));
  }
}

// Run if executed directly
const entryScript = process.argv[1] ?? "";
if (
  entryScript.endsWith("tool-call-report.ts") ||
  entryScript.endsWith("tool-call-report.js")
) {
  main();
}
