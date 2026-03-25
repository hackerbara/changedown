/**
 * MCP-L3 deterministic anchoring parity tests.
 *
 * Verifies that the MCP compact resolver (findUniqueMatch, used when agents
 * propose changes via `at`+`op`) and the L3 parser (FootnoteNativeParser,
 * which reads stored L3 footnotes) agree on position resolution:
 *
 * Invariant A: If findUniqueMatch resolves a target, FootnoteNativeParser
 *   resolves the same op text to the same position.
 * Invariant B: If findUniqueMatch throws (ambiguous), FootnoteNativeParser
 *   sets anchored:false rather than silently choosing a position.
 * Invariant C: After L2→L3 conversion via convertL2ToL3, the emitted L3
 *   footnote op text is unique on its line so the parser resolves it correctly.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  FootnoteNativeParser,
  findUniqueMatch,
  initHashline,
  ChangeType,
  convertL2ToL3,
} from '@changetracks/core/internals';

beforeAll(async () => { await initHashline(); });

// ── Invariant A: Deterministic parity ────────────────────────────────────────

describe('Invariant A — deterministic parity (MCP compact and L3 parser agree)', () => {
  const parser = new FootnoteNativeParser();

  it('unique insertion text: both systems resolve to same line offset', () => {
    const line = 'The API uses GraphQL for data queries.';
    const target = 'GraphQL';

    // MCP compact path: findUniqueMatch succeeds
    const mcpMatch = findUniqueMatch(line, target);
    expect(mcpMatch.index).toBe(13); // "GraphQL" starts at column 13
    expect(mcpMatch.length).toBe(target.length);

    // L3 parser path: footnote op text is the same target
    // Body: "# Doc\n\n" = 7 chars before line 3
    const l3 = [
      '# Doc',
      '',
      line,
      '',
      '[^ct-1]: @alice | 2026-03-16 | ins | proposed',
      `    3:ab {++${target}++}`,
    ].join('\n');
    const doc = parser.parse(l3);
    const ins = doc.getChanges().find(c => c.id === 'ct-1');
    expect(ins).toBeDefined();
    expect(ins!.type).toBe(ChangeType.Insertion);
    expect(ins!.anchored).toBe(true);
    // "# Doc\n\n" = 7 chars; mcpMatch.index = 13 → expected start = 20
    const lineBodyOffset = '# Doc\n\n'.length;
    expect(ins!.range.start).toBe(lineBodyOffset + mcpMatch.index);
    expect(ins!.range.end).toBe(lineBodyOffset + mcpMatch.index + mcpMatch.length);
  });

  it('unique substitution new-text: both systems resolve to same line offset', () => {
    const line = 'The system delivers excellent outcomes.';
    const target = 'delivers';

    // MCP compact path
    const mcpMatch = findUniqueMatch(line, target);
    expect(mcpMatch.index).toBeGreaterThan(0);

    // L3 parser path: substitution with unique newText
    const l3 = [
      '# Doc',
      '',
      line,
      '',
      '[^ct-1]: @alice | 2026-03-16 | sub | proposed',
      `    3:ab {~~provides~>${target}~~}`,
    ].join('\n');
    const doc = parser.parse(l3);
    const sub = doc.getChanges().find(c => c.id === 'ct-1');
    expect(sub).toBeDefined();
    expect(sub!.type).toBe(ChangeType.Substitution);
    expect(sub!.anchored).toBe(true);
    const lineBodyOffset = '# Doc\n\n'.length;
    expect(sub!.range.start).toBe(lineBodyOffset + mcpMatch.index);
  });

  it('unique highlight text: both systems resolve to same line offset', () => {
    const line = 'Performance benchmarks show dramatic improvement this quarter.';
    const target = 'dramatic improvement';

    // MCP compact path
    const mcpMatch = findUniqueMatch(line, target);
    expect(mcpMatch.index).toBeGreaterThan(0);

    // L3 parser path
    const l3 = [
      '# Doc',
      '',
      line,
      '',
      '[^ct-1]: @alice | 2026-03-16 | highlight | proposed',
      `    3:ab {==${target}==}`,
    ].join('\n');
    const doc = parser.parse(l3);
    const hi = doc.getChanges().find(c => c.id === 'ct-1');
    expect(hi).toBeDefined();
    expect(hi!.type).toBe(ChangeType.Highlight);
    expect(hi!.anchored).toBe(true);
    const lineBodyOffset = '# Doc\n\n'.length;
    expect(hi!.range.start).toBe(lineBodyOffset + mcpMatch.index);
    expect(hi!.range.end).toBe(lineBodyOffset + mcpMatch.index + mcpMatch.length);
  });
});

// ── Invariant B: Ambiguity parity ─────────────────────────────────────────────

describe('Invariant B — ambiguity parity (both systems reject ambiguous text)', () => {
  const parser = new FootnoteNativeParser();

  it('ambiguous insertion text: MCP throws, L3 parser sets anchored:false', () => {
    const line = 'the cat and the dog';
    const target = 'the';

    // MCP compact path: throws on ambiguity
    expect(() => findUniqueMatch(line, target)).toThrow(/ambiguous/i);

    // L3 parser path: signals unresolved, does NOT fall back to line start
    const l3 = [
      '# Doc',
      '',
      line,
      '',
      '[^ct-1]: @alice | 2026-03-16 | ins | proposed',
      `    3:ab {++${target}++}`,
    ].join('\n');
    const doc = parser.parse(l3);
    const ins = doc.getChanges().find(c => c.id === 'ct-1');
    expect(ins).toBeDefined();
    expect(ins!.anchored).toBe(false);
    // Must NOT silently use line-start offset
    const lineBodyOffset = '# Doc\n\n'.length;
    expect(ins!.range.start).not.toBe(lineBodyOffset);
  });

  it('ambiguous substitution new-text: MCP throws, L3 parser sets anchored:false', () => {
    const line = 'You can do it, I can too.';
    const target = 'can';

    // MCP compact path: throws on ambiguity
    expect(() => findUniqueMatch(line, target)).toThrow(/ambiguous/i);

    // L3 parser path: proposed sub with ambiguous newText
    const l3 = [
      '# Doc',
      '',
      line,
      '',
      '[^ct-1]: @alice | 2026-03-16 | sub | proposed',
      `    3:ab {~~could~>${target}~~}`,
    ].join('\n');
    const doc = parser.parse(l3);
    const sub = doc.getChanges().find(c => c.id === 'ct-1');
    expect(sub).toBeDefined();
    expect(sub!.anchored).toBe(false);
  });

  it('ambiguous highlight text: MCP throws, L3 parser does best-effort (comment visible)', () => {
    const line = 'good work produces good results.';
    const target = 'good';

    // MCP compact path: throws on ambiguity
    expect(() => findUniqueMatch(line, target)).toThrow(/ambiguous/i);

    // L3 parser path: highlights use best-effort positioning (line-start)
    // because the comment annotation is the primary payload — hiding the
    // highlight would lose the comment. Different from ins/sub which would
    // decorate the wrong text.
    const l3 = [
      '# Doc',
      '',
      line,
      '',
      '[^ct-1]: @alice | 2026-03-16 | highlight | proposed',
      `    3:ab {==${target}==}{>>needs revision`,
    ].join('\n');
    const doc = parser.parse(l3);
    const hi = doc.getChanges().find(c => c.id === 'ct-1');
    expect(hi).toBeDefined();
    // Best-effort: anchored at line-start, comment preserved
    expect(hi!.anchored).toBe(true);
    expect(hi!.range.start).toBe(7); // line 3 offset = len("# Doc\n\n") = 7
  });

  it('text not found on line: MCP throws, L3 parser sets anchored:false', () => {
    const line = 'the cat and the dog';
    const target = 'missing';

    // MCP compact path: throws (not found)
    expect(() => findUniqueMatch(line, target)).toThrow();

    // L3 parser path: text absent from line
    const l3 = [
      '# Doc',
      '',
      line,
      '',
      '[^ct-1]: @alice | 2026-03-16 | ins | proposed',
      `    3:ab {++${target}++}`,
    ].join('\n');
    const doc = parser.parse(l3);
    const ins = doc.getChanges().find(c => c.id === 'ct-1');
    expect(ins).toBeDefined();
    expect(ins!.anchored).toBe(false);
  });
});

// ── Invariant C: L2→L3 round-trip via convertL2ToL3 ──────────────────────────

describe('Invariant C — L2→L3 round-trip (expansion ensures deterministic anchoring)', () => {
  const parser = new FootnoteNativeParser();

  it('insertion where text appears twice: converter expands op text, parser resolves correctly', async () => {
    // "world" appears twice on the same body line after strip.
    // convertL2ToL3 must expand the op text to be unique so the parser resolves it.
    const l2 = [
      '# Doc',
      '',
      // The inserted "world" will land next to "Hello" in the clean body.
      // After strip: "Hello world and world again." — "world" is ambiguous.
      // Converter uses buildContextualL3EditOp to prefix context, making it unique.
      'Hello {++world ++}[^ct-1]and world again.',
      '',
      '[^ct-1]: @alice | 2026-03-16 | ins | proposed',
    ].join('\n');

    const l3 = await convertL2ToL3(l2);

    // Verify the L3 was produced
    expect(l3).toMatch(/\[\^ct-1\]/);
    expect(l3).toMatch(/\d+:[a-f0-9]{2} .*\{\+\+/); // has edit-op line (allows contextual prefix)

    // Parse the L3 and verify the change is anchored
    const doc = parser.parse(l3);
    const changes = doc.getChanges();
    const ins = changes.find(c => c.id === 'ct-1');
    expect(ins).toBeDefined();
    expect(ins!.type).toBe(ChangeType.Insertion);
    // The key assertion: converter's expansion ensures anchored:true
    expect(ins!.anchored).toBe(true);
  });

  it('substitution where new-text is unique: round-trip preserves anchoring', async () => {
    // NOTE: footnote ref must be placed immediately after the CriticMarkup token
    // (not at the end of the line) so the parser assigns ct-1 to the inline substitution
    // rather than auto-generating a new ID for the inline change and treating ct-1 as
    // a separate footnote-metadata-only node.
    const l2 = [
      '# Doc',
      '',
      'The system {~~provides~>delivers~~}[^ct-1] excellent outcomes.',
      '',
      '[^ct-1]: @alice | 2026-03-16 | sub | proposed',
    ].join('\n');

    const l3 = await convertL2ToL3(l2);

    const doc = parser.parse(l3);
    const sub = doc.getChanges().find(c => c.id === 'ct-1');
    expect(sub).toBeDefined();
    expect(sub!.type).toBe(ChangeType.Substitution);
    expect(sub!.anchored).toBe(true);
    // Verify "delivers" is on the body line and parser found it
    expect(sub!.range.start).toBeGreaterThan(0);
  });
});
