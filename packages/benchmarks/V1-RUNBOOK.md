# V1 Benchmark Runbook

> Research agent brief for validating the V1 ecology through benchmark runs.
> Read this fully before starting any runs.
> Design doc: `docs/plans/2026-02-24-v1-benchmark-pressure-test-design.md`

## What You're Testing

Two shipping configurations of the V1 ecology — the complete agent experience, not individual tools:

| Surface | Protocol | Read Format | Write Mechanism | Tools |
|---------|----------|-------------|-----------------|-------|
| **F** (V1-Classic) | Classic | Three-zone review | `old_text`/`new_text` | 7 |
| **G** (V1-Compact) | Compact | Three-zone review | `at`+`op` hash DSL | 7 |

Compared against existing baselines:

| Surface | What it was | Existing Kimi data |
|---------|-------------|-------------------|
| **A** | Raw file tools, no ChangeTracks | task5_v2: 17-21 tools, 4,128-6,702 output tokens |
| **C** | Old compact mode (5 tools, bracket annotations) | task5_v2: 6 tools, 3,435 output tokens |

The core question: **does the V1 ecology make agents better at their tasks than raw editing, while maintaining the efficiency gains that Surface C demonstrated?**

## Prerequisites

```bash
cd /Users/MAC/Coding/changetracks

# 1. Build everything
npm run build -w packages/benchmarks
npm run build:plugin

# 2. Verify MCP server works
node changetracks-plugin/mcp-server/dist/index.js --help

# 3. Verify harness works
node packages/benchmarks/dist/harness/run-full-benchmark.js --help
```

**IMPORTANT**: Before running, verify that:
- The meta-renderer produces three-zone format (`` at end of line)
- SKILL.md lists all 7 tools
- Surfaces F and G are defined in `workflows.ts` and `prompts.json`

If any of these are missing, the implementation plan hasn't been executed yet. Stop and report.

## Phase 1: Regression (Run First)

These verify that V1-Compact hasn't regressed from the old Surface C efficiency.

| Run | Command |
|-----|---------|
| G-task5_v2 | `MODEL=opencode/kimi-k2.5-free SURFACES=G TASKS=task5_v2 RESULTS_DIR=./packages/benchmarks/results/v1-phase1 node packages/benchmarks/dist/harness/run-full-benchmark.js` |
| F-task5_v2 | `MODEL=opencode/kimi-k2.5-free SURFACES=F TASKS=task5_v2 RESULTS_DIR=./packages/benchmarks/results/v1-phase1 node packages/benchmarks/dist/harness/run-full-benchmark.js` |
| G-task1 | `MODEL=opencode/kimi-k2.5-free SURFACES=G TASKS=task1 RESULTS_DIR=./packages/benchmarks/results/v1-phase1 node packages/benchmarks/dist/harness/run-full-benchmark.js` |
| F-task1 | `MODEL=opencode/kimi-k2.5-free SURFACES=F TASKS=task1 RESULTS_DIR=./packages/benchmarks/results/v1-phase1 node packages/benchmarks/dist/harness/run-full-benchmark.js` |

Or batch:
```bash
MODEL=opencode/kimi-k2.5-free \
SURFACES=F,G \
TASKS=task5_v2,task1 \
RESULTS_DIR=./packages/benchmarks/results/v1-phase1 \
node packages/benchmarks/dist/harness/run-full-benchmark.js
```

### What to look for (Phase 1)

**G-task5_v2 (regression check):**
- Tools: ≤10 (C baseline: 6)
- Rounds: ≤10 (C baseline: 7)
- Output tokens: ≤5,000 (C baseline: 3,435)
- If worse: check whether 7-tool schema overhead caused the agent to struggle, or whether three-zone metadata confused the read

**F-task5_v2 (classic mode check):**
- Should beat A-task5_v2 on output tokens (A: 4,128-6,702)
- Classic mode is new territory — this is the first benchmark of classic protocol with three-zone format
- Watch for: does the agent struggle with `old_text` matching? Does it re-read excessively?

**Correctness:**
- Spot-check `after/` snapshot: did the agent find the copyedit errors?
- Compare change count against C baseline (~22 planted errors)
- Check `events.jsonl` for error events or retries

## Phase 2: Forward (Run Second)

These test V1 features that old surfaces couldn't exercise.

| Run | Command |
|-----|---------|
| G-task4 | `MODEL=opencode/kimi-k2.5-free SURFACES=G TASKS=task4 RESULTS_DIR=./packages/benchmarks/results/v1-phase2 node packages/benchmarks/dist/harness/run-full-benchmark.js` |
| F-task4 | `MODEL=opencode/kimi-k2.5-free SURFACES=F TASKS=task4 RESULTS_DIR=./packages/benchmarks/results/v1-phase2 node packages/benchmarks/dist/harness/run-full-benchmark.js` |
| G-task2 | `MODEL=opencode/kimi-k2.5-free SURFACES=G TASKS=task2 RESULTS_DIR=./packages/benchmarks/results/v1-phase2 node packages/benchmarks/dist/harness/run-full-benchmark.js` |
| G-task3 | `MODEL=opencode/kimi-k2.5-free SURFACES=G TASKS=task3 RESULTS_DIR=./packages/benchmarks/results/v1-phase2 node packages/benchmarks/dist/harness/run-full-benchmark.js` |

### What to look for (Phase 2)

**G/F-task4 (review showcase):**
- Does the agent correctly read three-zone format and identify proposals?
- Does it use `amend_change` for ct-2? (The task requires amending)
- Does it use `review_changes` with reviews array for accept/reject?
- Does it respond to the discussion thread?
- Compare F vs G: does operator convergence help compact mode?

**G-task2 (audit):**
- How many issues does the agent find? (6 planted issues)
- Does the three-zone format help or hinder discovery?
- Compare against old C-task2 if available

**G-task3 (restructure):**
- Does batch atomicity work for structural ops?
- How does the agent handle section moves?

## Future Phases (Not This Run)

## Post-Improvements Validation (2026-02-26)

> Comprehensive re-run after 48 hours of agent improvements.
> All runs: Sonnet (claude-sonnet-4-5), OpenCode 1.1.53
> Results: `results/post-improvements/`

### Changes Under Test

| Change | Impact |
|--------|--------|
| Semantic overlap guard rewrite | Only blocks edits overlapping **proposed** changes; settled refs/decided changes no longer block |
| Ref preservation algorithm | `[^ct-N]` refs transparently preserved through edits |
| First-contact protocol teaching | Editing guide delivered on first `read_tracked_file` call |
| SKILL.md multi-file guidance | New section on efficient multi-file editing patterns |
| `reasoning` → `reason` schema fix | All tool schemas standardized |
| `propose_batch` removal | Compact mode uses `propose_change` with `changes` array |
| Settled change recovery | `list_changes` now returns settled changes via synthesized ChangeNodes |
| Engine migration to packages/cli | All handler logic moved — regression surface |

### Results: F/G vs Previous Baselines

| Surface | Task | Tools | LLM Calls | Output Tokens | Duration | Previous Tokens | Delta |
|---------|------|-------|-----------|---------------|----------|-----------------|-------|
| F | task5_v2 | 4 | 5 | 3,186 | 66s | 9,355 | **-66%** |
| G | task5_v2 | 7 | 8 | 3,429 | 68s | 2,190 | +57% *(1)* |
| F | task4 | 4 | 4 | 1,155 | 31s | 1,197 | -4% |
| G | task4 | 5 | 4 | 1,564 | 43s | 1,468 | +7% |
| F | task1 | 15 | 10 | 4,827 | 82s | 5,580 | **-14%** |
| G | task1 | 14 | 9 | 4,211 | 98s | 6,104 | **-31%** |
| F | task5_mixed | 2 | 3 | 3,030 | 63s | 3,408 | **-11%** |
| G | task5_mixed | 2 | 3 | 1,761 | 41s | 2,010 | **-12%** |

*(1) G-task5_v2 regression: first-contact guide induced 4 extra re-reads + per-change review instead of group review. Fixable by rejecting no-op proposals server-side.*

### Results: New Baselines (No Prior Data)

| Surface | Task | Tools | LLM Calls | Output Tokens | Duration | Notes |
|---------|------|-------|-----------|---------------|----------|-------|
| F | task2 | 4 | 5 | 3,051 | 61s | Audit: discovery-driven |
| G | task2 | 11 | 12 | 3,120 | 89s | G used todowrite for planning |
| F | task3 | 14 | 15 | 7,413 | 171s | Restructure: 4 structural ops |
| G | task3 | 19 | 20 | 6,953 | 174s | Similar duration, more tool calls |
| F | task5 | 4 | 5 | 3,152 | 75s | Prescriptive copy-edit |
| G | task5 | 3 | 4 | 2,113 | 46s | Fastest copy-edit run |

### Results: Surface A Baselines (Sonnet)

| Surface | Task | Tools | LLM Calls | Output Tokens | Duration | Notes |
|---------|------|-------|-----------|---------------|----------|-------|
| A | task5_v2 | 38 | 46 | 14,256 | 262s | 21 real edits, valid |
| A | task5_mixed | 25 | 27 | 10,876 | 200s | 20 edits, respected existing proposals |

### Surface A vs F/G Efficiency (task5_v2)

| Surface | Output Tokens | Tools | Time | vs A Tokens | vs A Speed |
|---------|---------------|-------|------|-------------|------------|
| A | 14,256 | 38 | 262s | baseline | baseline |
| F | 3,186 | 4 | 66s | **4.5x better** | **4.0x faster** |
| G | 3,429 | 7 | 68s | **4.2x better** | **3.9x faster** |

### Verification Summary

All runs verified by subagents reading `after/` workspace snapshots:

| Run | Verdict | Notes |
|-----|---------|-------|
| A-task5_v2 | **VALID** | 21 real copy-edits, no hallucination |
| A-task5_mixed | **VALID** | 20 edits, all existing CriticMarkup proposals byte-identical |
| F-task5 | **VALID** | 37 changes, one malformed substitution on line 187 (BUG-003, under investigation) |
| G-task5 | **VALID** | 25 changes, clean output |
| F-task4 | **VALID** | All 4 actions correct: accept, amend, reject, thread response |
| G-task4 | **VALID** | All 4 actions correct |

### Key Observations

1. **F-task5_v2 massive improvement (-66%)**: 9,355 → 3,186 tokens. First-contact guide and SKILL.md improvements reduced wasted effort.
2. **G-task1 significant improvement (-31%)**: 6,104 → 4,211 tokens. SKILL.md multi-file guidance working.
3. **task5_mixed very efficient**: Both F (2 tools) and G (2 tools) completed with minimal overhead.
4. **BUG-001 FIXED**: task4 now achieves 4/4 operations correct on both F and G (was 2/4).
5. **BUG-003 found**: Malformed `{~~...~~}` substitution in F-task5 line 187 (tool-level, under investigation).

## Post-Hygiene-Fix Sonnet Sweep (2026-02-27)

> Full A/F/G surface sweep after footnote-ref hygiene fixes.
> All runs: Sonnet 4.5 (anthropic/claude-sonnet-4-5), OpenCode
> Fixes under test: hash normalization, affected_lines windowing, segment builder compaction
> Results: `results/sonnet-afg-2026-02-27/`

### Changes Under Test

| Change | Commit | Impact |
|--------|--------|--------|
| Strip `[^ct-N]` before hashing | `08fbc19e` | Hash stability when refs added/removed during settlement |
| Bounded affected_lines for classic path | `65927d10` | 3 files fixed: file-ops, propose-change, propose-batch |
| Segment builder for settlement | `d23001e5` | Forward-order assembly prevents compaction duplication |
| computeAcceptParts/computeRejectParts | `38a2d9ba` | Separated text+ref extraction for segment builder |

### Results: Sonnet A/F/G Sweep

| Surface | Task | Tools | LLM Calls | Output Tokens | Duration | Notes |
|---------|------|-------|-----------|---------------|----------|-------|
| A | task1 | 38 | 34 | 6,685 | 140s | Retry after auth glitch on first attempt |
| F | task1 | 14 | 8 | 4,056 | 88s | 4 propose + 4 review per doc |
| G | task1 | 15 | 6 | 2,964 | 51s | Parallel propose+review, 1 re-read |
| A | task2 | 26 | 21 | 6,860 | 116s | todowrite planning, 7 edits, git commit |
| F | task2 | 7 | 7 | 3,065 | 77s | 2 batch propose + 1 review cycle |
| G | task2 | 10 | 11 | 3,123 | 72s | 5 proposes + 1 review, 1 re-read |
| A | task3 | 28 | 29 | 9,134 | 265s | todowrite planning, 5 edits, grep/read verification |
| F | task3 | 19 | 20 | 7,512 | 179s | 1 big batch propose, 8 re-reads, 2 review cycles |
| G | task3 | 47 | 48 | 15,847 | 411s | BLOWUP: propose-reread loop, timeout hit, supersede+amend used |
| A | task4 | 15 | 14 | 3,800 | 90s | 6 edits on CriticMarkup + footnotes, 4 bash for git |
| F | task4 | 4 | 4 | 1,392 | 37s | Single read + parallel amend+review — perfect |
| G | task4 | 5 | 4 | 1,235 | 35s | Same pattern, parallel tool calls |
| A | task5_v2 | 21 | 23 | 7,303 | 145s | todowrite planning, multi-file edits, git commit |
| F | task5_v2 | 19 | 20 | 5,133 | 125s | batch propose, multiple review cycles |
| G | task5_v2 | 7 | 8 | 2,331 | 61s | Efficient: 4 proposes + 1 review |
| A | task5_mixed | 25 | 26 | 6,107 | 121s | 22 sequential edits, 2 bash for git |
| F | task5_mixed | 3 | 4 | 3,692 | 75s | 1 read + 1 batch propose + 1 review — extremely efficient |
| G | task5_mixed | 2 | 3 | 1,792 | 38s | 1 read + 1 batch propose — most efficient run in sweep | 

### Verification Summary

| Run | Verdict | Notes |
|-----|---------|-------|

### Key Observations

1. **G-surface consistently most efficient**: G (compact/at+op) beat F (classic/old_text) on every task except task3 blowup. G averaged 30-60% lower output tokens than F.
2. **G-task3 blowup is the outlier**: 47 tools, 411s. Propose-reread loop on structural edits. F handled same task in 19 tools/179s. Compact mode needs guardrails for large restructuring.
3. **task5_mixed best demonstrates surface differences**: A=25 tools/121s, F=3 tools/75s, G=2 tools/38s. Batch propose collapses 22 sequential edits into 1 call.
4. **task4 unfair to Surface A**: A had to parse CriticMarkup (15 tools/90s) while F/G used native review tools (4-5 tools/35-37s). task4_git variant now implemented for fair A comparison.
5. **Surface A baseline is fair for editing tasks**: A's prompt adds git commit overhead, but this is representative of real non-tracked-changes workflow.
6. **F and G comparable on review tasks (task4)**: Both achieved 4-5 tools in 35-37s. Review is where the tracked-changes model shines.
7. **Hygiene fixes validated**: No hash mismatches, no oversized affected_lines windows, no compaction duplication across 18 surface runs. 

### Quality Analysis, Re-runs & task8 Results
Detailed analysis: `docs/research/2026-02-27-sonnet-afg-sweep-findings.md`
**task4_git** (fair A review): 10 tools/43s vs original 15 tools/90s — 51% fewer tokens when A uses git-diff instead of CriticMarkup parsing.
**G-task5_v2 HOSPITALITY FAILURE**: 0/25/6 corrections across 3 runs. Original: agent hallucinated target text, server said "Text not found", agent quit. Rerun 1: 25 fixes with contradictory style conventions. Rerun 2: only 6 of ~22 errors found. Server error message reads like system error, not guidance — agent's rational response is premature abandonment.
**G-task3 QUALITY CEILING**: 3/4 on all 3 attempts, each failing a different subtask. Systematic, not variance. 47-tool blowup not reproduced (26, 29 on re-runs).
**A-task3 FLAKY**: Original 2.5/4 (CriticMarkup treated as literal), re-runs 4/4 both times. Stochastic — Sonnet sometimes "sees through" CriticMarkup, sometimes doesn't.
**task8 (CLEANEST COMPARISON)**: F=31/31 (100%), G=30/31 (96.8%), A=29/31 (93.5%). F caught everything including heading caps and "data are". G: 3 tools/52s. A: 27 tools/173s. No CriticMarkup confound, no multi-author confound. F wins quality, G wins efficiency.
**BOTTOM LINE**: F is most reliable (zero failures, 100% on task8). G is most efficient when it works (3 tools/52s on task8) but has variance problems (task5_v2: 0/25/6 across runs, task3: 3/4 ceiling). A is competitive on accuracy but 2.5x slower. The real A disadvantage is efficiency, not quality.
**task8 VARIANCE BASELINE (3 runs each)**: Efficiency is rock-stable. G: 3 tools every run (46-52s). F: 7-10 tools (109-123s). A: 25-27 tools (149-173s). Quality: A consistently misses heading caps (29/31). F consistently catches everything (31/31). G catches headings 1/3 runs (29-31/31). Results: `results/sonnet-task8-var1/`, `results/sonnet-task8-var2/`.
### Automated Quality Baselines (task8, Sonnet 4.5, 3 runs each)

Scored by `verify.ts` against 32 assertion patterns (8 spelling, 3 grammar, 3 redundancy, 4 version, 10 capitalization, 4 formatting).

| Surface | Run 1 | Var 1 | Var 2 | Notes |
|---------|-------|-------|-------|-------|
| A | 27.5/32 (85.9%) | 27.5/32 (85.9%) | 27.5/32 (85.9%) | Rock-stable. Misses heading caps, some formatting |
| F | 32/32 (100.0%) | 31.5/32 (98.4%) | 30/32 (93.8%) | Best accuracy, slight variance in cap detection |
| G | 29/32 (90.6%) | 29/32 (90.6%) | 29/32 (90.6%) | Rock-stable. Misses 2-3 heading caps consistently |

Run: `npx tsx packages/benchmarks/harness/verify.ts --results <dir> --all`

### Post-Matching-Transparency Validation (2026-03-01)

Four matching transparency fixes shipped (confusables removal, footnote ref format, ref-transparent matching, content-zone-only matching). See `docs/plans/2026-02-28-matching-transparency-implementation-plan.md`.

#### Changes Under Test

| Fix | What It Does |
|-----|--------------|
| Confusables removal | NFKC-only normalization. Eliminates identity-substitution spirals (en-dash → en-dash). |
| Footnote ref format | Review renderer emits `[^ct-N]` (with caret) instead of `[ct-N]`. |
| Ref-transparent matching | `findUniqueMatch()` strips `[^ct-N]` anchors before searching. Identity-substitution guard. |
| Content-zone-only matching | `findUniqueMatch()` truncates search before footnote section. |

#### Results: Before vs After

| Benchmark | Before (Feb 28) | After (Mar 1) | Reduction |
|-----------|-----------------|---------------|-----------|
| G-task5_v2 | 35 calls, 273s, 84K ctx, 3/10 (30%) | **4 calls, 53s, 40K ctx, 5/10 (50%)** | 89% fewer calls, 81% faster, quality +20pp |
| G-task4 | 24 calls, 183s | **6 calls, 41s, 3/3 (100%)** | 75% fewer calls, 78% faster |
| G-task1 | N/A | 26 calls, 175s | Authoring baseline (no friction to fix) |

Results: `results/2026-03-01-post-matching-transparency/`

#### Verify Tool Bug Discovery

During this analysis, two bugs were found in `verify.ts`:

1. **`findMarkdownFile()` reads golden.md instead of agent output.** Alphabetical sort picks `golden.md` before `reviewed-doc.md`. Correction scoring checked the answer key against itself (always 100%). Decision scoring found no footnotes in golden (always 0/N). All historical task5_v2 and task4 quality scores were inflated. Fixed: `findMarkdownFile()` now excludes golden files. Commit `79b437a7`.

2. **Amend decision scoring required wrong status.** Expected `accepted` but `amend_change` keeps status `proposed`. Fixed: accept both `proposed` and `accepted`. Same commit.

**Corrected historical scores:**

| Run | Old Verify Score | Real Score |
|-----|------------------|------------|
| G-task5_v2 (Feb 28, Minimax) | 10/10 (100%) | **3/10 (30%)** |
| G-task5_v2 (Mar 1, Minimax) | 10/10 (100%) | **5/10 (50%)** |
| F-task5_v2 (Feb 28, Minimax) | 10/10 (100%) | **3/10 (30%)** |
| G-task4 (Mar 1, Minimax) | 0/3 (0%) | **3/3 (100%)** |
| task8 (all runs) | Unaffected | Unaffected (no golden.md in task8 fixtures) |

#### Quality Analysis: G-task5_v2 (5/10)

**Fixed (5):** redundancy-between, acronym-tls-reexpand, cap-wifi, format-20ms, format-200ms.

**Missed (5):**
- 3 table-content attention gaps (format-300ms-table, format-50ms-table, format-100ms-monitoring) — agent applies `Nms→N ms` in prose but skips identical pattern in table cells. Old run caught all three. LLM-level inconsistency, not tool/protocol issue.
- 2 semantic rules M2.5 never catches (acronym-rtt-reexpand, cap-section-ref) — require document-level reasoning beyond M2.5's consistent capability.

**Key observation:** No tool failures contributed to misses. All 7 proposed changes applied successfully. The 5 missed corrections were never attempted — pure detection gap, not matching or protocol friction.

Full analysis: `docs/research/2026-03-01-post-matching-transparency-benchmark-results.md`

### Phase 3: New Review Tasks >>Add automated quality baselines from verify.ts validation of task8 across 3 variance runs
Design new fixtures specifically for V1 features:
- **Task 6 (triage)**: 8+ proposals from 3 authors, agent must accept/reject/amend each
- **Task 7 (amend cycle)**: Agent proposes, receives request_changes, must amend

### Phase 4: Outcome-Only Matrix
Test ecology resilience without instructions:
- F/G with prompt: "Fix all issues in this file."
- Hypothesis: V1 ecology survives where Surface D collapsed 305%

## Recording Results

After each run:

1. **Check the summary** printed by the harness
2. **Verify the after/ snapshot** — did the agent actually make the edits?
3. **Record metrics** in this format:

```markdown
| Surface | Task | Tools | Rounds | Output Tokens | Duration | Changes Found |
|---------|------|-------|--------|---------------|----------|---------------|
```

4. **Note behavioral observations:**
   - Which tools did the agent use? (Check toolCounts in summary.json)
   - Any errors or retries? (Check events.jsonl)
   - Did the three-zone format cause confusion?
   - Did operator convergence help (compact mode)?

5. **Write findings** to `packages/benchmarks/results/v1-phase{N}/FINDINGS.md`

## Comparison Targets (Kimi Baselines)

### C-task5_v2 (Kimi, harness-v2, Feb 17)

| Metric | Value |
|--------|-------|
| Tools | 6 |
| Rounds | 7 |
| Output tokens | 3,435 |
| Duration | 60s |
| Tool breakdown | read×1, propose_change×2, read_tracked_file×3 |

### A-task5_v2 (Kimi, v2-parity, Feb 16)

| Metric | Value |
|--------|-------|
| Tools | 21 |
| Rounds | 5 |
| Output tokens | 6,702 |
| Duration | 148s |

### C-task5_v2 (Sonnet, canonical, Feb 15)

| Metric | Value |
|--------|-------|
| Tools | 7 |
| Rounds | 7 |
| Output tokens | 2,971 |
| Duration | 70s |
| Tool breakdown | glob×2, read_tracked_file×2, propose_batch×2, review_changes×1 |

### A-task5_v2 (Sonnet, canonical, Feb 15)

| Metric | Value |
|--------|-------|
| Tools | 26 |
| Rounds | 27 |
| Output tokens | 6,730 |
| Duration | 134s |
