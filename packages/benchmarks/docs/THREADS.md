# Open Threads — Edit Surface Benchmarks

Tracks unfinished work, open questions, and next steps for the benchmark suite.

## Unexecuted Tasks

### T1: Tasks 2, 3, 4 have zero benchmark runs
- **Status:** Fixtures exist, prompts defined in `prompts.json`, zero runs executed
- **Fixtures:** `fixtures/task2-audit/`, `fixtures/task3-restructure/`, `fixtures/task4-review/`
- **Blocked by:** Nothing — ready to run
- **Design:** `docs/plans/2026-02-15-edit-surface-benchmark-design.md`

### T2: Task5-probe fixture not created
- **Status:** Described in "benchmark of our dreams" doc, not implemented
- **Description:** Minimally modified Task 5 with near-duplicate strings to stress ambiguity handling
- **Design:** `docs/plans/2026-02-16-benchmark-of-our-dreams.md`

### T3: Outcome-only variants only done for Task 5
- **Status:** Task 5 outcome-only (no tool instructions) shows 3x/6.5x improvement for Surface C
- **Gap:** Should repeat for Tasks 1-4 to confirm effect generalizes
- **Result:** `results/outcome-only/task5/`

## Missing Rigor

### T4: No correctness scoring
- **Status:** All metrics are efficiency (tokens, rounds, duration). No automated check of "did the agent get the edits right?"
- **Needed:** Golden files in `golden/` directory, diff-based scoring
- **Design:** `docs/plans/2026-02-16-benchmark-of-our-dreams.md` (correctness score in primary metrics)

### T5: Single runs, no variance measurement
- **Status:** Each cell has exactly 1 run. Agent behavior is stochastic.
- **Needed:** N>=2 for high-variance cells (outcome-only at minimum)
- **Design:** Dreams doc specifies 2 runs for task5_outcome, 1 for instructed

### T6: Multi-model comparison not done
- **Status:** Only Claude Sonnet 4.5 tested via OpenCode
- **Planned:** Kimi, local model
- **Design:** Dreams doc (3 models)

### T7: Assumption verification ledger not checked
- **Status:** Dreams doc defines 3 explicit assumption checks, none executed
- **Assumptions:**
  1. A-overhead comes from one-edit-per-round pattern (check: count edit calls + bookkeeping)
  2. C-overhead reduction comes from batch expression (check: count propose_batch calls)
  3. C stability comes from addressing, not luck (check: retry/error signatures)
- **Design:** `docs/plans/2026-02-16-benchmark-of-our-dreams.md`

## Infrastructure Gaps

### T8: Harness tied to OpenCode CLI
- **Status:** Harness uses `opencode run --format json` subprocess
- **Gap:** No support for Claude Code, Cursor, or other runners
- **Impact:** Limits model coverage

### T9: "Benchmark of our dreams" protocol not started
- **Status:** Full pre-registered protocol designed with 4 claims, falsification criteria, 24 planned runs
- **Gap:** Zero runs from this protocol executed
- **Design:** `docs/plans/2026-02-16-benchmark-of-our-dreams.md`

## Data Quality

### T10: Bug impact on pre-fix results
- **Status:** 4 propose_batch bugs fixed in commit `5962059` mid-benchmarking
- **Impact:** Pre-fix Surface C results are unreliable (canonical-task5 pre-bugfix had broken C)
- **Labeled:** Pre-fix results in `results/exploratory/` with clear names
- **Gap:** No post-fix re-run of affected cells for direct comparison

### T11: Minor metric discrepancies in findings doc
- **Source:** `docs/research/2026-02-16-edit-surface-tool-surface-audit.md`
- **Issues:**
  - Surface A outcome-only todowrite count: findings says 20, raw trace shows 19
  - Surface A outcome-only git commit count: findings says 3 (needs verification)
- **Impact:** Cosmetic, does not affect conclusions

## Uncategorized

### T12: benchmark-adr fixture relationship unclear
- **Location:** `fixtures/benchmark-adr/`
- **Status:** Early-era fixture (Qwen/Kimi, 2026-02-13) with golden file
- **Question:** Is this task6? A replacement for task3? Or a deprecated prototype?
- **Has golden file:** Yes (`adr-007-golden.md`) — the only fixture with one

### T13: Phase B tie-breaker expansion not implemented
- **Status:** Dreams doc defines trigger conditions for +8 runs if Phase A has mixed results
- **Blocked by:** Phase A not started (T9)

### T14: Surface D (sc CLI) has zero benchmark runs
- **Status:** Prompts defined for all tasks in `prompts.json`, types updated in harness
- **Hypothesis:** CLI eliminates MCP schema overhead (~5-8K tokens/conversation), should match or beat Surface C
- **Research:** `docs/research/2026-02-15-sonnet-cli-ux-research.md` (Sonnet first-use, rates 7/10, finds 95% token reduction vs MCP)
- **Blocked by:** Harness needs CLI runner support (T8), `sc` binary needs to be available in benchmark workspace
- **Priority:** High — directly tests "environment over instruction" principle in a new dimension (tool invocation mechanism)
