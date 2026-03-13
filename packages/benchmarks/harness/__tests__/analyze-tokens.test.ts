import { describe, it, expect } from "vitest";
import { parseEventsFromLines, StepGroup, tokenizeToolCalls, aggregateByTool, PerToolSummary, buildAuditReport, TokenAuditReport, analyzeRunDirectory } from "../analyze-tokens.js";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const STEP_START = (id: string) =>
  JSON.stringify({ type: "step_start", part: { id, type: "step-start" } });

const STEP_FINISH = (id: string, tokens: object) =>
  JSON.stringify({
    type: "step_finish",
    part: { id, type: "step-finish", tokens },
  });

const TOOL_USE = (tool: string, input: object, output: string) =>
  JSON.stringify({
    type: "tool_use",
    part: {
      type: "tool",
      tool,
      state: { status: "completed", input, output },
    },
  });

describe("parseEventsFromLines", () => {
  it("groups tool_use events with their enclosing step", () => {
    const lines = [
      STEP_START("step1"),
      TOOL_USE("changetracks_read_tracked_file", { file: "adr.md", view: "review" }, "# ADR content..."),
      STEP_FINISH("step1", { input: 100, output: 200, reasoning: 0, cache: { read: 5000 } }),
    ];

    const steps = parseEventsFromLines(lines);
    expect(steps).toHaveLength(1);
    expect(steps[0].apiTokens).toEqual({ input: 100, output: 200, reasoning: 0, cacheRead: 5000 });
    expect(steps[0].toolCalls).toHaveLength(1);
    expect(steps[0].toolCalls[0].tool).toBe("changetracks_read_tracked_file");
    expect(steps[0].toolCalls[0].rawInput).toEqual({ file: "adr.md", view: "review" });
    expect(steps[0].toolCalls[0].rawOutput).toBe("# ADR content...");
  });

  it("handles steps with multiple tool calls", () => {
    const lines = [
      STEP_START("step1"),
      TOOL_USE("changetracks_read_tracked_file", { file: "a.md" }, "content A"),
      TOOL_USE("changetracks_propose_change", { file: "a.md", old_text: "x", new_text: "y" }, '{"change_id":"ct-1"}'),
      STEP_FINISH("step1", { input: 50, output: 300, reasoning: 0, cache: { read: 1000 } }),
    ];

    const steps = parseEventsFromLines(lines);
    expect(steps).toHaveLength(1);
    expect(steps[0].toolCalls).toHaveLength(2);
    expect(steps[0].toolCalls[0].tool).toBe("changetracks_read_tracked_file");
    expect(steps[0].toolCalls[1].tool).toBe("changetracks_propose_change");
  });

  it("handles steps with no tool calls", () => {
    const lines = [
      STEP_START("step1"),
      STEP_FINISH("step1", { input: 10, output: 50, reasoning: 0, cache: { read: 0 } }),
    ];

    const steps = parseEventsFromLines(lines);
    expect(steps).toHaveLength(1);
    expect(steps[0].toolCalls).toHaveLength(0);
  });

  it("handles multiple steps in sequence", () => {
    const lines = [
      STEP_START("s1"),
      TOOL_USE("bash", { command: "ls" }, "file1\nfile2"),
      STEP_FINISH("s1", { input: 10, output: 20, cache: { read: 100 } }),
      STEP_START("s2"),
      TOOL_USE("changetracks_propose_change", { file: "x.md" }, '{"ok":true}'),
      STEP_FINISH("s2", { input: 30, output: 40, cache: { read: 200 } }),
    ];

    const steps = parseEventsFromLines(lines);
    expect(steps).toHaveLength(2);
    expect(steps[0].toolCalls[0].tool).toBe("bash");
    expect(steps[1].toolCalls[0].tool).toBe("changetracks_propose_change");
  });

  it("skips blank lines and non-JSON lines", () => {
    const lines = ["", "not json", STEP_START("s1"), STEP_FINISH("s1", { input: 1, output: 2, cache: { read: 0 } })];
    const steps = parseEventsFromLines(lines);
    expect(steps).toHaveLength(1);
  });
});

describe("tokenizeToolCalls", () => {
  it("counts tokens for tool call input and output", () => {
    const steps: StepGroup[] = [
      {
        stepIndex: 0,
        apiTokens: { input: 100, output: 200, reasoning: 0, cacheRead: 0 },
        toolCalls: [
          { tool: "bash", rawInput: { command: "echo hello" }, rawOutput: "hello\n" },
        ],
      },
    ];

    const result = tokenizeToolCalls(steps);
    expect(result[0].toolCalls[0].inputTokens).toBeGreaterThan(0);
    expect(result[0].toolCalls[0].outputTokens).toBeGreaterThan(0);
  });
});

describe("aggregateByTool", () => {
  it("rolls up token counts per tool", () => {
    const steps: StepGroup[] = [
      {
        stepIndex: 0,
        apiTokens: { input: 100, output: 200, reasoning: 0, cacheRead: 0 },
        toolCalls: [
          { tool: "bash", rawInput: { command: "ls" }, rawOutput: "file1", inputTokens: 10, outputTokens: 5 },
          { tool: "bash", rawInput: { command: "pwd" }, rawOutput: "/home", inputTokens: 8, outputTokens: 4 },
          { tool: "changetracks_read_tracked_file", rawInput: { file: "a.md" }, rawOutput: "content", inputTokens: 12, outputTokens: 50 },
        ],
      },
    ];

    const perTool = aggregateByTool(steps);
    expect(perTool["bash"].calls).toBe(2);
    expect(perTool["bash"].inputTokens).toBe(18);
    expect(perTool["bash"].outputTokens).toBe(9);
    expect(perTool["bash"].avgInputPerCall).toBe(9);
    expect(perTool["bash"].avgOutputPerCall).toBe(4.5);
    expect(perTool["changetracks_read_tracked_file"].calls).toBe(1);
    expect(perTool["changetracks_read_tracked_file"].inputTokens).toBe(12);
    expect(perTool["changetracks_read_tracked_file"].outputTokens).toBe(50);
  });
});

describe("buildAuditReport", () => {
  it("produces verification, perTool, and perStep sections", () => {
    const steps: StepGroup[] = [
      {
        stepIndex: 0,
        apiTokens: { input: 100, output: 200, reasoning: 0, cacheRead: 5000 },
        toolCalls: [
          { tool: "bash", rawInput: { command: "ls" }, rawOutput: "file1\nfile2", inputTokens: 10, outputTokens: 8 },
        ],
      },
      {
        stepIndex: 1,
        apiTokens: { input: 50, output: 150, reasoning: 0, cacheRead: 3000 },
        toolCalls: [
          { tool: "changetracks_propose_change", rawInput: { file: "a.md", old_text: "x", new_text: "y" }, rawOutput: '{"change_id":"ct-1"}', inputTokens: 25, outputTokens: 12 },
        ],
      },
    ];

    const summaryTokens = { input: 150, output: 350, reasoning: 0, cacheRead: 8000 };

    const report = buildAuditReport(steps, summaryTokens);

    // Verification section
    expect(report.verification.apiReported).toEqual(summaryTokens);
    expect(report.verification.toolPayloadTokens.totalInput).toBe(35); // 10 + 25
    expect(report.verification.toolPayloadTokens.totalOutput).toBe(20); // 8 + 12
    expect(typeof report.verification.accountingGap).toBe("number");

    // Per-tool section
    expect(report.perTool["bash"].calls).toBe(1);
    expect(report.perTool["changetracks_propose_change"].calls).toBe(1);

    // Per-step section
    expect(report.perStep).toHaveLength(2);
    expect(report.perStep[0].step).toBe(0);
    expect(report.perStep[0].toolCalls).toHaveLength(1);
    expect(report.perStep[1].toolCalls[0].tool).toBe("changetracks_propose_change");

    // Meta section
    expect(report.meta.tokenizer).toBe("tiktoken/cl100k_base");
    expect(report.meta.analyzedAt).toBeTruthy();
  });

  it("computes accountingGap as fraction of unattributed tokens", () => {
    const steps: StepGroup[] = [
      {
        stepIndex: 0,
        apiTokens: { input: 1000, output: 500, reasoning: 0, cacheRead: 0 },
        toolCalls: [
          { tool: "bash", rawInput: { command: "x" }, rawOutput: "y", inputTokens: 100, outputTokens: 200 },
        ],
      },
    ];
    const summaryTokens = { input: 1000, output: 500, reasoning: 0, cacheRead: 0 };

    const report = buildAuditReport(steps, summaryTokens);
    // Tool tokens = 100 input + 200 output = 300
    // API reported = 1000 input + 500 output = 1500
    // Gap = (1500 - 300) / 1500 = 0.8
    expect(report.verification.accountingGap).toBeCloseTo(0.8, 2);
  });
});

describe("analyzeRunDirectory", () => {
  it("reads events.jsonl + summary.json and writes token-audit.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "token-audit-test-"));

    const events = [
      JSON.stringify({ type: "step_start", part: { id: "s1", type: "step-start" } }),
      JSON.stringify({
        type: "tool_use",
        part: {
          type: "tool",
          tool: "bash",
          state: { status: "completed", input: { command: "echo hi" }, output: "hi\n" },
        },
      }),
      JSON.stringify({
        type: "step_finish",
        part: { id: "s1", type: "step-finish", tokens: { input: 50, output: 100, reasoning: 0, cache: { read: 2000 } } },
      }),
    ];
    writeFileSync(join(dir, "events.jsonl"), events.join("\n"));

    const summary = {
      meta: { surface: "G", taskId: "task1", model: "test" },
      tokens: { input: 50, output: 100, reasoning: 0, cacheRead: 2000 },
    };
    writeFileSync(join(dir, "summary.json"), JSON.stringify(summary));

    const report = analyzeRunDirectory(dir);

    expect(report.verification.apiReported.input).toBe(50);
    expect(report.perTool["bash"]).toBeDefined();
    expect(report.perTool["bash"].calls).toBe(1);

    // Should have written token-audit.json
    const written = JSON.parse(readFileSync(join(dir, "token-audit.json"), "utf-8"));
    expect(written.meta.tokenizer).toBe("tiktoken/cl100k_base");
  });

  it("throws if events.jsonl is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "token-audit-test-"));
    writeFileSync(join(dir, "summary.json"), "{}");
    expect(() => analyzeRunDirectory(dir)).toThrow(/events\.jsonl/);
  });

  it("throws if summary.json is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "token-audit-test-"));
    writeFileSync(join(dir, "events.jsonl"), "");
    expect(() => analyzeRunDirectory(dir)).toThrow(/summary\.json/);
  });
});
