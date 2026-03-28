// packages/benchmarks/harness/verify.ts
import { computeSettledText, parseFootnotes, type FootnoteInfo } from "@changedown/core";
import fs from "node:fs/promises";
import path from "node:path";
import type { SurfaceId } from "./workflows.js";

// --- Types ---

export interface Correction {
  id: string;
  category: string;
  wrong: string;       // regex pattern string
  correct?: string;    // regex pattern string; omit → max score 0.5
  context?: string;    // human documentation only
}

export interface Decision {
  id: string;
  expected: "accept" | "reject" | "amend";
  amended_contains?: string;
  description?: string;
}

export interface Assertions {
  task: string;
  type: "error-fix" | "decision" | "mixed";
  scoring: {
    corrections: Correction[];
    decisions: Decision[];
    golden_file?: string;
  };
}

export interface CorrectionResult {
  id: string;
  category: string;
  score: 0 | 0.5 | 1;
  wrongFound: boolean;
  correctFound: boolean;
}

export interface DecisionResult {
  id: string;
  expected: "accept" | "reject" | "amend";
  actual: "accepted" | "rejected" | "proposed" | "not_found";
  correct: boolean;
  amendedTextMatch?: boolean;
}

export interface RegressionResult {
  line: number;
  expected: string;
  actual: string;
}

export interface CategoryScore {
  score: number;
  max: number;
}

export interface VerificationResult {
  task: string;
  surface: string;
  corrections: {
    score: number;
    max: number;
    accuracy: number;
    byCategory: Record<string, CategoryScore>;
    details: CorrectionResult[];
  };
  decisions: {
    correct: number;
    total: number;
    accuracy: number | null;
    details: DecisionResult[];
  };
  regressions: {
    count: number;
    details: RegressionResult[];
  };
  overallAccuracy: number;
}

// --- Scoring Functions ---

export function scoreCorrections(
  settledText: string,
  corrections: Correction[]
): {
  results: CorrectionResult[];
  byCategory: Record<string, CategoryScore>;
  totalScore: number;
  maxScore: number;
  accuracy: number;
} {
  const results: CorrectionResult[] = [];
  const byCategory: Record<string, CategoryScore> = {};

  for (const c of corrections) {
    const wrongRe = new RegExp(c.wrong);
    const wrongFound = wrongRe.test(settledText);

    let correctFound = false;
    if (c.correct) {
      const correctRe = new RegExp(c.correct);
      correctFound = correctRe.test(settledText);
    }

    let score: 0 | 0.5 | 1;
    if (wrongFound) {
      score = 0;
    } else if (c.correct && correctFound) {
      score = 1;
    } else {
      score = 0.5;
    }

    results.push({
      id: c.id,
      category: c.category,
      score,
      wrongFound,
      correctFound,
    });

    if (!byCategory[c.category]) {
      byCategory[c.category] = { score: 0, max: 0 };
    }
    byCategory[c.category].score += score;
    byCategory[c.category].max += c.correct ? 1 : 0.5;
  }

  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const maxScore = corrections.reduce((sum, c) => sum + (c.correct ? 1 : 0.5), 0);
  const accuracy = maxScore > 0 ? totalScore / maxScore : 0;

  return { results, byCategory, totalScore, maxScore, accuracy };
}

// --- Text Extraction ---

async function findMarkdownFile(dir: string, exclude?: Set<string>): Promise<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (exclude?.has(entry.name)) continue;
    if (entry.isFile() && entry.name.endsWith(".md")) {
      return path.join(dir, entry.name);
    }
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) {
      const found = await findMarkdownFile(path.join(dir, entry.name), exclude).catch(() => "");
      if (found) return found;
    }
  }
  throw new Error(`No markdown file found in ${dir}`);
}

export async function extractSettledText(afterDir: string, surface: SurfaceId, exclude?: Set<string>): Promise<string> {
  const mdPath = await findMarkdownFile(afterDir, exclude);
  const raw = await fs.readFile(mdPath, "utf-8");

  let text: string;
  if (surface === "A" || surface === "H") {
    text = raw;
  } else {
    text = computeSettledText(raw);
  }

  // Strip tracking header — golden files don't contain it
  return text.replace(/^<!-- changedown\.dev\/v1: tracked -->\n*/, "");
}

// --- Decision Scoring ---

export function scoreDecisions(
  fileContent: string,
  decisions: Decision[]
): {
  results: DecisionResult[];
  correct: number;
  total: number;
  accuracy: number | null;
} {
  if (decisions.length === 0) {
    return { results: [], correct: 0, total: 0, accuracy: null };
  }

  const footnotes = parseFootnotes(fileContent);
  const results: DecisionResult[] = [];

  for (const d of decisions) {
    const footnote = footnotes.get(d.id);
    if (!footnote) {
      results.push({
        id: d.id,
        expected: d.expected,
        actual: "not_found",
        correct: false,
      });
      continue;
    }

    const actual = footnote.status as DecisionResult["actual"];
    let correct = false;
    let amendedTextMatch: boolean | undefined;

    if (d.expected === "accept") {
      correct = actual === "accepted";
    } else if (d.expected === "reject") {
      correct = actual === "rejected";
    } else if (d.expected === "amend") {
      // Amend = content was revised. Status stays "proposed" (awaiting re-review)
      // or transitions to "accepted" if the agent also approved after amending.
      correct = actual === "proposed" || actual === "accepted";
      if (d.amended_contains) {
        amendedTextMatch = fileContent.includes(d.amended_contains);
        correct = correct && amendedTextMatch;
      }
    }

    results.push({
      id: d.id,
      expected: d.expected,
      actual,
      correct,
      amendedTextMatch,
    });
  }

  const correctCount = results.filter((r) => r.correct).length;
  return {
    results,
    correct: correctCount,
    total: decisions.length,
    accuracy: correctCount / decisions.length,
  };
}

// --- Regression Detection ---

export function detectRegressions(
  settledText: string,
  goldenText: string,
  corrections: Correction[]
): {
  details: RegressionResult[];
  count: number;
} {
  const settledLines = settledText.split("\n");
  const goldenLines = goldenText.split("\n");
  const details: RegressionResult[] = [];

  const maxLines = Math.max(settledLines.length, goldenLines.length);

  for (let i = 0; i < maxLines; i++) {
    const settled = settledLines[i] ?? "";
    const golden = goldenLines[i] ?? "";

    if (settled === golden) continue;

    // Check if this line difference is fully explained by known corrections.
    // A line is "explained" if both settled and golden contain the correct text
    // for every correction that applies to this line, and no other differences exist.
    const isExplained = isLineDiffExplainedByCorrections(settled, golden, corrections);

    if (!isExplained) {
      details.push({
        line: i + 1,
        expected: golden,
        actual: settled,
      });
    }
  }

  return { details, count: details.length };
}

function isLineDiffExplainedByCorrections(
  settled: string,
  golden: string,
  corrections: Correction[]
): boolean {
  // If both lines match golden, no regression (already handled by caller).
  // Strategy: check if settled === golden after we account for correction patterns.
  // Both settled and golden should contain the "correct" text for all applicable corrections.
  // If they're identical after that, the diff is explained.
  if (settled === golden) return true;

  // Both lines must contain the correct patterns for applicable corrections
  const applicableCorrections = corrections.filter((c) => {
    if (!c.correct) return false;
    const correctRe = new RegExp(c.correct);
    return correctRe.test(golden) && correctRe.test(settled);
  });

  // If no corrections apply to explain the difference, it's a regression
  if (applicableCorrections.length === 0) return false;

  // Both lines contain correct text — but are there OTHER differences?
  // Compare lines after masking out correction-affected regions
  // Simple heuristic: if settled === golden, it's explained (already checked).
  // Otherwise, there are unexplained differences.
  return false;
}

// --- Top-level Orchestrator ---

export async function verify(
  afterDir: string,
  assertionsPath: string,
  surface: SurfaceId
): Promise<VerificationResult> {
  const assertions: Assertions = JSON.parse(await fs.readFile(assertionsPath, "utf-8"));

  // Build exclusion set from golden_file so findMarkdownFile picks the agent output
  const goldenExclude = new Set<string>();
  if (assertions.scoring.golden_file) {
    goldenExclude.add(assertions.scoring.golden_file);
  }

  const settledText = await extractSettledText(afterDir, surface, goldenExclude);

  const corrections = scoreCorrections(settledText, assertions.scoring.corrections);

  let decisionsResult;
  if (assertions.scoring.decisions.length > 0) {
    const mdPath = await findMarkdownFile(afterDir, goldenExclude);
    const rawContent = await fs.readFile(mdPath, "utf-8");
    decisionsResult = scoreDecisions(rawContent, assertions.scoring.decisions);
  } else {
    decisionsResult = { results: [] as DecisionResult[], correct: 0, total: 0, accuracy: null as number | null };
  }

  let regressionsResult = { details: [] as RegressionResult[], count: 0 };
  if (assertions.scoring.golden_file) {
    const goldenPath = path.join(path.dirname(assertionsPath), assertions.scoring.golden_file);
    const goldenText = await fs.readFile(goldenPath, "utf-8");
    regressionsResult = detectRegressions(settledText, goldenText, assertions.scoring.corrections);
  }

  const correctionWeight = corrections.maxScore;
  const decisionWeight = decisionsResult.total;
  const totalWeight = correctionWeight + decisionWeight;
  const overallAccuracy = totalWeight > 0
    ? (corrections.totalScore + decisionsResult.correct) / totalWeight
    : 0;

  return {
    task: assertions.task,
    surface,
    corrections: {
      score: corrections.totalScore,
      max: corrections.maxScore,
      accuracy: corrections.accuracy,
      byCategory: corrections.byCategory,
      details: corrections.results,
    },
    decisions: {
      correct: decisionsResult.correct,
      total: decisionsResult.total,
      accuracy: decisionsResult.accuracy,
      details: decisionsResult.results,
    },
    regressions: {
      count: regressionsResult.count,
      details: regressionsResult.details,
    },
    overallAccuracy,
  };
}

// --- CLI ---

async function cli(): Promise<void> {
  const args = process.argv.slice(2);
  const getArg = (name: string): string | undefined => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const resultsDir = getArg("results");
  const taskId = getArg("task");
  const surface = getArg("surface") as SurfaceId | undefined;
  const all = args.includes("--all");

  if (!resultsDir) {
    console.error("Usage: verify --results <dir> --task <taskId> --surface <A|F|G>");
    console.error("       verify --results <dir> --all");
    process.exit(1);
  }

  const fixturesRoot = path.join(process.cwd(), "packages", "benchmarks", "fixtures");

  if (all) {
    const entries = await fs.readdir(resultsDir, { withFileTypes: true });
    const results: VerificationResult[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === "." || entry.name === "..") continue;
      const match = entry.name.match(/^([A-H])-(\w+?)_/);
      if (!match) continue;

      const entrySurface = match[1] as SurfaceId;
      const entryTask = match[2];

      const promptsPath = path.join(fixturesRoot, "prompts.json");
      const prompts = JSON.parse(await fs.readFile(promptsPath, "utf-8"));
      const taskConfig = prompts.tasks[entryTask];
      if (!taskConfig) continue;

      const assertionsPath = path.join(fixturesRoot, taskConfig.fixtureDir, "assertions.json");
      try {
        await fs.access(assertionsPath);
      } catch {
        continue;
      }

      const afterDir = path.join(resultsDir, entry.name, "after");
      try {
        const result = await verify(afterDir, assertionsPath, entrySurface);
        results.push(result);
      } catch (err) {
        console.error(`  Error verifying ${entry.name}: ${err}`);
      }
    }

    printSummaryTable(results);
  } else if (taskId && surface) {
    const promptsPath = path.join(fixturesRoot, "prompts.json");
    const prompts = JSON.parse(await fs.readFile(promptsPath, "utf-8"));
    const taskConfig = prompts.tasks[taskId];
    if (!taskConfig) {
      console.error(`Unknown task: ${taskId}`);
      process.exit(1);
    }

    const assertionsPath = path.join(fixturesRoot, taskConfig.fixtureDir, "assertions.json");
    const entries = await fs.readdir(resultsDir);
    const resultDir = entries.find((e) => e.startsWith(`${surface}-${taskId}`));
    if (!resultDir) {
      console.error(`No result found for ${surface}-${taskId} in ${resultsDir}`);
      process.exit(1);
    }

    const afterDir = path.join(resultsDir, resultDir, "after");
    const result = await verify(afterDir, assertionsPath, surface);
    printSummaryTable([result]);
    printDetails(result);
  }
}

function printSummaryTable(results: VerificationResult[]): void {
  console.log("\nQuality Verification:");
  for (const r of results) {
    const parts: string[] = [`  ${r.task} × ${r.surface}:`];

    if (r.corrections.max > 0) {
      parts.push(`${r.corrections.score}/${r.corrections.max} (${(r.corrections.accuracy * 100).toFixed(1)}%)`);
      const cats = Object.entries(r.corrections.byCategory)
        .map(([cat, s]) => `${cat}: ${s.score}/${s.max}`)
        .join(", ");
      if (cats) parts.push(`| ${cats}`);
    }

    if (r.decisions.total > 0) {
      parts.push(`decisions: ${r.decisions.correct}/${r.decisions.total}`);
      const decs = r.decisions.details
        .map((d) => `${d.expected}:${d.correct ? "✓" : "✗"}`)
        .join(" ");
      parts.push(`| ${decs}`);
    }

    parts.push(`| ${r.regressions.count} regressions`);
    console.log(parts.join("  "));
  }
}

function printDetails(result: VerificationResult): void {
  if (result.corrections.details.length > 0) {
    console.log("\nCorrection Details:");
    for (const c of result.corrections.details) {
      const icon = c.score === 1 ? "✓" : c.score === 0.5 ? "½" : "✗";
      console.log(`  ${icon} [${c.category}] ${c.id}: score=${c.score}`);
    }
  }
  if (result.regressions.count > 0) {
    console.log("\nRegressions:");
    for (const r of result.regressions.details) {
      console.log(`  Line ${r.line}:`);
      console.log(`    Expected: ${r.expected.slice(0, 80)}`);
      console.log(`    Actual:   ${r.actual.slice(0, 80)}`);
    }
  }
}

const isMain = process.argv[1]?.endsWith("verify.ts") || process.argv[1]?.endsWith("verify.js");
if (isMain) {
  cli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
