import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { applyPendingEdits, appendPendingEdit, readPendingEdits } from 'changedown-hooks/internals';
import type { CreationTracking } from 'changedown-hooks/internals';

// Minimal config shape matching what applyPendingEdits expects
function makeConfig(overrides?: {
  author?: string;
  mode?: string;
  creation_tracking?: CreationTracking;
}) {
  return {
    author: { default: overrides?.author ?? 'ai:claude-opus-4.6' },
    policy: {
      mode: overrides?.mode ?? 'safety-net',
      creation_tracking: (overrides?.creation_tracking ?? 'footnote') as CreationTracking,
    },
  };
}

describe('applyPendingEdits', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-batch-wrapper-'));
    const scDir = path.join(tmpDir, '.changedown');
    await fs.mkdir(scDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── Empty / no-op cases ──

  it('returns zero edits when no pending edits exist', async () => {
    const result = await applyPendingEdits(tmpDir, 'ses_123', makeConfig());
    expect(result.editsApplied).toBe(0);
    expect(result.changeIds).toEqual([]);
    expect(result.message).toBe('');
  });

  it('returns zero edits when pending edits belong to a different session', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, 'Updated text', 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: 'Original text',
      new_text: 'Updated text',
      timestamp: new Date().toISOString(),
      session_id: 'ses_OTHER',
    });

    const result = await applyPendingEdits(tmpDir, 'ses_123', makeConfig());
    expect(result.editsApplied).toBe(0);
  });

  // ── Substitution wrapping ──

  it('wraps a single substitution with CriticMarkup + footnote', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Updated heading\n\nSome content.\n', 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: '# Original heading',
      new_text: '# Updated heading',
      timestamp: new Date().toISOString(),
      session_id: 'ses_123',
    });

    const result = await applyPendingEdits(tmpDir, 'ses_123', makeConfig());

    const content = await fs.readFile(mdPath, 'utf-8');
    expect(content).toContain('{~~# Original heading~># Updated heading~~}');
    expect(content).toContain('[^cn-1]');
    expect(content).toContain('[^cn-1]: @ai:claude-opus-4.6');
    expect(content).toContain('| sub | proposed');

    expect(result.editsApplied).toBe(1);
    expect(result.changeIds).toEqual(['cn-1']);
    expect(result.message).toContain('1 edit(s)');
    expect(result.message).toContain('[^cn-1]');
  });

  // ── Insertion wrapping ──

  it('wraps a pure insertion with {++...++}', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Hello\n\nNew paragraph here.\n\nOld paragraph.\n', 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: '',
      new_text: 'New paragraph here.\n\n',
      timestamp: new Date().toISOString(),
      session_id: 'ses_123',
    });

    const result = await applyPendingEdits(tmpDir, 'ses_123', makeConfig());

    const content = await fs.readFile(mdPath, 'utf-8');
    expect(content).toContain('{++New paragraph here.\n\n++}');
    expect(content).toContain('[^cn-1]');
    expect(content).toContain('| ins | proposed');
    expect(result.editsApplied).toBe(1);
  });

  // ── Deletion wrapping ──

  it('wraps a deletion with {--...--} using context', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, 'Before text. After text.', 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: 'Removed text. ',
      new_text: '',
      timestamp: new Date().toISOString(),
      session_id: 'ses_123',
      context_before: 'Before text. ',
      context_after: 'After text.',
    });

    const result = await applyPendingEdits(tmpDir, 'ses_123', makeConfig());

    const content = await fs.readFile(mdPath, 'utf-8');
    expect(content).toContain('{--Removed text. --}');
    expect(content).toContain('[^cn-1]');
    expect(content).toContain('| del | proposed');
    expect(result.editsApplied).toBe(1);
  });

  // ── Grouped IDs (dotted) ──

  it('uses dotted IDs for multiple edits (group)', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# New Title\n\nNew paragraph.\n', 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: '# Old Title',
      new_text: '# New Title',
      timestamp: new Date().toISOString(),
      session_id: 'ses_123',
    });

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: 'Old paragraph.',
      new_text: 'New paragraph.',
      timestamp: new Date().toISOString(),
      session_id: 'ses_123',
    });

    const result = await applyPendingEdits(tmpDir, 'ses_123', makeConfig());

    const content = await fs.readFile(mdPath, 'utf-8');
    expect(content).toContain('[^cn-1.1]');
    expect(content).toContain('[^cn-1.2]');
    // Parent footnote
    expect(content).toContain('[^cn-1]: @ai:claude-opus-4.6');
    expect(content).toContain('| group | proposed');
    expect(result.editsApplied).toBe(2);
    expect(result.changeIds).toEqual(['cn-1.1', 'cn-1.2']);
  });

  // ── Reverse-order processing ──

  it('assigns cn-N.1 to the first edit in document order (forward IDs, reverse processing)', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, 'First change here.\n\nSecond change here.\n', 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: 'first original',
      new_text: 'First change',
      timestamp: new Date().toISOString(),
      session_id: 'ses_order',
      context_before: '',
      context_after: ' here.',
    });

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: 'second original',
      new_text: 'Second change',
      timestamp: new Date().toISOString(),
      session_id: 'ses_order',
      context_before: '\n\n',
      context_after: ' here.',
    });

    await applyPendingEdits(tmpDir, 'ses_order', makeConfig());

    const content = await fs.readFile(mdPath, 'utf-8');
    // cn-1.1 = first edit, cn-1.2 = second edit (forward ID allocation)
    expect(content).toContain('{~~first original~>First change~~}[^cn-1.1]');
    expect(content).toContain('{~~second original~>Second change~~}[^cn-1.2]');
  });

  // ── Cross-file ID scanning ──

  it('avoids cross-file ID collision when grouping edits across files', async () => {
    const mdPathA = path.join(tmpDir, 'a.md');
    const mdPathB = path.join(tmpDir, 'b.md');

    // File A has existing cn-5
    await fs.writeFile(
      mdPathA,
      'Change in A.\n\n[^cn-5]: @someone | 2026-02-09 | ins | proposed\n',
      'utf-8',
    );
    // File B has existing cn-3
    await fs.writeFile(
      mdPathB,
      'Change in B.\n\n[^cn-3]: @someone | 2026-02-09 | ins | proposed\n',
      'utf-8',
    );

    await appendPendingEdit(tmpDir, {
      file: mdPathA,
      old_text: 'old A',
      new_text: 'Change in A',
      timestamp: new Date().toISOString(),
      session_id: 'ses_multi',
      context_before: '',
      context_after: '.',
    });
    await appendPendingEdit(tmpDir, {
      file: mdPathB,
      old_text: 'old B',
      new_text: 'Change in B',
      timestamp: new Date().toISOString(),
      session_id: 'ses_multi',
      context_before: '',
      context_after: '.',
    });

    await applyPendingEdits(tmpDir, 'ses_multi', makeConfig());

    const contentA = await fs.readFile(mdPathA, 'utf-8');
    const contentB = await fs.readFile(mdPathB, 'utf-8');

    // Global max is 5 (from file A), so parent ID = 6
    expect(contentA).toContain('[^cn-6.1]');
    expect(contentB).toContain('[^cn-6.2]');
    // Parent footnote in first file
    expect(contentA).toContain('[^cn-6]: @ai:claude-opus-4.6');
    expect(contentA).toContain('| group | proposed');
  });

  // ── Preserves existing IDs ──

  it('increments from the max existing ID in the file', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(
      mdPath,
      '# New heading\n\nSome {++inserted++}[^cn-3] text.\n\n[^cn-3]: @someone | 2026-02-09 | ins | proposed\n',
      'utf-8',
    );

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: '# Old heading',
      new_text: '# New heading',
      timestamp: new Date().toISOString(),
      session_id: 'ses_123',
    });

    await applyPendingEdits(tmpDir, 'ses_123', makeConfig());

    const content = await fs.readFile(mdPath, 'utf-8');
    expect(content).toContain('[^cn-4]');
    expect(content).toContain('[^cn-3]');
  });

  // ── Clears pending edits ──

  it('clears pending.json after processing', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, 'Updated text', 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: 'Original text',
      new_text: 'Updated text',
      timestamp: new Date().toISOString(),
      session_id: 'ses_123',
    });

    await applyPendingEdits(tmpDir, 'ses_123', makeConfig());

    const remaining = await readPendingEdits(tmpDir);
    expect(remaining).toEqual([]);
  });

  it('preserves other session edits when one session is processed', async () => {
    const mdPathA = path.join(tmpDir, 'a.md');
    const mdPathB = path.join(tmpDir, 'b.md');
    await fs.writeFile(mdPathA, 'Change A', 'utf-8');
    await fs.writeFile(mdPathB, 'Change B', 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPathA,
      old_text: 'Original A',
      new_text: 'Change A',
      timestamp: new Date().toISOString(),
      session_id: 'ses_A',
    });
    await appendPendingEdit(tmpDir, {
      file: mdPathB,
      old_text: 'Original B',
      new_text: 'Change B',
      timestamp: new Date().toISOString(),
      session_id: 'ses_B',
    });

    await applyPendingEdits(tmpDir, 'ses_A', makeConfig());

    const remaining = await readPendingEdits(tmpDir);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].session_id).toBe('ses_B');
  });

  // ── Footnote spacing ──

  it('does not produce double blank lines between footnotes', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# New Title\n\nNew paragraph.\n', 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: '# Old Title',
      new_text: '# New Title',
      timestamp: new Date().toISOString(),
      session_id: 'ses_space',
    });
    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: 'Old paragraph.',
      new_text: 'New paragraph.',
      timestamp: new Date().toISOString(),
      session_id: 'ses_space',
    });

    await applyPendingEdits(tmpDir, 'ses_space', makeConfig());

    const content = await fs.readFile(mdPath, 'utf-8');
    // No triple+ newlines (double blank lines between footnotes)
    expect(content).not.toMatch(/\n\n\n/);
    // Footnotes separated by single newlines within the block
    const footnoteSection = content.slice(content.indexOf('[^cn-'));
    const footnoteLines = footnoteSection.split('\n').filter((l) => l.startsWith('[^cn-'));
    expect(footnoteLines.length).toBeGreaterThanOrEqual(2);
  });

  // ── Single edit: no parent footnote ──

  it('does not generate parent footnote for single edits', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, 'Updated text here.\n', 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: 'Original text here.',
      new_text: 'Updated text here.',
      timestamp: new Date().toISOString(),
      session_id: 'ses_single',
    });

    await applyPendingEdits(tmpDir, 'ses_single', makeConfig());

    const content = await fs.readFile(mdPath, 'utf-8');
    expect(content).not.toContain('| group | proposed');
    expect(content).toContain('[^cn-1]');
    expect(content).toContain('| sub | proposed');
  });

  // ── Context-based disambiguation ──

  it('wraps the correct occurrence of duplicated text using context', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, 'AAA hello world BBB\nCCC hello world DDD\n', 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: '',
      new_text: 'hello world',
      timestamp: new Date().toISOString(),
      session_id: 'ses_ctx',
      context_before: 'CCC ',
      context_after: ' DDD',
    });

    await applyPendingEdits(tmpDir, 'ses_ctx', makeConfig());

    const content = await fs.readFile(mdPath, 'utf-8');
    expect(content).toContain('AAA hello world BBB');
    expect(content).toContain('CCC {++hello world++}[^cn-1] DDD');
  });

  // ── File gone ──

  it('skips files that no longer exist', async () => {
    const mdPath = path.join(tmpDir, 'deleted.md');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: 'old',
      new_text: 'new',
      timestamp: new Date().toISOString(),
      session_id: 'ses_123',
    });

    // Don't create the file — it's been deleted
    const result = await applyPendingEdits(tmpDir, 'ses_123', makeConfig());
    // Edits were "applied" (counted and cleared) even though file was skipped
    expect(result.editsApplied).toBe(1);
  });

  // ── Creation tracking: footnote ──

  it('creation_tracking=footnote: adds header + footnote, no inline wrapping', async () => {
    const mdPath = path.join(tmpDir, 'new-doc.md');
    const fullContent = '# Hello World\n\nThis is a new file.\n';
    await fs.writeFile(mdPath, fullContent, 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: '',
      new_text: fullContent,
      timestamp: new Date().toISOString(),
      session_id: 'ses_create',
      tool_name: 'Write',
      edit_class: 'creation',
    });

    await applyPendingEdits(tmpDir, 'ses_create', makeConfig({ creation_tracking: 'footnote' }));

    const result = await fs.readFile(mdPath, 'utf-8');
    expect(result).toContain('<!-- changedown.com/v1: tracked -->');
    expect(result).toContain('[^cn-1]');
    expect(result).toContain('| creation | proposed');
    expect(result).not.toContain('{++');
    expect(result).not.toContain('++}');
    expect(result).toContain('# Hello World');
    expect(result).toContain('This is a new file.');
  });

  // ── Creation tracking: none ──

  it('creation_tracking=none: file is left untouched', async () => {
    const mdPath = path.join(tmpDir, 'new-doc.md');
    const fullContent = '# Untouched\n\nContent here.\n';
    await fs.writeFile(mdPath, fullContent, 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: '',
      new_text: fullContent,
      timestamp: new Date().toISOString(),
      session_id: 'ses_none',
      tool_name: 'Write',
      edit_class: 'creation',
    });

    await applyPendingEdits(tmpDir, 'ses_none', makeConfig({ creation_tracking: 'none' }));

    const result = await fs.readFile(mdPath, 'utf-8');
    expect(result).toBe(fullContent);
  });

  // ── Creation tracking: inline ──

  it('creation_tracking=inline: wraps entire file in {++...++}', async () => {
    const mdPath = path.join(tmpDir, 'new-doc.md');
    const fullContent = '# Wrapped\n\nAll of this.\n';
    await fs.writeFile(mdPath, fullContent, 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: '',
      new_text: fullContent,
      timestamp: new Date().toISOString(),
      session_id: 'ses_inline',
      tool_name: 'Write',
      edit_class: 'creation',
    });

    await applyPendingEdits(tmpDir, 'ses_inline', makeConfig({ creation_tracking: 'inline' }));

    const result = await fs.readFile(mdPath, 'utf-8');
    expect(result).toContain('{++');
    expect(result).toContain('++}');
  });

  // ── Full-file safety guard ──

  it('reclassifies insertion as creation when new_text >= 95% of file content', async () => {
    const mdPath = path.join(tmpDir, 'replaced.md');
    const fullContent = '# Fully Replaced\n\nEntire file was rewritten.\n';
    await fs.writeFile(mdPath, fullContent, 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: '',
      new_text: fullContent,
      timestamp: new Date().toISOString(),
      session_id: 'ses_guard',
      tool_name: 'Edit',
      edit_class: 'insertion', // PostToolUse classified as insertion
    });

    await applyPendingEdits(tmpDir, 'ses_guard', makeConfig({ creation_tracking: 'footnote' }));

    const result = await fs.readFile(mdPath, 'utf-8');
    expect(result).toContain('<!-- changedown.com/v1: tracked -->');
    expect(result).toContain('| creation | proposed');
    expect(result).not.toContain('{++');
  });

  it('does NOT reclassify small insertions as creation', async () => {
    const mdPath = path.join(tmpDir, 'partial.md');
    await fs.writeFile(mdPath, '# Hello\n\nNew paragraph here.\n\nExisting content.\n', 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: '',
      new_text: 'New paragraph here.\n\n',
      timestamp: new Date().toISOString(),
      session_id: 'ses_small',
      tool_name: 'Edit',
      edit_class: 'insertion',
    });

    await applyPendingEdits(tmpDir, 'ses_small', makeConfig({ creation_tracking: 'footnote' }));

    const result = await fs.readFile(mdPath, 'utf-8');
    expect(result).toContain('{++New paragraph here.');
    expect(result).toContain('++}');
    expect(result).toContain('| ins | proposed');
  });

  // ── Preserves existing tracking header ──

  it('does not duplicate tracking header during creation tracking', async () => {
    const mdPath = path.join(tmpDir, 'already-tracked.md');
    const fullContent = '<!-- changedown.com/v1: tracked -->\n# Already Tracked\n\nContent.\n';
    await fs.writeFile(mdPath, fullContent, 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: '',
      new_text: fullContent,
      timestamp: new Date().toISOString(),
      session_id: 'ses_existing',
      tool_name: 'Write',
      edit_class: 'creation',
    });

    await applyPendingEdits(tmpDir, 'ses_existing', makeConfig({ creation_tracking: 'footnote' }));

    const result = await fs.readFile(mdPath, 'utf-8');
    const headerCount = (result.match(/changedown.com\/v1/g) || []).length;
    expect(headerCount).toBe(1);
  });

  // ── CriticMarkup content not corrupted ──

  it('does not corrupt existing CriticMarkup in creation-tracked files', async () => {
    const mdPath = path.join(tmpDir, 'fixture.md');
    const fullContent = '# Test Fixture\n\nThis has an {++insertion++} in the text.\n\nThis has a {--deletion--} in the text.\n';
    await fs.writeFile(mdPath, fullContent, 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: '',
      new_text: fullContent,
      timestamp: new Date().toISOString(),
      session_id: 'ses_regression',
      tool_name: 'Write',
      edit_class: 'creation',
    });

    await applyPendingEdits(tmpDir, 'ses_regression', makeConfig({ creation_tracking: 'footnote' }));

    const result = await fs.readFile(mdPath, 'utf-8');
    expect(result).toContain('{++insertion++}');
    expect(result).toContain('{--deletion--}');
    expect(result).not.toMatch(/\{[+][+]# Test Fixture/);
    expect(result).toContain('<!-- changedown.com/v1: tracked -->');
    expect(result).toContain('| creation | proposed');
  });

  // ── Backward compat: old PendingEdit without edit_class ──

  it('old PendingEdit without edit_class falls through to existing wrapping logic', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Updated heading\n\nSome content.\n', 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: '# Original heading',
      new_text: '# Updated heading',
      timestamp: new Date().toISOString(),
      session_id: 'ses_compat',
    });

    await applyPendingEdits(tmpDir, 'ses_compat', makeConfig({ creation_tracking: 'footnote' }));

    const content = await fs.readFile(mdPath, 'utf-8');
    expect(content).toContain('{~~# Original heading~># Updated heading~~}');
    expect(content).toContain('| sub | proposed');
  });

  // ── Message format ──

  it('returns message with edit count and change IDs', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, 'Updated text', 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: 'Original text',
      new_text: 'Updated text',
      timestamp: new Date().toISOString(),
      session_id: 'ses_123',
    });

    const result = await applyPendingEdits(tmpDir, 'ses_123', makeConfig());

    expect(result.message).toContain('1 edit(s)');
    expect(result.message).toContain('[^cn-1]');
    expect(result.message).toContain('review_changes');
  });
});
