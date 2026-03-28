import { describe, it, expect } from "vitest";
import { scoreCorrections, extractSettledText, scoreDecisions, detectRegressions, verify, type Correction, type Decision } from "../verify.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("scoreCorrections", () => {
  const sampleText = "The depolyed application has persistant errors in the infrastucture.";

  it("scores 1.0 when wrong is gone and correct is present", () => {
    const corrections: Correction[] = [
      { id: "spell-1", category: "spelling", wrong: "depolyed", correct: "deployed" },
    ];
    const result = scoreCorrections(sampleText.replace("depolyed", "deployed"), corrections);
    expect(result.results[0].score).toBe(1);
    expect(result.totalScore).toBe(1);
    expect(result.accuracy).toBe(1);
  });

  it("scores 0.5 when wrong is gone but correct is absent", () => {
    const corrections: Correction[] = [
      { id: "spell-1", category: "spelling", wrong: "depolyed", correct: "deployed" },
    ];
    // Agent removed the word entirely instead of fixing it
    const result = scoreCorrections(sampleText.replace("depolyed ", ""), corrections);
    expect(result.results[0].score).toBe(0.5);
    expect(result.totalScore).toBe(0.5);
  });

  it("scores 0.0 when wrong is still present", () => {
    const corrections: Correction[] = [
      { id: "spell-1", category: "spelling", wrong: "depolyed", correct: "deployed" },
    ];
    const result = scoreCorrections(sampleText, corrections);
    expect(result.results[0].score).toBe(0);
    expect(result.totalScore).toBe(0);
  });

  it("groups scores by category", () => {
    const fixed = sampleText
      .replace("depolyed", "deployed")
      .replace("persistant", "persistent");
    const corrections: Correction[] = [
      { id: "spell-1", category: "spelling", wrong: "depolyed", correct: "deployed" },
      { id: "spell-2", category: "spelling", wrong: "persistant", correct: "persistent" },
      { id: "spell-3", category: "spelling", wrong: "infrastucture", correct: "infrastructure" },
    ];
    const result = scoreCorrections(fixed, corrections);
    expect(result.byCategory["spelling"]).toEqual({ score: 2, max: 3 });
    expect(result.accuracy).toBeCloseTo(2 / 3);
  });

  it("caps at 0.5 when correct pattern is omitted", () => {
    const corrections: Correction[] = [
      { id: "spell-1", category: "spelling", wrong: "depolyed" },
    ];
    const result = scoreCorrections(sampleText.replace("depolyed", "deployed"), corrections);
    expect(result.results[0].score).toBe(0.5);
    expect(result.maxScore).toBe(0.5);
  });

  it("handles regex patterns in wrong/correct", () => {
    const text = "Using PromQL queries, you can aggregate";
    const corrections: Correction[] = [
      { id: "ver-1", category: "version", wrong: "PromQL\\s+2\\.0", correct: "PromQL" },
    ];
    const origText = "Using PromQL 2.0 queries, you can aggregate";
    const result = scoreCorrections(origText, corrections);
    expect(result.results[0].score).toBe(0); // wrong still present
    const fixedResult = scoreCorrections(text, corrections);
    expect(fixedResult.results[0].score).toBe(1); // wrong gone, correct present
  });
});

describe("extractSettledText", () => {
  it("returns raw text for surface A", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "verify-test-"));
    await fs.writeFile(path.join(tmpDir, "doc.md"), "Hello world");
    const result = await extractSettledText(tmpDir, "A");
    expect(result).toBe("Hello world");
    await fs.rm(tmpDir, { recursive: true });
  });

  it("strips CriticMarkup for surface F via computeSettledText", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "verify-test-"));
    const content = "The {~~depolyed~>deployed~~}[^cn-1] app.\n\n[^cn-1]: @ai:test | 2026-01-01 | sub | accepted\n";
    await fs.writeFile(path.join(tmpDir, "doc.md"), content);
    const result = await extractSettledText(tmpDir, "F");
    expect(result).toContain("deployed");
    expect(result).not.toContain("{~~");
    expect(result).not.toContain("[^cn-1]");
    await fs.rm(tmpDir, { recursive: true });
  });

  it("handles surface G same as F", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "verify-test-"));
    const content = "Text {++added++}[^cn-1] here.\n\n[^cn-1]: @ai:test | 2026-01-01 | ins | proposed\n";
    await fs.writeFile(path.join(tmpDir, "doc.md"), content);
    const result = await extractSettledText(tmpDir, "G");
    expect(result).toContain("added");
    expect(result).not.toContain("{++");
    await fs.rm(tmpDir, { recursive: true });
  });
});

describe("scoreDecisions", () => {
  const fileWithFootnotes = `
Some content {++added text++}[^cn-1]

More {~~REST~>GraphQL~~}[^cn-2] here.

{--Removed paragraph.--}[^cn-3]

[^cn-1]: @ai:agent | 2026-02-27 | ins | accepted
    reason: Good addition

[^cn-2]: @ai:agent | 2026-02-27 | sub | rejected
    reason: REST is better

[^cn-3]: @ai:agent | 2026-02-27 | del | proposed
    reason: Not sure about this
`;

  it("scores correct accept decision", () => {
    const decisions: Decision[] = [
      { id: "cn-1", expected: "accept" },
    ];
    const result = scoreDecisions(fileWithFootnotes, decisions);
    expect(result.results[0].correct).toBe(true);
    expect(result.results[0].actual).toBe("accepted");
  });

  it("scores correct reject decision", () => {
    const decisions: Decision[] = [
      { id: "cn-2", expected: "reject" },
    ];
    const result = scoreDecisions(fileWithFootnotes, decisions);
    expect(result.results[0].correct).toBe(true);
  });

  it("scores incorrect decision (expected reject, got proposed)", () => {
    const decisions: Decision[] = [
      { id: "cn-3", expected: "reject" },
    ];
    const result = scoreDecisions(fileWithFootnotes, decisions);
    expect(result.results[0].correct).toBe(false);
    expect(result.results[0].actual).toBe("proposed");
  });

  it("handles not_found proposals", () => {
    const decisions: Decision[] = [
      { id: "cn-99", expected: "accept" },
    ];
    const result = scoreDecisions(fileWithFootnotes, decisions);
    expect(result.results[0].actual).toBe("not_found");
    expect(result.results[0].correct).toBe(false);
  });

  it("checks amended_contains for amend decisions", () => {
    const amendedFile = fileWithFootnotes.replace("GraphQL", "gRPC").replace("rejected", "accepted");
    const decisions: Decision[] = [
      { id: "cn-2", expected: "amend", amended_contains: "gRPC" },
    ];
    const result = scoreDecisions(amendedFile, decisions);
    expect(result.results[0].amendedTextMatch).toBe(true);
  });

  it("reports accuracy correctly", () => {
    const decisions: Decision[] = [
      { id: "cn-1", expected: "accept" },
      { id: "cn-2", expected: "reject" },
      { id: "cn-3", expected: "reject" },
    ];
    const result = scoreDecisions(fileWithFootnotes, decisions);
    expect(result.correct).toBe(2);
    expect(result.total).toBe(3);
    expect(result.accuracy).toBeCloseTo(2 / 3);
  });
});

describe("detectRegressions", () => {
  it("reports no regressions when settled matches golden", () => {
    const text = "Line one\nLine two\nLine three\n";
    const result = detectRegressions(text, text, []);
    expect(result.count).toBe(0);
  });

  it("reports regression for unexpected line changes", () => {
    const golden = "Line one\nLine two\nLine three\n";
    const settled = "Line one\nLine TWO\nLine three\n";
    const result = detectRegressions(settled, golden, []);
    expect(result.count).toBe(1);
    expect(result.details[0].line).toBe(2);
    expect(result.details[0].expected).toBe("Line two");
    expect(result.details[0].actual).toBe("Line TWO");
  });

  it("excludes lines explained by known corrections", () => {
    const golden = "The deployed app is persistent.\n";
    const settled = "The deployed app is persistent.\n";
    const corrections: Correction[] = [
      { id: "s1", category: "spelling", wrong: "depolyed", correct: "deployed" },
      { id: "s2", category: "spelling", wrong: "persistant", correct: "persistent" },
    ];
    const result = detectRegressions(settled, golden, corrections);
    expect(result.count).toBe(0);
  });

  it("detects regression even on lines with corrections", () => {
    const golden = "The deployed app works.\n";
    const settled = "The deployed application works.\n";
    const corrections: Correction[] = [
      { id: "s1", category: "spelling", wrong: "depolyed", correct: "deployed" },
    ];
    const result = detectRegressions(settled, golden, corrections);
    expect(result.count).toBe(1);
  });
});

describe("verify", () => {
  it("loads assertions and scores an after/ directory", async () => {
    const tmpFixture = await fs.mkdtemp(path.join(os.tmpdir(), "verify-fixture-"));
    const tmpResults = await fs.mkdtemp(path.join(os.tmpdir(), "verify-results-"));
    const afterDir = path.join(tmpResults, "after");
    await fs.mkdir(afterDir);

    await fs.writeFile(path.join(tmpFixture, "assertions.json"), JSON.stringify({
      task: "test",
      type: "error-fix",
      scoring: {
        corrections: [
          { id: "s1", category: "spelling", wrong: "depolyed", correct: "deployed" },
        ],
        decisions: [],
        golden_file: "golden.md",
      },
    }));
    await fs.writeFile(path.join(tmpFixture, "golden.md"), "The deployed app.\n");

    await fs.writeFile(path.join(afterDir, "doc.md"), "The deployed app.\n");

    const result = await verify(afterDir, path.join(tmpFixture, "assertions.json"), "A");
    expect(result.corrections.score).toBe(1);
    expect(result.corrections.accuracy).toBe(1);
    expect(result.regressions.count).toBe(0);

    await fs.rm(tmpFixture, { recursive: true });
    await fs.rm(tmpResults, { recursive: true });
  });

  it("handles decision-only tasks", async () => {
    const tmpFixture = await fs.mkdtemp(path.join(os.tmpdir(), "verify-fixture-"));
    const tmpResults = await fs.mkdtemp(path.join(os.tmpdir(), "verify-results-"));
    const afterDir = path.join(tmpResults, "after");
    await fs.mkdir(afterDir);

    await fs.writeFile(path.join(tmpFixture, "assertions.json"), JSON.stringify({
      task: "test-decision",
      type: "decision",
      scoring: {
        corrections: [],
        decisions: [
          { id: "cn-1", expected: "accept" },
        ],
      },
    }));

    const content = "Text {++added++}[^cn-1] here.\n\n[^cn-1]: @ai:test | 2026-01-01 | ins | accepted\n";
    await fs.writeFile(path.join(afterDir, "doc.md"), content);

    const result = await verify(afterDir, path.join(tmpFixture, "assertions.json"), "F");
    expect(result.decisions.correct).toBe(1);
    expect(result.decisions.total).toBe(1);

    await fs.rm(tmpFixture, { recursive: true });
    await fs.rm(tmpResults, { recursive: true });
  });
});
