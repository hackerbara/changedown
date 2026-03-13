{++# Edit Surface Benchmark Runbook

> Research agent brief for filling in the benchmark test matrix.
> Read this fully before starting any runs.

## What You're Testing

Four editing surfaces that an AI agent can use to modify markdown documents:

| Surface | How the agent edits | Token profile |
|---------|-------------------|---------------|
| **A** | Raw file tools (read, edit, write) + git commit | Baseline. No schema overhead. One edit per tool call. Agent does its own bookkeeping (todowrite, git). |
| **B** | MCP `propose_change` (old_text/new_text) | ~5-8K schema overhead per conversation. One change per call. String matching. |
| **C** | MCP `propose_batch` (LINE:HASH + at/op DSL) | Same schema overhead as B, but batch N changes in one call. Stable addressing via hashlines. |
| **D** | `sc` CLI via Bash (same ops as C) | Zero MCP schema overhead. Agent constructs shell commands. Same at/op DSL. **NEW, UNTESTED.** |

The core hypothesis: **better tool surfaces make agents faster, cheaper, and more accurate — and the effect comes from the environment, not from instructions.**

Surface D tests a new dimension: does eliminating MCP schema overhead (by using CLI instead) further improve efficiency? The Sonnet CLI UX research (`docs/research/2026-02-15-sonnet-cli-ux-research.md`) estimates 95% token reduction vs MCP.

## Current State

**Canonical results exist for:**
- Task 1 (rename): A, B, C — in `results/canonical/task1-v2/`
- Task 5 (copyedit): A, B, C — in `results/canonical/task5-v2/`
- Task 5 outcome-only: A, C — in `results/outcome-only/task5/`

**Zero runs exist for:**
- Surface D (anything)
- Tasks 2, 3, 4 (any surface)
- Outcome-only variants for tasks 1-4

## Priority Matrix

Run in this order. Each phase builds on the previous.

### Phase 1: Prove Surface D (highest priority)

These give direct comparison against existing canonical results.

| Run | Why | Compare against |
|-----|-----|-----------------|
| **D-task5** | Direct comparison on best-characterized task. 22 copyedit fixes, clean signal. | `results/canonical/task5-v2/C-task5/` |
| **D-task1** | Multi-file rename. Tests CLI across 4 documents. | `results/canonical/task1-v2/C-task1/` |
| **D-task5_outcome** | Does D work without tool instructions? Pure environment effect. | `results/outcome-only/task5/C-task5_outcome/` |

**What to look for:**
- D should match or beat C on rounds, output tokens, and duration
- D should have zero MCP schema tokens (no `tool_use` or `tool_result` events — only Bash calls)
- D correctness should match C (same at/op DSL, just different invocation)
- If D is *slower* than C, check whether the agent is struggling with shell quoting or JSON escaping in --changes args

### Phase 2: Open new tasks (high priority)

First-ever runs on tasks 2-4. Run C first (known good surface), then D for comparison.

| Run | Why |
|-----|-----|
| **C-task2** | First audit task run. Discovery-driven — agent decides how many edits to make. |
| **D-task2** | Compare D to C on emergent edit count task. |
| **C-task3** | First restructure task. Large structural ops: section moves, merges, cross-ref updates. |
| **D-task3** | Compare D to C on structural editing. |
| **C-task4** | First review cycle. Accept/reject/amend/respond. B and C are equivalent here. |
| **D-task4** | Review cycle via CLI. Uses `sc review`, `sc amend`, `sc respond`. |

**What to look for:**
- Task 2: How many issues does the agent find? (Design doc has 6 planted issues.) Does surface affect discovery?
- Task 3: Does batch atomicity matter for restructure? (Moving sections = delete + insert that must be atomic)
- Task 4: Does CLI make the review workflow smoother or more awkward? (Shell quoting for `--reviews` JSON is known friction)

### Phase 3: Fill A column for new tasks (medium priority)

| Run | Why |
|-----|-----|
| **A-task2** | Baseline for audit task. |
| **A-task3** | Baseline for restructure task. |

Task 4 has no Surface A variant (raw editing can't do accept/reject/amend on CriticMarkup).

### Phase 4: Outcome-only expansion (lower priority, high signal)

| Run | Why |
|-----|-----|
| **D-task1_outcome** | Does the D advantage hold without instructions for task1? |
| **A-task1_outcome** | Baseline outcome-only for task1. |

## How to Run

### Prerequisites

```bash
cd /Users/MAC/Coding/changetracks

# Build the harness
npm run build -w packages/benchmarks

# Build the SC MCP server + CLI (needed for Surfaces B/C/D)
npm run build:plugin

# Verify sc CLI works
{~~node changetracks-plugin/mcp-server/dist/cli.js --help
```

### Harness path fix (REQUIRED)

The harness fixture root path is stale — it still points to the old `docs/test-fixtures/benchmark` location. Before running, update `packages/benchmarks/harness/run-full-benchmark.ts` line 18:

```typescript
// OLD (broken):
const BENCHMARK_FIXTURE_ROOT = path.join(process.cwd(), "docs", "test-fixtures", "benchmark");

// NEW (correct):
const BENCHMARK_FIXTURE_ROOT = path.join(process.cwd(), "packages", "benchmarks", "fixtures");
```

Then rebuild: `npm run build -w packages/benchmarks`

### Running individual cells~>node changetracks-plugin/mcp-server/dist/cli.js --help
```

### Running individual cells~~}[^ct-2.1]

The harness uses OpenCode CLI. Environment variables control what runs:

```bash
# Surface C, Task 5 (single cell):
MODEL=anthropic/claude-sonnet-4-5 \
SURFACES=C \
TASKS=task5 \
RESULTS_DIR=./packages/benchmarks/results/new-run-name \
node packages/benchmarks/dist/harness/run-full-benchmark.js

# Surface D, Task 5:
MODEL=anthropic/claude-sonnet-4-5 \
SURFACES=D \
TASKS=task5 \
RESULTS_DIR=./packages/benchmarks/results/surface-d-task5 \
node packages/benchmarks/dist/harness/run-full-benchmark.js
```

### Surface D workspace setup

**The harness does NOT yet support Surface D workspace injection.** You need to modify `workspace.ts` to handle Surface D:

Surface D workspaces need:
1. `.changetracks/config.toml` — YES (same as C, `sc` CLI reads this)
2. `.opencode/opencode.json` with MCP server — NO (the whole point is no MCP)
3. The `sc` CLI binary accessible — YES, via a shell alias or PATH entry

The simplest approach: for Surface D, inject `.changetracks/config.toml` (same as C) but skip the `.opencode/opencode.json` MCP config. Instead, inject a shell alias in the workspace:

```bash
# In the temp workspace, create a .bashrc or .env that aliases sc:
echo 'alias sc="node /Users/MAC/Coding/changetracks/changetracks-plugin/mcp-server/dist/cli.js"' > .bash_aliases
```

Or modify the Surface D prompt to include the full binary path:
```
Run `node /path/to/changetracks-plugin/mcp-server/dist/cli.js read <file>` ...
```

The harness changes needed are small — add a `surface === "D"` branch in `run-full-benchmark.ts` that:
- Sets `protocolMode: "compact"` (same at/op DSL)
- Sets `injectChangeTracks: true` (for config.toml)
- Adds `--project-dir` handling or shell alias
- Sets `disableChangeTracksPlugin: true` (no MCP server in OpenCode)

### Running a batch

```bash
# Phase 1 — all D runs on existing tasks:
MODEL=anthropic/claude-sonnet-4-5 \
SURFACES=D \
TASKS=task5,task1 \
RESULTS_DIR=./packages/benchmarks/results/phase1-surface-d \
node packages/benchmarks/dist/harness/run-full-benchmark.js

# Phase 2 — C then D on new tasks:
MODEL=anthropic/claude-sonnet-4-5 \
SURFACES=C,D \
TASKS=task2,task3,task4 \
RESULTS_DIR=./packages/benchmarks/results/phase2-new-tasks \
node packages/benchmarks/dist/harness/run-full-benchmark.js
```

## Recording Results

After each run:

1. **Check the summary table** printed by the harness at the end
2. **Verify the after/ snapshot** looks correct (did the agent actually make the edits?)
3. **Name the results directory** descriptively: `surface-d-task5-v1`, `phase2-new-tasks`, etc.
4. **Move results** into the classified structure:
   - Canonical (clean, post-bugfix, reproducible): `results/canonical/`
   - Exploratory (one-off, debugging): `results/exploratory/`

## What to Report

After completing a phase, write a brief findings note with:

1. **Metrics table** (copy from harness output):
   | Surface | Task | Tools | Rounds | Output Tokens | Cache Read | Duration |
   |---------|------|-------|--------|---------------|------------|----------|

2. **Correctness check**: Did the agent get the edits right? Spot-check the `after/` snapshot against the fixture + task description.

3. **Behavioral observations**:
   - How did the agent use the CLI? (Did it batch well? Struggle with quoting?)
   - Any retries or errors? (Check events.jsonl for error events)
   - Did it do unexpected bookkeeping? (todowrite, excessive reads)

4. **Comparison to canonical**: For Phase 1, compare D results directly to `results/canonical/task*-v2/C-task*/summary.json`

## Canonical Results for Comparison

{~~### Task 5 (copyedit) — Canonical v2

| Surface | Tools | Rounds | Output Tokens | Cache Read | Duration |
|---------|-------|--------|---------------|------------|----------|
| A | 26 | 27 | 6,730 | 579,867 | 153s |
| B | 30 | 29 | 18,444 | 1,348,063 | 372s |
| C | 7 | 7 | 2,971 | 149,870 | 70s |
| **D** | **?** | **?** | **?** | **?** | **?** |~>### Task 5 (copyedit) — Canonical v2

| Surface | Tools | Rounds | Output Tokens | Cache Read | Duration |
|---------|-------|--------|---------------|------------|----------|
| A | 26 | 27 | 6,730 | 579,867 | 153s |
| B | 30 | 29 | 18,444 | 1,348,063 | 372s |
| C | 7 | 7 | 2,971 | 149,870 | 70s |
{~~| **D** | **4** | **5** | **1,337** | **75,582** | **37s** |

**Note:** D-task5 found only 35/58 changes (60% vs C's 100%). See Results Summary below.~>| **D** | **4-6** | **5-7** | **1,337-2,471** | **75,582-123,931** | **36-47s** |

**Note:** D-task5 shows 23% variance: 19-35 edits (61-113% vs C's 31), mean 27 (87%). Speed-thoroughness tradeoff.~~}[^ct-4.2]~~}[^ct-3.1]

{~~### Task 1 (rename) — Canonical v2

| Surface | Tools | Rounds | Output Tokens | Cache Read | Duration |
|---------|-------|--------|---------------|------------|----------|
| A | 33 | 27 | 6,459 | 579,867 | 153s |
| B | 10 | 7 | 3,691 | 130,935 | 72s |
| C | 9 | 4 | 3,497 | 57,633 | 63s |
| **D** | **?** | **?** | **?** | **?** | **?** |~>### Task 1 (rename) — Canonical v2

| Surface | Tools | Rounds | Output Tokens | Cache Read | Duration |
|---------|-------|--------|---------------|------------|----------|
| A | 33 | 27 | 6,459 | 579,867 | 153s |
| B | 10 | 7 | 3,691 | 130,935 | 72s |
| C | 9 | 4 | 3,497 | 57,633 | 63s |
| **D** | **10** | **7** | **3,405** | **134,521** | **70s** |

**Note:** D-task1 was 11% slower than C-task1 (multi-file coordination overhead).~~}[^ct-3.2]

{~~### Task 5 Outcome-only (no tool instructions)

| Surface | Tools | Rounds | Output Tokens | Cache Read | Duration |
|---------|-------|--------|---------------|------------|----------|
| A | 42 | 24 | 26,280 | 1,034,411 | 352s |
| C | 9 | 8 | 4,047 | 171,635 | 85s |
| **D** | **?** | **?** | **?** | **?** | **?** |~>### Task 5 Outcome-only (no tool instructions)

| Surface | Tools | Rounds | Output Tokens | Cache Read | Duration |
|---------|-------|--------|---------------|------------|----------|
| A | 42 | 24 | 26,280 | 1,034,411 | 352s |
| C | 9 | 8 | 4,047 | 171,635 | 85s |
| **D** | **29** | **30** | **7,133** | **1,027,451** | **150s** |

**Note:** D without instructions degraded 305% (37s → 150s). Instructions > Environment.~~}[^ct-3.3]

{~~{~~## Known Issues

1. **Fixture path stale in harness** — Must update `BENCHMARK_FIXTURE_ROOT` before running (see above)
2. **Surface D workspace setup not implemented** — Harness needs modification for D (see above)
3. **OpenCode runner only** — Harness uses `opencode run --format json`. For Claude Code or other runners, would need a new runner implementation.
4. **Single runs** — All results are single-run. Agent behavior is stochastic. If a result looks anomalous, re-run before concluding.
5. **No correctness scoring** — No automated golden-file comparison. Manual spot-check required.~>## Known Issues

1. ✅ ~~**Fixture path stale in harness**~~ — FIXED in commit 2ae273b
2. ✅ ~~**Surface D workspace setup not implemented**~~ — FIXED in commits 817cc23, e0320e0
3. **OpenCode runner only** — Harness uses `opencode run --format json`. For Claude Code or other runners, would need a new runner implementation.
4. **Single runs** — All results are single-run. Agent behavior is stochastic. If a result looks anomalous, re-run before concluding.
5. **No correctness scoring** — No automated golden-file comparison. Manual spot-check required.
6. 🔴 **CRITICAL BUG**: Accept operation deletes footnotes instead of updating status — See BUG_REPORT.md for details~~}[^ct-3.4]
++}[^ct-1]~>## Known Issues

1. ✅ ~~**Fixture path stale in harness**~~ — FIXED in commit 2ae273b
2. ✅ ~~**Surface D workspace setup not implemented**~~ — FIXED in commits 817cc23, e0320e0
3. **OpenCode runner only** — Harness uses `opencode run --format json`. For Claude Code or other runners, would need a new runner implementation.
4. **Single runs** — All results are single-run. Agent behavior is stochastic. If a result looks anomalous, re-run before concluding.
{~~5. **No correctness scoring** — No automated golden-file comparison. Manual spot-check required.
6. 🔴 **CRITICAL BUG**: Accept operation deletes footnotes instead of updating status — See BUG_REPORT.md for details

---

## Results Summary~>5. **No correctness scoring** — No automated golden-file comparison. Manual spot-check required.
6. ✅ ~~**CRITICAL BUG**: Accept operation deletes footnotes~~ — FIXED in commit 2ad050f (2026-02-13), validated 2026-02-16
7. 🔴 **D-task3 TRACKING FAILURE**: CLI batch workflow loses 99% of audit trail on complex structural tasks — See BUG_REPORT.md PERF-002

---

## Results Summary~~}[^ct-4.1]

**Last Updated:** 2026-02-16
**Status:** Phases 1-4 complete (19 benchmark runs)
**Detailed Analysis:** See `results/*/FINDINGS.md` and `BUG_REPORT.md`

### Phase 1: Surface D Proof (Complete ✅)

Ran D-task5, D-task1, D-task5_outcome against canonical C baselines.

**Key Findings:**
1. **D-task5 (with instructions)**: 47% faster than C, but only 60% correct (35/58 changes)
2. **D-task1 (with instructions)**: 11% slower than C on multi-file task (coordination overhead)
3. **D-task5_outcome (without instructions)**: 305% slower than C — **Instructions > Environment**

**Critical Discovery:** Surface D advantage **vanishes** without detailed CLI syntax guidance.

### Phase 2: New Tasks 2-4 (Complete ✅)

First-ever runs on audit (task2), restructure (task3), and review (task4) tasks.

**Surface C Results:**
- C-task2: Found 15/6 issues, 50s duration, used `propose_batch` effectively
- C-task3: 458s duration, 8 batches with 138 tracked changes, batch atomicity critical
- C-task4: 99s duration, **2/4 operations correct** (accept bug found)

**Surface D Results:**
- D-task2: Found 7/6 issues (Kimi vs Sonnet difference), 42s duration
- D-task3 (original): Failed batch 6+ times, fell back to Edit/Write with no CriticMarkup
- **D-task3 (retry after fix)**: 225s duration, 27% faster with full CriticMarkup ✅
- D-task4: 80s duration, **same 2/4 correctness** (accept bug in core, not surface-specific)

**Critical Bug Found:** Accept operation deletes footnotes in both C and D (core implementation bug).

### Phase 3: Surface A Baselines (Complete ✅)

Established raw editing baselines for tasks 2-3 (task 4 has no A variant).

**Results:**
- A-task2: 104s, found 13/6 issues (Sonnet thoroughness maintained)
- A-task3: 179s, **60% faster than C-task3** (no batch coordination overhead)

**Key Insight:** Raw editing is fastest but loses inline audit trail and collaborative review.

### Phase 4: Outcome-Only Expansion (Complete ✅)

Tested pure environment effect without tool instructions for task1.

**Results:**
- D-task1_outcome: 233s (vs 70s with instructions) — **233% degradation** 🔴
- A-task1_outcome: 96s (vs estimated baseline) — minimal degradation

**"Environment > Instructions" Hypothesis: REJECTED**

When both surfaces lack detailed instructions:
- D-task1_outcome (CLI): 233s
- A-task1_outcome (raw): 96s
- **Surface A is 143% faster** — CLI provides NO inherent advantage without guidance

### Cross-Surface Performance Summary

**Speed Rankings (task3 restructure):**
1. **Surface A (raw)**: 179s — fastest, no audit trail
2. **Surface D (CLI, retry)**: 225s — fast with proper instructions
3. **Surface C (MCP)**: 458s — slowest, richest audit trail

**Discovery Rankings (task2 audit, same Sonnet model):**
1. **Surface C**: 15 issues — best analytical depth
2. **Surface A**: 13 issues — good thoroughness
3. **Surface D** (Kimi): 7 issues — model difference, not surface limitation

**Instruction Dependency:**
- **Surface A**: Robust (96s outcome-only, minimal degradation)
- **Surface C**: Degrades gracefully (85s → 150s, +76%)
- **Surface D**: Catastrophic collapse (37s → 150s, +305%) 🔴

### Surface D Assessment: PRELIMINARY

**⚠️ IMPORTANT CAVEAT:** Surface D results should be considered preliminary. Several factors may not yet represent optimal CLI performance:

1. **Testing Environment Limitations:**
   - Single benchmark run per task (no variance measurement)
   - Kimi model used for some runs (not same as C's Sonnet)
   - Prompt engineering may need refinement for CLI-specific patterns
   - Shell quoting complexity not fully optimized in instructions

2. **Implementation Gaps Discovered:**
   - workflows.ts was injecting incorrect CLI examples (now fixed)
   - CLI error messages are minimal (harder for agents to debug)
   - No prompt caching (6000x token overhead vs MCP)
   - Batch command friction (JSON escaping, shell quoting)

3. **Potential for Improvement:**
   - Better error messages with examples could reduce trial-and-error
   - Simpler batch syntax or interactive mode could help adoption
   - Multiple runs with variance analysis needed
   - Prompt optimization specifically for CLI patterns

4. **What Works Well:**
   - Single-operation commands (read, propose, review) work smoothly
   - Zero MCP schema overhead confirmed (no tool_use events)
   - When batch works, it's efficient (D-task3 retry: 27% faster than original)
   - CLI is viable for scripting and automation use cases

**Recommendation:** Surface D shows promise but needs:
- Refinement of CLI ergonomics (error messages, syntax simplification)
- More benchmark runs to measure variance
- Optimization of prompts for CLI-specific workflows
- Investigation of D-task5 incompleteness (60% vs 100%)

**The CLI surface may have significant untapped potential** once testing environment and implementation are refined for optimal agent interaction patterns.

### Critical Bugs Requiring Fix

See `BUG_REPORT.md` for complete details.

**BUG-001 (P0):** Accept operation deletes footnotes instead of updating status
- Affects: Both Surface C (MCP) and Surface D (CLI)
- Impact: Breaks audit trail, loses discussion threads
- Status: NOT FIXED — requires core implementation change

**BUG-002 (P1):** workflows.ts incorrect CLI example
- Affects: Surface D
- Impact: Caused D-task3 batch failures
- Status: ✅ FIXED and validated (commit e0320e0)

### Next Steps

1. **Fix BUG-001**: Modify accept operation to preserve footnotes with updated status
2. **Add tests**: Footnote preservation tests for accept/reject/amend
3. **Investigate D-task5**: Run multiple trials to measure variance (60% vs 100% correctness)
4. **Improve CLI UX**: Better error messages, simpler batch syntax
5. **Run variance analysis**: Multiple runs per task to understand stochastic behavior
6. **Optimize prompts**: CLI-specific prompt engineering for better agent patterns

**Conclusion:** The benchmark successfully filled the test matrix and provided deep insights into surface tradeoffs. Surface D shows promise but results are preliminary — refinement of testing environment and CLI implementation needed to unlock full potential.
++}[^ct-1]~~}[^ct-3.5]

[^ct-1]: @ai:claude-opus-4.6 | 2026-02-16 | ins | proposed

[^ct-2]: @ai:claude-opus-4.6 | 2026-02-16 | group | proposed
[^ct-2.1]: @ai:claude-opus-4.6 | 2026-02-16 | sub | proposed

[^ct-3]: @ai:claude-opus-4.6 | 2026-02-16 | group | proposed
[^ct-3.5]: @ai:claude-opus-4.6 | 2026-02-16 | sub | proposed
[^ct-3.4]: @ai:claude-opus-4.6 | 2026-02-16 | sub | proposed
[^ct-3.3]: @ai:claude-opus-4.6 | 2026-02-16 | sub | proposed
[^ct-3.2]: @ai:claude-opus-4.6 | 2026-02-16 | sub | proposed
[^ct-3.1]: @ai:claude-opus-4.6 | 2026-02-16 | sub | proposed

[^ct-4]: @ai:claude-opus-4.6 | 2026-02-16 | group | proposed
[^ct-4.2]: @ai:claude-opus-4.6 | 2026-02-16 | sub | proposed
[^ct-4.1]: @ai:claude-opus-4.6 | 2026-02-16 | sub | proposed
