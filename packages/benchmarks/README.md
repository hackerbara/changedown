# @changetracks/benchmarks

Edit surface benchmark suite for ChangeTracks. Measures how different editing tool surfaces affect agent efficiency (tokens, rounds, duration) when performing document editing tasks.

## Quick Start

```bash
# Build the harness
npm run build -w packages/benchmarks

# Run a single trial
npm run trial -w packages/benchmarks -- --surface C --task task5

# Run the full benchmark matrix
npm run benchmark -w packages/benchmarks

# Analyze token usage for a completed run
npx tsx packages/benchmarks/harness/analyze-tokens.ts results/<run-dir>

# Analyze all runs in batch
npx tsx packages/benchmarks/harness/analyze-tokens.ts --all results/

# Run tests
cd packages/benchmarks && npx vitest run
```

## Structure

```
packages/benchmarks/
├── harness/                # TypeScript benchmark runner (OpenCode CLI-based)
│   ├── analyze-tokens.ts         # Post-run token analyzer (tiktoken)
│   ├── run-full-benchmark.ts     # Full benchmark matrix runner
│   ├── run-trial-cli.ts          # Single trial runner
│   └── __tests__/                # Vitest test suite
│       └── analyze-tokens.test.ts
├── fixtures/               # Task documents and prompts
│   ├── task1-rename/       # Multi-file concept rename (4 docs, ~20 rename sites)
│   ├── task2-audit/        # Discovery-driven audit (1 doc, 6 planted issues)
│   ├── task3-restructure/  # Section restructure (1 doc, ~300 lines)
│   ├── task4-review/       # Review and amend cycle (1 doc, existing CriticMarkup)
│   ├── task5-copyedit/     # Single-file copyedit (1 doc, 22 planted errors)
│   ├── benchmark-adr/      # Early-era ADR fixture with golden file
│   └── prompts.json        # All task prompts (instructed + outcome-only variants)
├── results/                # Benchmark run outputs
│   ├── canonical/          # Post-bugfix, reproducible runs (cite these)
│   ├── exploratory/        # Smoke, pre-fix, one-off experiments
│   └── outcome-only/       # No tool instructions in prompt
├── docs/                   # Documentation index
│   ├── THREADS.md          # Open threads and next steps
│   ├── plans/              # Symlinks to docs/plans/ (6 benchmark design docs)
│   ├── research/           # Symlinks to docs/research/ (15 benchmark research docs)
│   └── presentations/      # Symlinks to docs/research/ (slide decks, PDFs)
└── golden/                 # Expected outputs for correctness scoring (FUTURE)
```

## Token Analyzer

Post-run tool that reads `events.jsonl` from benchmark runs, tokenizes MCP tool payloads with tiktoken, and produces a `token-audit.json` with per-tool breakdowns and verification against API-reported totals.

```bash
# Analyze a single run
npx tsx packages/benchmarks/harness/analyze-tokens.ts results/G-task1_minimax-m2.5

# Analyze all runs in batch
npx tsx packages/benchmarks/harness/analyze-tokens.ts --all results/

# Via npm script (from packages/benchmarks/)
npm run analyze-tokens -- <run-dir>
```

**Output (`token-audit.json`):**
- `verification` — API-reported totals vs tokenized tool payloads, with `accountingGap` (fraction of tokens not attributable to tool payloads — system prompt, schemas, and conversation history account for the gap, typically 90-96%)
- `perTool` — Per-tool breakdown: call count, total input/output tokens, averages per call
- `perStep` — Per-step breakdown with API token counts and individual tool calls
- `meta` — Tokenizer info (`tiktoken/cl100k_base`) and timestamp

**Tests:**
```bash
cd packages/benchmarks && npx vitest run harness/__tests__/analyze-tokens.test.ts
```

## Edit Surfaces

| Surface | Mechanism | Description |
|---------|-----------|-------------|
| A | Raw file edit/write | Baseline — agent uses standard file tools |
| B | `propose_change` (old_text/new_text) | One change per tool call, string matching |
| C | `propose_batch` (LINE:HASH + at/op DSL) | Batch changes, stable addressing, MCP tools |
| D | `sc` CLI via Bash | Same ops as C but via shell commands, no MCP schema overhead |

## Key Findings

**Canonical Task 5 (copyedit, 22 fixes):**

| Surface | Tools | Rounds | Output Tokens | vs. A |
|---------|-------|--------|---------------|-------|
| A | 26 | 27 | 6,730 | baseline |
| B | 30 | 29 | 18,444 | 2.7x worse |
| C | 7 | 7 | 2,971 | 2.3x better |

**Outcome-only (no tool instructions):** C is 3x faster, 6.5x fewer tokens than A.

See `docs/research/2026-02-15-edit-surface-benchmark-findings.md` for full analysis.

## Results Classification

| Directory | Classification | Notes |
|-----------|---------------|-------|
| `canonical/task1-v2` | **Canonical** | Post-bugfix, instructed, Sonnet 4.5 |
| `canonical/task5-v2` | **Canonical** | Post-bugfix, instructed, Sonnet 4.5 |
| `outcome-only/task5` | **Canonical** | No tool instructions, post-bugfix |
| `exploratory/canonical-task1-pre-v2` | Exploratory | Superseded by v2 |
| `exploratory/canonical-task5-pre-bugfix` | Exploratory | Surface C broken (4 propose_batch bugs) |
| `exploratory/smoke-*` | Exploratory | Validation runs |
| `exploratory/early-*` | Exploratory | First isolated runs |
| `exploratory/v2-A-svelte` | Exploratory | Svelte prompt variant |
| `exploratory/v2-C-propose` | Exploratory | Led to desire-to-close finding |
| `exploratory/results-smoke` | Exploratory | Separate smoke run set |

## Documentation Index

### Design & Plans
- [Deliberation Effectiveness Benchmark](docs/plans/2026-02-06-deliberation-effectiveness-benchmark.md) — Early benchmark concept
- [OpenCode Harness Design](docs/plans/2026-02-13-opencode-benchmark-harness-design.md) — CLI harness architecture
- [OpenCode Harness Implementation](docs/plans/2026-02-13-opencode-benchmark-harness-implementation.md) — Implementation plan
- [Edit Surface Benchmark Design](docs/plans/2026-02-15-edit-surface-benchmark-design.md) — 4-task benchmark specification
- [Edit Surface Benchmark Implementation](docs/plans/2026-02-15-edit-surface-benchmark-implementation.md) — Implementation plan
- [Benchmark of Our Dreams](docs/plans/2026-02-16-benchmark-of-our-dreams.md) — Pre-registered protocol with 4 claims

### Research & Findings
- [Benchmark Findings](docs/research/2026-02-15-edit-surface-benchmark-findings.md) — **Canonical results** (cite this)
- [Tool Surface Audit](docs/research/2026-02-16-edit-surface-tool-surface-audit.md) — Verification of findings against raw data
- [Raw Traces](docs/research/2026-02-16-edit-surface-raw-traces.md) — Verbatim events.jsonl excerpts
- [Raw Traces Appendix](docs/research/2026-02-16-edit-surface-raw-traces-appendix-bulk.md) — Extended traces
- [Show Your Work A vs C](docs/research/2026-02-16-show-your-work-a-vs-c.md) — Human-readable tool-call walkthrough
- [Edit Surface Comparison](docs/research/2026-02-14-edit-surface-comparison.md) — Token-level comparison
- [Character-Level Edit Gap](docs/research/2026-02-15-character-level-edit-gap.md) — 3.4x overhead analysis
- [Desire to Close](docs/research/2026-02-16-desire-to-close.md) — Agent self-review behavior finding
- [Skeptical Hand Check](docs/research/2026-02-16-skeptical-hand-check-a-vs-c.md) — Independent verification
- [Emergent Audit Behavior](docs/research/2026-02-16-emergent-audit-behavior.md) — Behavioral observations
- [Batch Efficiency Proposal](docs/research/2026-02-13-benchmark-proposal-batch-efficiency.md) — ADR restructure benchmark
- [Initial Workflow Results](docs/research/2026-02-13-benchmark-workflow-results.md) — Early Qwen results
- [Compact Mode Feedback](docs/research/2026-02-15-compact-mode-first-use-feedback.md) — First use observations
- [Agent Stress Test](docs/research/2026-02-13-agent-stress-test-batch-report.md) — Batch stress testing
- [Clean Surface Comparison](docs/research/2026-02-14-edit-surface-comparison.clean.md) — Cleaned version
- [SC CLI UX Research](docs/research/2026-02-15-sonnet-cli-ux-research.md) — Sonnet first-use CLI testing (Surface D motivation)

## Test Matrix

Tasks (rows) vs Surfaces (columns). Checkmarks = prompts defined in `fixtures/prompts.json`.

| Task | A | B | C | D | Notes |
|------|---|---|---|---|-------|
| task1 (rename) | x | x | x | x | Multi-file, ~20 rename sites |
| task2 (audit) | x | x | x | x | Discovery-driven, 6 planted issues |
| task3 (restructure) | x | x | x | x | Structural moves, cross-references |
| task4 (review) | - | x | x | x | Accept/reject/amend/respond cycle |
| task5 (copyedit) | x | x | x | x | 22 character-level fixes |
| task5_outcome | x | x | x | x | No tool instructions in prompt |
| task5_v2 | x | - | x | x | Minimal instruction variant |

**Run status:** Only tasks 1 and 5 have canonical results (Surfaces A/B/C). Surface D and tasks 2-4 have zero runs.

## Open Threads

See [THREADS.md](docs/THREADS.md) for 13 tracked open items.
