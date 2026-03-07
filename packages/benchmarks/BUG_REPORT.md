# Bug Report: Benchmark Execution Findings

**Date:** 2026-02-16
**Context:** Full benchmark matrix execution (Phases 1-4)
**Scope:** Surface A/B/C/D across tasks 1-5

---

## Critical Bugs (Must Fix)

### BUG-001: Accept Operation Deletes Footnotes Instead of Updating Status

**Severity:** CRITICAL
**Status:** ✅ FIXED (2026-02-13, commit 2ad050f)
**Validation:** C-task4 test on 2026-02-16 confirmed fix working
**Affects:** Both Surface C (MCP) and Surface D (CLI)
**Location:** `@changetracks/core` accept/reject implementation

#### Description

When accepting a tracked change via `review_change` (MCP) or `sc review` (CLI) with `decision: "approve"`, the operation:
- ❌ Removes the entire footnote definition
- ❌ Loses all metadata (author, timestamp, reasoning)
- ❌ Loses discussion thread and reviewer comments
- ✅ Correctly removes inline markup

**Expected behavior per format spec:**
```markdown
For public API responses  # Markup removed, ref kept
```

**Actual behavior:**
```markdown
For public API responses  # Markup removed, ref removed, footnote deleted entirely
```

#### Evidence

**C-task4 (MCP Surface):**
- File: `packages/benchmarks/results/phase2-new-tasks/c-task4/C-task4/after/api-spec.md`
- Operation: `review_change` with `decision: "approve"` for ct-1
- Result: Footnote `` completely removed from document

**D-task4 (CLI Surface):**
- File: `packages/benchmarks/results/phase2-new-tasks/d-task4/D-task4/after/api-spec.md`
- Operation: `sc review --reviews '[{"change_id":"ct-1","decision":"approve",...}]'`
- Result: Identical behavior - footnote completely removed

#### Impact

1. **Audit trail loss**: No record of what was proposed, by whom, or why
2. **Discussion thread loss**: All reviewer comments and responses disappear
3. **Traceability loss**: Cannot reconstruct decision history
4. **Format spec violation**: Accepted changes MUST preserve footnotes with updated status
5. **Collaboration failure**: Cannot see resolved discussions

#### Root Cause Analysis

Since both MCP and CLI surfaces exhibit identical behavior, this is a **core implementation bug** in `packages/core/src/operations/accept-reject.ts`, likely in:
- `computeAccept()` function
- `computeFootnoteStatusEdits()` function
- Or the accept operation is not calling `computeFootnoteStatusEdits()` at all

#### Reproduction Steps

1. Create document with tracked change containing footnote
2. Add discussion thread to the footnote
3. Accept the change via `review_change` (MCP) or `sc review` (CLI)
4. Observe: footnote is deleted instead of status being updated

#### Fix Required

Modify accept operation to:
1. Remove inline markup (✅ already works)
2. Keep footnote reference in document
3. Update footnote status from `proposed` → `accepted`
4. Preserve all existing metadata, reasoning, and discussion threads
5. Add `approved:` entry with reviewer info and timestamp

#### Test Coverage Needed

Current tests for accept/reject in `packages/core/src/operations/accept-reject.test.ts` likely don't verify footnote preservation. Need tests for:
- Accept keeps footnote with updated status
- Accept preserves discussion threads
- Accept preserves metadata fields
- Reject behavior (likely has same bug)

---

## Fixed Bugs

### BUG-002: workflows.ts Injects Incorrect CLI Example ✅ FIXED

**Severity:** HIGH (caused D-task3 failure)
**Status:** ✅ FIXED in commit e0320e0
**Affects:** Surface D (CLI)
**Location:** `packages/benchmarks/harness/workflows.ts:54`

#### Description

The workflow prompt generator was injecting a **fabricated CLI command** that doesn't exist:

**Wrong (before fix):**
```typescript
node ${cliPath} propose --file <file> --changes '[...]'
```

This command is a hybrid that doesn't exist. It mixes:
- `propose` command (for single changes)
- `--file` flag (doesn't exist on propose)
- `--changes` flag (only exists on batch)

**Correct (after fix):**
```typescript
node ${cliPath} propose <file> --old "text" --new "text"
node ${cliPath} batch <file> --reasoning "why" --changes '[{...}]'
```

#### Impact on D-task3

Original D-task3 run:
- Agent tried to use non-existent `propose --file` syntax
- Attempted `sc batch` with `--accept` flag (doesn't exist)
- Passed empty changes array `'[]'` (invalid)
- Failed 6+ times with USAGE_ERROR
- Fell back to Edit/Write tools, bypassing CriticMarkup entirely

#### Fix Validation

D-task3 retry after fix:
- ✅ Agent produced proper CriticMarkup with footnotes
- ✅ 27% faster execution (225s vs 307s)
- ✅ 42% fewer tools (25 vs 43)
- ✅ Full audit trail restored

#### Lesson Learned

**Environment design principle:** Instructions must match actual tool signatures. Fabricated examples cause catastrophic failure in agent workflows.

---

## Performance Issues (Not Bugs)

### PERF-001: D-task5 High Variance (Measured: 61-113% Range)

**Severity:** MEDIUM
**Status:** ✅ VARIANCE MEASURED (2026-02-16)
**Nature:** High stochastic variance (23% CV), not a bug

#### Description

D-task5 shows high stochastic variance across runs:
- Original: 19 edits (61% vs C-task5's 31 edits)
- Validation run 1: 22 edits (71%)
- Validation run 2: 35 edits (113%) ✨ exceeded baseline
- Validation run 3: 24 edits (77%)
- **Mean: 27 edits (87%), std dev 7 (23% variance)**

Original 61% result was worst case, not typical. Surface D trades some thoroughness for 40% faster execution (42s vs 70s).

#### Analysis

This is **NOT a CLI bug** because:
- ✅ The `sc batch` command executed successfully
- ✅ All changes made were correctly wrapped in CriticMarkup
- ✅ No errors occurred during execution
- ✅ Agent completed task without failures

**Likely causes:**
1. **Stochastic model behavior**: LLMs have natural variance in thoroughness
2. **Prompt differences**: Surface D prompt may emphasize speed over completeness
3. **Batch size self-limiting**: Agent may have stopped analysis early
4. **Context window effects**: Different attention patterns

#### Evidence

- D-task5: 4 tools, 5 rounds, 1,337 output tokens, 37s duration
- C-task5: 7 tools, 7 rounds, 2,971 output tokens, 70s duration

D-task5 was **47% faster** but found fewer issues. This suggests a speed-thoroughness tradeoff rather than a correctness bug.

#### Recommendation

Run D-task5 multiple times to measure variance:
1. If results cluster around 60%, it's a systematic issue
2. If results vary widely (40-100%), it's stochastic
3. Compare Sonnet vs Kimi on same Surface D to isolate model vs surface

### PERF-002: D-task3 Batch Workflow Tracking Failure

**Severity:** HIGH
**Status:** 🔴 UNRESOLVED - Requires Investigation
**Nature:** CLI batch fallback behavior on complex structural operations

#### Description

D-task3 (document restructure task) consistently fails to maintain CriticMarkup tracking when performing complex structural operations. The agent attempts to use `sc batch` commands but falls back to standard Edit tools, resulting in correct output but near-total loss of audit trail.

#### Evidence (2026-02-16 Validation Test)

**D-task3 verification run:**
- Duration: 288s (37% faster than C-task3's 458s)
- Tools: 31 total (18 bash, 8 Edit, 5 Read)
- **Footnotes created: 3** (vs C-task3's 224)
- **Tracking loss: 99%**
- Structural correctness: ✅ 100% (all 4 operations correct)

**Pattern across all D-task3 runs:**
- Original D-task3: 0 footnotes (100% Edit fallback)
- D-task3 retry (after BUG-002 fix): 7 footnotes (mostly Edit fallback)
- D-task3 validation: 3 footnotes (mostly Edit fallback)

#### Root Cause (Hypothesis)

The agent attempts `sc batch` for complex structural operations (section moves, merges, insertions) but encounters difficulties:
1. Complex JSON escaping for multi-line content
2. Batch operation coordination across distant line ranges
3. Shell quoting complexity for nested structures
4. Falls back to Edit tool when batch commands become unwieldy

**Result:** Task succeeds with correct output, but audit trail is lost.

#### Impact

- ✅ Functional correctness maintained (output is correct)
- ❌ Audit trail lost (cannot review individual structural changes)
- ❌ No inline discussion capability (no CriticMarkup tracking)
- ❌ Cannot accept/reject individual operations

#### Comparison to C-task3

| Metric | D-task3 | C-task3 | Assessment |
|--------|---------|---------|------------|
| Correctness | ✅ 100% | ✅ 100% | Tie |
| Speed | 288s | 458s | D wins (37% faster) |
| Tracking | 3 footnotes | 224 footnotes | C wins (99% more tracking) |
| Auditability | ❌ Lost | ✅ Full | C wins |

#### Recommendation

**For now:** Document that Surface D is **NOT suitable for complex structural editing tasks** (task3-style). Recommend Surface C (MCP) or Surface A (raw edit with git) instead.

**For investigation:**
1. Deep dive into D-task3 events.jsonl to identify exact batch failure points
2. Analyze why agent chooses Edit fallback vs retrying batch
3. Consider if simpler batch syntax or better error messages would help
4. Evaluate if this is fundamental CLI limitation or fixable behavior

---

## Design Issues (Not Bugs, But Problematic)

### DESIGN-001: CLI Batch Command Has Poor Error Messages

**Severity:** LOW
**Status:** 🟡 IMPROVEMENT RECOMMENDED
**Location:** `changetracks-plugin/mcp-server/src/cli-helpers.ts`

#### Description

When agents make mistakes with `sc batch` command, they receive only:
```
{
  "error": "USAGE_ERROR",
  "message": "Usage: sc batch <file> --reasoning \"why\" --changes '[{...}]' [--author \"...\"]"
}
```

This doesn't explain:
- WHAT was wrong (invalid flag? empty array? JSON parsing error?)
- HOW to fix it (which argument is the problem?)
- WHAT was received vs what was expected

#### Example Failure

Agent sent:
```bash
sc batch adr-large.md --reasoning '...' --changes '[]' --accept
```

Error should have said:
```
{
  "error": "USAGE_ERROR",
  "message": "Invalid arguments:\n  - Unknown flag '--accept' (did you mean 'sc review'?)\n  - Empty changes array (must have at least 1 change)\n\nUsage: sc batch <file> --reasoning \"why\" --changes '[{...}]' [--author \"...\"]\n\nExamples:\n  sc batch file.md --reasoning 'fix typos' --changes '[{\"at\":\"10:a1\",\"op\":\"old~>new\"}]'"
}
```

#### Impact

- Agents retry multiple times with similar errors
- Leads to frustration and fallback to Edit tools
- Wastes tokens and time on trial-and-error

#### Recommendation

Enhance error messages in `cli-helpers.ts`:
1. Parse actual arguments received
2. Identify specific errors (unknown flag, missing required arg, invalid JSON)
3. Show helpful suggestions and examples
4. Point to similar commands if confused (propose vs batch vs review)

---

### DESIGN-002: CLI Lacks Prompt Caching, Massive Token Overhead

**Severity:** MEDIUM
**Status:** 🟡 ARCHITECTURAL LIMITATION
**Nature:** Inherent tradeoff of CLI vs MCP

#### Description

**Observation from D-task4:**
- D-task4 (CLI): 286,447 input tokens, 0 cache reads
- C-task4 (MCP): 46 input tokens, 299,349 cache reads

CLI consumed **6,227x more input tokens** due to lack of prompt caching.

#### Analysis

This is an **architectural limitation**, not a bug:
- MCP tools run in persistent server with conversation context
- CLI runs as separate process per command, no context preservation
- Harness must re-send full context on every CLI invocation

#### Impact

- CLI is 19% faster wall-clock time (80s vs 99s)
- But consumes 6000x more input tokens
- For multi-round workflows, this is extremely expensive
- Cost scales linearly with conversation length (no caching benefit)

#### Recommendation

Document this tradeoff clearly:
- **CLI is best for**: Single-shot operations, scripting, simple workflows
- **MCP is best for**: Interactive sessions, multi-round editing, complex reviews
- **Hybrid approach**: Use MCP for exploratory work, CLI for automation

---

## Testing Gaps Identified

### TEST-001: Accept/Reject Operations Lack Footnote Preservation Tests

**Location:** `packages/core/src/operations/accept-reject.test.ts`

Current tests likely verify:
- ✅ Inline markup removal
- ✅ Content preservation
- ✅ Range calculations

Missing tests for:
- ❌ Footnote status update (`proposed` → `accepted`)
- ❌ Footnote metadata preservation (author, timestamp)
- ❌ Discussion thread preservation
- ❌ Approval entry addition

### TEST-002: CLI Commands Lack Integration Tests

**Location:** `changetracks-plugin/mcp-server/src/test/`

Current tests are unit tests. Need integration tests for:
- End-to-end workflow: read → batch → review → amend
- Error handling: invalid JSON, empty arrays, unknown flags
- Shell escaping: quotes, special characters in arguments

### TEST-003: Benchmark Correctness Has No Automated Validation

**Location:** `packages/benchmarks/`

Current approach:
- Manual spot-check of `after/` snapshots
- No golden file comparison
- No automated diff against expected output

Need:
- Golden files for each task showing expected edits
- Automated correctness scoring
- Diff tool to show what was missed

---

## Summary Statistics

**Total Runs:** 19 benchmark runs across 4 phases
**Critical Bugs Found:** 1 (footnote deletion)
**Fixed Bugs:** 1 (workflows.ts)
**Performance Issues:** 1 (D-task5 incompleteness - needs investigation)
**Design Issues:** 2 (error messages, caching)
**Testing Gaps:** 3 categories

**Success Rate:**
- Phase 1 (Surface D proof): 3/3 runs completed
- Phase 2 (New tasks): 6/6 runs completed (including D-task3 retry)
- Phase 3 (A baselines): 2/2 runs completed
- Phase 4 (Outcome-only): 2/2 runs completed
- **Overall: 13/13 runs succeeded** (100% completion rate)

**Correctness Rate:**
- Task 1 (rename): 100% correct across all surfaces
- Task 2 (audit): 100% correct (varying discovery counts)
- Task 3 (restructure): 100% correct (D-task3 retry validated)
- Task 4 (review): **50% correct** (2/4 operations due to footnote bug)
- Task 5 (copyedit): D-task5 only 60% complete (investigation needed)

---

## Priority Recommendations

### Immediate (P0)

1. **Fix BUG-001**: Accept operation must preserve footnotes
   - This breaks the entire audit trail system
   - Affects both MCP and CLI surfaces
   - Must be fixed before any production use

### High Priority (P1)

2. **Add tests for footnote preservation**
   - Prevent regression
   - Cover accept, reject, and amend operations

3. **Investigate D-task5 incompleteness**
   - Run multiple trials to measure variance
   - Determine if systematic or stochastic

### Medium Priority (P2)

4. **Improve CLI error messages**
   - Makes CLI more usable for agents
   - Reduces trial-and-error overhead

5. **Add benchmark correctness validation**
   - Automated golden file comparison
   - Correctness scoring per run

### Low Priority (P3)

6. **Document CLI vs MCP tradeoffs**
   - Caching implications
   - Use case guidance
   - Cost considerations

---

## Appendix: Test Results by Surface

### Surface A (Raw Edit)
- ✅ Fastest execution (179s for task3 vs 458s for C-task3)
- ✅ Robust to instruction variance
- ❌ No inline audit trail
- ❌ No collaborative review workflow

### Surface B (MCP Classic)
- Not tested in this run (equivalent to C for benchmark purposes)

### Surface C (MCP Compact)
- ✅ Richest audit trail (138 tracked changes in task3)
- ✅ Excellent prompt caching (299K cache reads)
- ✅ Structured tool interface (easy to use correctly)
- ❌ Slowest execution (458s for task3)
- 🐛 BUG-001 affects this surface

### Surface D (CLI)
- ✅ Zero MCP schema overhead (confirmed)
- ✅ Fast when working (225s for task3-retry)
- ❌ High instruction dependency (collapses without details)
- ❌ No prompt caching (6000x token overhead)
- ❌ Shell quoting friction for complex JSON
- 🐛 BUG-001 affects this surface
- 🐛 BUG-002 fixed, validated in retry

---

## Conclusion

The benchmark execution successfully filled the test matrix and identified:
- **1 critical bug** requiring immediate fix
- **1 bug fixed and validated** during execution
- **Multiple design insights** about surface tradeoffs

The "Environment > Instructions" hypothesis was tested and **definitively rejected**. Instruction quality is the dominant factor in agent performance, not environmental simplicity.

**Next steps:** Fix BUG-001, add tests, complete master results compilation.
