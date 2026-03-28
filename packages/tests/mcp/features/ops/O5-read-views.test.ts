import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScenarioContext } from '../scenario-context.js';

describe('O5: Read tracked file views', () => {
  let ctx: ScenarioContext;
  let filePath: string;

  beforeEach(async () => {
    ctx = new ScenarioContext({
      settlement: { auto_on_approve: false, auto_on_reject: false },
    });
    await ctx.setup();

    // Background: Create file with mixed accepted + pending state
    // Start with three lines
    filePath = await ctx.createFile('doc.md', 'alpha\nbeta\ngamma');

    // Propose substitution on 'alpha' → 'ALPHA'
    const r1 = await ctx.propose(filePath, {
      old_text: 'alpha',
      new_text: 'ALPHA',
      reason: 'capitalize',
    });
    expect(r1.isError).toBeUndefined();

    // Approve cn-1 → status becomes accepted
    const rev = await ctx.review(filePath, {
      reviews: [{ change_id: 'cn-1', decision: 'approve', reason: 'ok' }],
    });
    expect(rev.isError).toBeUndefined();

    // Propose substitution on 'gamma' → 'GAMMA' (stays proposed)
    const r2 = await ctx.propose(filePath, {
      old_text: 'gamma',
      new_text: 'GAMMA',
      reason: 'capitalize again',
    });
    expect(r2.isError).toBeUndefined();

    // State: cn-1 = accepted sub (alpha→ALPHA), cn-2 = proposed sub (gamma→GAMMA)
  });

  afterEach(async () => {
    await ctx.teardown();
  });

  // ─── Scenario 1: Meta view ───────────────────────────────────────────────

  it('Scenario: Meta view projects deliberation inline', async () => {
    const result = await ctx.read(filePath, { view: 'meta' });
    expect(result.isError).toBeUndefined();

    const text = ctx.resultText(result);

    // Deliberation summary header at top (unified renderer uses protocol.mode)
    expect(text).toContain('policy: classic');
    expect(text).toContain('tracking: tracked');

    // Status counts: unified format "proposed: N | accepted: N | rejected: N"
    expect(text).toContain('proposed: 1');
    expect(text).toContain('accepted: 1');

    // Authors line
    expect(text).toContain('@ai:test-agent');

    // Three-zone format: Zone 2 has lightweight [^cn-N] anchors,
    // Zone 3 has {>>cn-N @author: reason | K replies<<} metadata at end of line.
    // Note: propose_change stores reasoning as a thread reply line (@author date: reason),
    // which parseFootnotes counts as replyCount (not the reason field).
    // So Zone 3 shows empty reason + "N reply" suffix.
    expect(text).toContain('[^cn-1]');
    expect(text).toContain('[^cn-2]');
    expect(text).toMatch(/\{>>cn-1 @ai:test-agent:.*\| 1 reply<<\}/);
    expect(text).toMatch(/\{>>cn-2 @ai:test-agent:.*\| 1 reply<<\}/);

    // Footnote section is elided — no [^cn-N]: definitions
    expect(text).not.toContain('[^cn-1]:');
    expect(text).not.toContain('[^cn-2]:');

    // Separator present
    expect(text).toContain('---');

    // Thread count in header (unified format: "threads: N")
    expect(text).toContain('threads:');
  });

  // ─── Scenario 2: Content view ────────────────────────────────────────────

  it('Scenario: Content view shows raw CriticMarkup', async () => {
    const result = await ctx.read(filePath, { view: 'content' });
    expect(result.isError).toBeUndefined();

    const text = ctx.resultText(result);

    // Literal CriticMarkup delimiters present
    expect(text).toContain('{~~');
    expect(text).toContain('~>');
    expect(text).toContain('~~}');

    // Footnote references present (not replaced)
    expect(text).toContain('[^cn-1]');
    expect(text).toContain('[^cn-2]');

    // Footnote definitions included (content = full raw file)
    expect(text).toMatch(/\[\^cn-1\]:/);
    expect(text).toMatch(/\[\^cn-2\]:/);

    // LINE:HASH format present (hashline enabled in default config)
    expect(text).toMatch(/\d+:[0-9a-f]{2}/);

    // Header present (unified format: ## {filename} | policy: {protocol.mode} | tracking: ...)
    expect(text).toMatch(/## .*doc\.md \| policy:/);
    expect(text).toContain('tracking:');

    // No inline metadata annotations
    expect(text).not.toContain('[cn-1 accepted');
    expect(text).not.toContain('[cn-2 proposed');
  });

  // ─── Scenario 3: Full view ───────────────────────────────────────────────

  it('Scenario: Full view shows everything', async () => {
    const contentResult = await ctx.read(filePath, { view: 'content' });
    const fullResult = await ctx.read(filePath, { view: 'full' });

    expect(contentResult.isError).toBeUndefined();
    expect(fullResult.isError).toBeUndefined();

    const contentText = ctx.resultText(contentResult);
    const fullText = ctx.resultText(fullResult);

    // Full and content views produce identical output in current implementation
    // Both show raw CriticMarkup + footnote definitions + LINE:HASH coordinates
    expect(fullText).toBe(contentText);

    // Verify it has both CriticMarkup and footnotes
    expect(fullText).toContain('{~~');
    expect(fullText).toContain('[^cn-1]');
    expect(fullText).toContain('[^cn-2]');
    expect(fullText).toMatch(/\[\^cn-1\]:/);
    expect(fullText).toMatch(/\[\^cn-2\]:/);
  });

  // ─── Scenario 4: Settled view ────────────────────────────────────────────

  it('Scenario: Settled view shows accept-all (all changes applied regardless of status)', async () => {
    const result = await ctx.read(filePath, { view: 'settled' });
    expect(result.isError).toBeUndefined();

    const text = ctx.resultText(result);

    // Accepted substitution (cn-1) applied: alpha→ALPHA → shows "ALPHA"
    expect(text).toContain('ALPHA');

    // Accept-all: pending substitution (cn-2) is also applied: gamma→GAMMA → shows "GAMMA"
    expect(text).toContain('GAMMA');
    // Original "gamma" should NOT appear (accept-all applies the change)
    expect(text).not.toMatch(/\bgamma\b/);

    // No CriticMarkup delimiters in the output
    expect(text).not.toContain('{~~');
    expect(text).not.toContain('~>');
    expect(text).not.toContain('~~}');
    expect(text).not.toContain('{++');
    expect(text).not.toContain('{--');

    // Footnote definitions stripped
    expect(text).not.toContain('[^cn-1]:');
    expect(text).not.toContain('[^cn-2]:');

    // Unchanged line preserved
    expect(text).toContain('beta');

    // LINE:HASH format present (hashline enabled)
    expect(text).toMatch(/\d+:[0-9a-f]{2}/);
  });

  // ─── Scenario 5: Committed view ─────────────────────────────────────────

  it('Scenario: Committed view shows accepted-applied, pending-reverted with flags', async () => {
    const result = await ctx.read(filePath, { view: 'committed' });
    expect(result.isError).toBeUndefined();

    const text = ctx.resultText(result);

    // Unified header (no separate "## view: committed" line)
    expect(text).toMatch(/## .*doc\.md \| policy:/);

    // Change summary in unified format: "proposed: N | accepted: N"
    expect(text).toContain('proposed: 1');
    expect(text).toContain('accepted: 1');

    // Accepted substitution (cn-1): shows "ALPHA" with A flag
    // Unified format: "N:HH A| content" (space between flag and pipe)
    expect(text).toMatch(/[0-9a-f]{2} A\|.*ALPHA/);

    // Pending substitution (cn-2): shows original "gamma" with P flag
    expect(text).toMatch(/[0-9a-f]{2} P\|.*gamma/);
    // "GAMMA" (pending new text) should NOT appear in committed view
    expect(text).not.toMatch(/\|.*GAMMA/);

    // Unchanged line "beta" has blank flag (neither P nor A)
    expect(text).toMatch(/[0-9a-f]{2}\s+\|.*beta/);

    // No CriticMarkup delimiters
    expect(text).not.toContain('{~~');
    expect(text).not.toContain('~>');

    // Footnote definitions excluded
    expect(text).not.toContain('[^cn-1]:');
    expect(text).not.toContain('[^cn-2]:');
  });

  // ─── Scenario 6: Line range slicing ──────────────────────────────────────

  it('Scenario: Line range slicing with offset/limit', async () => {
    // Read only line 1 using content view (hashline enabled)
    const result = await ctx.read(filePath, { view: 'content', offset: 1, limit: 1 });
    expect(result.isError).toBeUndefined();

    const text = ctx.resultText(result);

    // Header + blank line + content + optional truncation message
    const parts = text.split('\n\n');
    const header = parts[0];
    // Content is between header separator and truncation message (if any)
    const contentMatch = text.match(/---\n\n([\s\S]*?)(?:\n\n---|\s*$)/);
    expect(contentMatch).toBeTruthy();

    // Only 1 line in content (the first line with alpha substitution)
    const contentLines = contentMatch![1].split('\n').filter(l => l.trim().length > 0);
    expect(contentLines).toHaveLength(1);

    // Hashline coordinates present
    expect(contentLines[0]).toMatch(/^\s*\d+:[0-9a-f]{2}/);

    // Header reflects the sliced range
    expect(header).toMatch(/## lines: 1-1 of \d+/);
  });

  // ─── Scenario 7: include_meta flag ───────────────────────────────────────

  it('Scenario: include_meta flag adds change levels line', async () => {
    const result = await ctx.read(filePath, { include_meta: true });
    expect(result.isError).toBeUndefined();

    const text = ctx.resultText(result);
    expect(text).toContain('## change levels:');
  });

  // ─── Additional edge case: include_meta=false omits change levels ────────

  it('Default (include_meta=false) omits change levels line', async () => {
    const result = await ctx.read(filePath, { view: 'content' });
    expect(result.isError).toBeUndefined();

    const text = ctx.resultText(result);
    expect(text).not.toContain('## change levels:');
  });
});
