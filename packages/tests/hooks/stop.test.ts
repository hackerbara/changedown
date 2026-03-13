import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { handleStop, findDeletionInsertionPoint, findEditPosition, appendPendingEdit, readPendingEdits, clearSessionEdits } from 'changetracks-hooks/internals';
import type { HookInput, PendingEdit } from 'changetracks-hooks/internals';

describe('Stop handler', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-hooks-stop-'));
    // Create .changetracks dir with config
    const scDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(scDir, { recursive: true });
    await fs.writeFile(
      path.join(scDir, 'config.toml'),
      `[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[author]\ndefault = "ai:claude-opus-4.6"\n`,
      'utf-8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const makeInput = (sessionId: string): HookInput => ({
    hook_event_name: 'Stop',
    session_id: sessionId,
    cwd: tmpDir,
    stop_hook_active: true,
  });

  it('returns empty object when no pending edits exist', async () => {
    const result = await handleStop(makeInput('ses_123'));
    expect(result).toEqual({});
  });

  it('returns empty object when pending edits belong to a different session', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, 'Updated text', 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: 'Original text',
      new_text: 'Updated text',
      timestamp: new Date().toISOString(),
      session_id: 'ses_OTHER',
    });

    const result = await handleStop(makeInput('ses_123'));
    expect(result).toEqual({});
  });

  it('applies substitution markup for a single edit', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    // File has already been edited (new_text is in the file)
    await fs.writeFile(mdPath, '# Updated heading\n\nSome content.\n', 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: '# Original heading',
      new_text: '# Updated heading',
      timestamp: new Date().toISOString(),
      session_id: 'ses_123',
    });

    const result = await handleStop(makeInput('ses_123'));

    // Verify CriticMarkup was applied
    const content = await fs.readFile(mdPath, 'utf-8');
    expect(content).toContain('{~~# Original heading~># Updated heading~~}');
    expect(content).toContain('[^ct-1]');
    // Verify footnote was appended
    expect(content).toContain('[^ct-1]: @ai:claude-opus-4.6');
    expect(content).toContain('| sub | proposed');

    // Verify summary message (Stop hooks use systemMessage, not hookSpecificOutput)
    expect(result.systemMessage).toBeDefined();
    expect(result.systemMessage).toContain('1 edit(s)');
    expect(result.systemMessage).toContain('[^ct-1]');
  });

  it('applies insertion markup for a pure insertion', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    // File has the inserted text already
    await fs.writeFile(mdPath, '# Hello\n\nNew paragraph here.\n\nOld paragraph.\n', 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: '',
      new_text: 'New paragraph here.\n\n',
      timestamp: new Date().toISOString(),
      session_id: 'ses_123',
    });

    const result = await handleStop(makeInput('ses_123'));

    const content = await fs.readFile(mdPath, 'utf-8');
    expect(content).toContain('{++New paragraph here.\n\n++}');
    expect(content).toContain('[^ct-1]');
    expect(content).toContain('| ins | proposed');
  });

  it('applies deletion markup using context', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    // File has the deletion already applied (text is gone)
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

    const result = await handleStop(makeInput('ses_123'));

    const content = await fs.readFile(mdPath, 'utf-8');
    expect(content).toContain('{--Removed text. --}');
    expect(content).toContain('[^ct-1]');
    expect(content).toContain('| del | proposed');
  });

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

    const result = await handleStop(makeInput('ses_123'));

    const content = await fs.readFile(mdPath, 'utf-8');
    // Should use dotted IDs under a parent
    expect(content).toContain('[^ct-1.1]');
    expect(content).toContain('[^ct-1.2]');
    expect(result.systemMessage).toContain('2 edit(s)');
  });

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

    await handleStop(makeInput('ses_123'));

    const remaining = await readPendingEdits(tmpDir);
    expect(remaining).toEqual([]);
  });

  it('preserves existing footnote IDs (increments from max)', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    // File already has ct-3 as the highest ID
    await fs.writeFile(
      mdPath,
      '# New heading\n\nSome {++inserted++}[^ct-3] text.\n\n[^ct-3]: @someone | 2026-02-09 | ins | proposed\n',
      'utf-8',
    );

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: '# Old heading',
      new_text: '# New heading',
      timestamp: new Date().toISOString(),
      session_id: 'ses_123',
    });

    await handleStop(makeInput('ses_123'));

    const content = await fs.readFile(mdPath, 'utf-8');
    // New change should be ct-4 (max was 3)
    expect(content).toContain('[^ct-4]');
    // Original ct-3 should still be there
    expect(content).toContain('[^ct-3]');
  });
});

describe('findDeletionInsertionPoint', () => {
  it('finds position using both context_before and context_after', () => {
    const content = 'Hello world. Goodbye world.';
    const edit: PendingEdit = {
      file: 'test.md',
      old_text: 'Beautiful ',
      new_text: '',
      timestamp: '',
      session_id: '',
      context_before: 'Hello world. ',
      context_after: 'Goodbye world.',
    };
    const pos = findDeletionInsertionPoint(content, edit);
    expect(pos).toBe(13); // After "Hello world. "
  });

  it('falls back to context_before only', () => {
    const content = 'Hello world. Something different after.';
    const edit: PendingEdit = {
      file: 'test.md',
      old_text: 'removed',
      new_text: '',
      timestamp: '',
      session_id: '',
      context_before: 'Hello world. ',
      context_after: 'does not match',
    };
    const pos = findDeletionInsertionPoint(content, edit);
    expect(pos).toBe(13);
  });

  it('returns -1 when no context matches', () => {
    const content = 'Completely unrelated text.';
    const edit: PendingEdit = {
      file: 'test.md',
      old_text: 'removed',
      new_text: '',
      timestamp: '',
      session_id: '',
      context_before: 'no match before',
      context_after: 'no match after',
    };
    const pos = findDeletionInsertionPoint(content, edit);
    expect(pos).toBe(-1);
  });
});

describe('findEditPosition', () => {
  it('disambiguates when targetText appears multiple times using context', () => {
    // "hello" appears twice — context identifies the second occurrence
    const content = 'AAA hello BBB CCC hello DDD';
    const result = findEditPosition(content, 'hello', 'CCC ', ' DDD');
    expect(result.start).toBe(18); // Position of second "hello"
    expect(result.end).toBe(23);
  });

  it('falls back to contextBefore + targetText when contextAfter does not match', () => {
    const content = 'AAA hello BBB CCC hello DIFFERENT';
    const result = findEditPosition(content, 'hello', 'CCC ', 'does not match');
    expect(result.start).toBe(18);
    expect(result.end).toBe(23);
  });

  it('falls back to targetText + contextAfter when contextBefore does not match', () => {
    const content = 'AAA hello BBB CCC hello DDD';
    const result = findEditPosition(content, 'hello', 'no match', ' DDD');
    expect(result.start).toBe(18);
    expect(result.end).toBe(23);
  });

  it('falls back to bare indexOf when no context provided', () => {
    const content = 'AAA hello BBB';
    const result = findEditPosition(content, 'hello');
    expect(result.start).toBe(4);
    expect(result.end).toBe(9);
  });

  it('returns -1 when targetText is not found', () => {
    const content = 'no match here';
    const result = findEditPosition(content, 'missing');
    expect(result).toEqual({ start: -1, end: -1 });
  });

  it('returns -1 for empty targetText', () => {
    const result = findEditPosition('some content', '');
    expect(result).toEqual({ start: -1, end: -1 });
  });
});

describe('Stop handler - context-based position (Fix 1)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-hooks-fix1-'));
    const scDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(scDir, { recursive: true });
    await fs.writeFile(
      path.join(scDir, 'config.toml'),
      `[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[author]\ndefault = "ai:claude-opus-4.6"\n`,
      'utf-8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const makeInput = (sessionId: string): HookInput => ({
    hook_event_name: 'Stop',
    session_id: sessionId,
    cwd: tmpDir,
    stop_hook_active: true,
  });

  it('wraps the correct occurrence of duplicated text using context', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    // "hello world" appears twice in the file
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

    await handleStop(makeInput('ses_ctx'));

    const content = await fs.readFile(mdPath, 'utf-8');
    // The second "hello world" should be wrapped, the first should be untouched
    expect(content).toContain('AAA hello world BBB');
    expect(content).toContain('CCC {++hello world++}[^ct-1] DDD');
  });

  it('wraps the correct substitution occurrence using context', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    // "updated" appears twice in the file
    await fs.writeFile(mdPath, 'First updated text.\nSecond updated text.\n', 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: 'original',
      new_text: 'updated',
      timestamp: new Date().toISOString(),
      session_id: 'ses_ctx',
      context_before: 'Second ',
      context_after: ' text.',
    });

    await handleStop(makeInput('ses_ctx'));

    const content = await fs.readFile(mdPath, 'utf-8');
    // First "updated" should be untouched, second should have markup
    expect(content).toContain('First updated text.');
    expect(content).toContain('Second {~~original~>updated~~}[^ct-1]');
  });
});

describe('Stop handler - ID ordering (Fix 2)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-hooks-fix2-'));
    const scDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(scDir, { recursive: true });
    await fs.writeFile(
      path.join(scDir, 'config.toml'),
      `[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[author]\ndefault = "ai:claude-opus-4.6"\n`,
      'utf-8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const makeInput = (sessionId: string): HookInput => ({
    hook_event_name: 'Stop',
    session_id: sessionId,
    cwd: tmpDir,
    stop_hook_active: true,
  });

  it('assigns ct-N.1 to the first edit in document order, not the last', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, 'First change here.\n\nSecond change here.\n', 'utf-8');

    // Append in document order: first edit, then second edit
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

    await handleStop(makeInput('ses_order'));

    const content = await fs.readFile(mdPath, 'utf-8');
    // ct-1.1 should be the FIRST edit (First change), ct-1.2 should be the SECOND (Second change)
    expect(content).toContain('{~~first original~>First change~~}[^ct-1.1]');
    expect(content).toContain('{~~second original~>Second change~~}[^ct-1.2]');
  });
});

describe('Stop handler - session-specific clearing (Fix 3)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-hooks-fix3-'));
    const scDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(scDir, { recursive: true });
    await fs.writeFile(
      path.join(scDir, 'config.toml'),
      `[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[author]\ndefault = "ai:claude-opus-4.6"\n`,
      'utf-8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const makeInput = (sessionId: string): HookInput => ({
    hook_event_name: 'Stop',
    session_id: sessionId,
    cwd: tmpDir,
    stop_hook_active: true,
  });

  it('preserves other session edits when one session stops', async () => {
    const mdPathA = path.join(tmpDir, 'a.md');
    const mdPathB = path.join(tmpDir, 'b.md');
    await fs.writeFile(mdPathA, 'Change A', 'utf-8');
    await fs.writeFile(mdPathB, 'Change B', 'utf-8');

    // Session A has an edit
    await appendPendingEdit(tmpDir, {
      file: mdPathA,
      old_text: 'Original A',
      new_text: 'Change A',
      timestamp: new Date().toISOString(),
      session_id: 'ses_A',
    });

    // Session B has an edit
    await appendPendingEdit(tmpDir, {
      file: mdPathB,
      old_text: 'Original B',
      new_text: 'Change B',
      timestamp: new Date().toISOString(),
      session_id: 'ses_B',
    });

    // Session A stops — should only process ses_A edits and clear them
    await handleStop(makeInput('ses_A'));

    // Session B's edits should still be pending
    const remaining = await readPendingEdits(tmpDir);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].session_id).toBe('ses_B');
  });

  it('clearSessionEdits removes only target session, preserves others', async () => {
    await appendPendingEdit(tmpDir, {
      file: '/test/a.md',
      old_text: 'a',
      new_text: 'b',
      timestamp: new Date().toISOString(),
      session_id: 'ses_keep',
    });
    await appendPendingEdit(tmpDir, {
      file: '/test/b.md',
      old_text: 'c',
      new_text: 'd',
      timestamp: new Date().toISOString(),
      session_id: 'ses_remove',
    });

    await clearSessionEdits(tmpDir, 'ses_remove');

    const remaining = await readPendingEdits(tmpDir);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].session_id).toBe('ses_keep');
  });

  it('clearSessionEdits deletes file when no edits remain', async () => {
    await appendPendingEdit(tmpDir, {
      file: '/test/a.md',
      old_text: 'a',
      new_text: 'b',
      timestamp: new Date().toISOString(),
      session_id: 'ses_only',
    });

    await clearSessionEdits(tmpDir, 'ses_only');

    const remaining = await readPendingEdits(tmpDir);
    expect(remaining).toEqual([]);
  });
});

describe('Stop handler - global max ID (Fix 4)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-hooks-fix4-'));
    const scDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(scDir, { recursive: true });
    await fs.writeFile(
      path.join(scDir, 'config.toml'),
      `[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[author]\ndefault = "ai:claude-opus-4.6"\n`,
      'utf-8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const makeInput = (sessionId: string): HookInput => ({
    hook_event_name: 'Stop',
    session_id: sessionId,
    cwd: tmpDir,
    stop_hook_active: true,
  });

  it('avoids cross-file ID collision when grouping edits across files', async () => {
    const mdPathA = path.join(tmpDir, 'a.md');
    const mdPathB = path.join(tmpDir, 'b.md');

    // File A has existing ct-5
    await fs.writeFile(
      mdPathA,
      'Change in A.\n\n[^ct-5]: @someone | 2026-02-09 | ins | proposed\n',
      'utf-8',
    );
    // File B has existing ct-3
    await fs.writeFile(
      mdPathB,
      'Change in B.\n\n[^ct-3]: @someone | 2026-02-09 | ins | proposed\n',
      'utf-8',
    );

    // Two edits across both files -> group with dotted IDs
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

    await handleStop(makeInput('ses_multi'));

    const contentA = await fs.readFile(mdPathA, 'utf-8');
    const contentB = await fs.readFile(mdPathB, 'utf-8');

    // Global max is 5 (from file A), so parent ID should be 6
    expect(contentA).toContain('[^ct-6.1]');
    expect(contentB).toContain('[^ct-6.2]');
    // Parent footnote should be in the first file
    expect(contentA).toContain('[^ct-6]: @ai:claude-opus-4.6');
    expect(contentA).toContain('| group | proposed');
  });
});

describe('Stop handler - parent footnote for groups (Fix 7)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-hooks-fix7-'));
    const scDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(scDir, { recursive: true });
    await fs.writeFile(
      path.join(scDir, 'config.toml'),
      `[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[author]\ndefault = "ai:claude-opus-4.6"\n`,
      'utf-8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const makeInput = (sessionId: string): HookInput => ({
    hook_event_name: 'Stop',
    session_id: sessionId,
    cwd: tmpDir,
    stop_hook_active: true,
  });

  it('generates parent footnote [^ct-N] with type group for multi-edit sessions', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# New Title\n\nNew paragraph.\n', 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: '# Old Title',
      new_text: '# New Title',
      timestamp: new Date().toISOString(),
      session_id: 'ses_grp',
    });
    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: 'Old paragraph.',
      new_text: 'New paragraph.',
      timestamp: new Date().toISOString(),
      session_id: 'ses_grp',
    });

    await handleStop(makeInput('ses_grp'));

    const content = await fs.readFile(mdPath, 'utf-8');
    // Parent footnote should exist with group type
    expect(content).toContain('[^ct-1]: @ai:claude-opus-4.6');
    expect(content).toContain('| group | proposed');
    // Children should exist
    expect(content).toContain('[^ct-1.1]');
    expect(content).toContain('[^ct-1.2]');
  });

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

    await handleStop(makeInput('ses_single'));

    const content = await fs.readFile(mdPath, 'utf-8');
    // No group footnote — only [^ct-1] with type sub
    expect(content).not.toContain('| group | proposed');
    expect(content).toContain('[^ct-1]');
    expect(content).toContain('| sub | proposed');
  });
});

describe('Stop handler - footnote spacing (Fix 6)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-hooks-fix6-'));
    const scDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(scDir, { recursive: true });
    await fs.writeFile(
      path.join(scDir, 'config.toml'),
      `[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[author]\ndefault = "ai:claude-opus-4.6"\n`,
      'utf-8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const makeInput = (sessionId: string): HookInput => ({
    hook_event_name: 'Stop',
    session_id: sessionId,
    cwd: tmpDir,
    stop_hook_active: true,
  });

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

    await handleStop(makeInput('ses_space'));

    const content = await fs.readFile(mdPath, 'utf-8');
    // No triple+ newlines (which would mean double blank lines between footnotes)
    expect(content).not.toMatch(/\n\n\n/);
    // Footnotes should be separated by single newlines (within the block)
    // and the block starts with a blank line separator from the content
    const footnoteSection = content.slice(content.indexOf('[^ct-'));
    const footnoteLines = footnoteSection.split('\n').filter((l) => l.startsWith('[^ct-'));
    expect(footnoteLines.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Stop handler - session_id fallback (Fix 5)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-hooks-fix5-'));
    const scDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(scDir, { recursive: true });
    await fs.writeFile(
      path.join(scDir, 'config.toml'),
      `[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[author]\ndefault = "ai:claude-opus-4.6"\n`,
      'utf-8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('matches edits stored with session_id "unknown" when session_id is undefined', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, 'Updated text', 'utf-8');

    // PostToolUse stores session_id as 'unknown' when input.session_id is undefined
    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: 'Original text',
      new_text: 'Updated text',
      timestamp: new Date().toISOString(),
      session_id: 'unknown',
    });

    // Stop hook with undefined session_id should match 'unknown'
    const input: HookInput = {
      hook_event_name: 'Stop',
      // session_id intentionally omitted (undefined)
      cwd: tmpDir,
      stop_hook_active: true,
    };

    const result = await handleStop(input);
    expect(result.systemMessage).toBeDefined();
    expect(result.systemMessage).toContain('1 edit(s)');
  });
});

describe('findEditPosition without confusables', () => {
  it('does not match smart quotes against ASCII (no confusables)', () => {
    const content = 'The API\u2019s interface is clean.';
    const result = findEditPosition(content, "API's interface", undefined, undefined);
    // Without confusables, smart quote vs ASCII is a mismatch.
    expect(result).toEqual({ start: -1, end: -1 });
  });

  it('matches NBSP against regular space via NFKC normalization', () => {
    const content = 'hello\u00A0world foo';
    const result = findEditPosition(content, 'hello world', undefined, undefined);
    // NFKC normalizes NBSP to regular space, so normalizedIndexOf matches.
    expect(result.start).toBe(0);
    expect(result.end).toBe(11);
  });

  it('does not match smart quotes via context strategy 1 (no confusables)', () => {
    const content = 'Before Sublime\u2019s code. After text.';
    const result = findEditPosition(content, "Sublime's code", 'Before ', '. After');
    expect(result).toEqual({ start: -1, end: -1 });
  });

  it('does not match smart quotes via context strategy 2 (no confusables)', () => {
    const content = 'Before Sublime\u2019s code. After text.';
    const result = findEditPosition(content, "Sublime's code", 'Before ', 'no match');
    expect(result).toEqual({ start: -1, end: -1 });
  });

  it('does not match smart quotes via context strategy 3 (no confusables)', () => {
    const content = 'Before Sublime\u2019s code. After text.';
    const result = findEditPosition(content, "Sublime's code", 'no match', '. After');
    expect(result).toEqual({ start: -1, end: -1 });
  });

  it('does not match smart quotes via bare target strategy 4 (no confusables)', () => {
    const content = 'The API\u2019s interface is clean.';
    const result = findEditPosition(content, "API's interface");
    expect(result).toEqual({ start: -1, end: -1 });
  });
});

describe('findDeletionInsertionPoint without confusables', () => {
  it('strategy 1 fails for smart quotes, falls through to strategy 3 (context_after)', () => {
    const content = 'Hello Sublime\u2019s world. Goodbye.';
    const edit: PendingEdit = {
      file: 'test.md',
      old_text: 'deleted text',
      new_text: '',
      timestamp: '',
      session_id: '',
      context_before: "Sublime's world. ",  // ASCII apostrophe — won't match smart quote
      context_after: 'Goodbye.',             // exact match via strategy 3
    };
    const pos = findDeletionInsertionPoint(content, edit);
    // Strategy 1 (both) and strategy 2 (before) fail due to smart quote mismatch.
    // Strategy 3 (after only) matches 'Goodbye.' exactly, returning its position.
    expect(pos).toBe(23);
  });

  it('does not match smart quotes in context_before only (no confusables)', () => {
    const content = 'Hello Sublime\u2019s world.';
    const edit: PendingEdit = {
      file: 'test.md',
      old_text: 'removed',
      new_text: '',
      timestamp: '',
      session_id: '',
      context_before: "Sublime's world.",  // ASCII apostrophe — won't match smart quote
      context_after: 'does not match',
    };
    const pos = findDeletionInsertionPoint(content, edit);
    // All strategies fail: before has smart quote mismatch, after doesn't exist
    expect(pos).toBe(-1);
  });

  it('does not match smart quotes in context_after only (no confusables)', () => {
    const content = 'Some text. Sublime\u2019s world.';
    const edit: PendingEdit = {
      file: 'test.md',
      old_text: 'removed',
      new_text: '',
      timestamp: '',
      session_id: '',
      context_before: 'no match',
      context_after: "Sublime's world.",  // ASCII apostrophe — won't match smart quote
    };
    const pos = findDeletionInsertionPoint(content, edit);
    expect(pos).toBe(-1);
  });
});

describe('Stop handler - policy.mode gating', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-hooks-policy-'));
    const scDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(scDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('skips batch-wrapping in strict mode even with pending edits', async () => {
    const configPath = path.join(tmpDir, '.changetracks', 'config.toml');
    await fs.writeFile(configPath, '[tracking]\ninclude = ["**/*.md"]\n\n[author]\ndefault = "ai:claude-opus-4.6"\n\n[policy]\nmode = "strict"\n', 'utf-8');

    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, 'Updated text', 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: 'Original text',
      new_text: 'Updated text',
      timestamp: new Date().toISOString(),
      session_id: 'test-session',
    });

    const result = await handleStop({
      hook_event_name: 'Stop',
      session_id: 'test-session',
      cwd: tmpDir,
    });
    expect(result).toEqual({});

    // Verify pending edits were cleared (not left dangling)
    const remaining = await readPendingEdits(tmpDir);
    expect(remaining).toEqual([]);
  });

  it('skips batch-wrapping in permissive mode', async () => {
    const configPath = path.join(tmpDir, '.changetracks', 'config.toml');
    await fs.writeFile(configPath, '[tracking]\ninclude = ["**/*.md"]\n\n[author]\ndefault = "ai:claude-opus-4.6"\n\n[policy]\nmode = "permissive"\n', 'utf-8');

    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, 'Updated text', 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: 'Original text',
      new_text: 'Updated text',
      timestamp: new Date().toISOString(),
      session_id: 'test-session',
    });

    const result = await handleStop({
      hook_event_name: 'Stop',
      session_id: 'test-session',
      cwd: tmpDir,
    });
    expect(result).toEqual({});

    // Verify pending edits were cleared
    const remaining = await readPendingEdits(tmpDir);
    expect(remaining).toEqual([]);
  });

  it('batch-wraps in safety-net mode (existing behavior)', async () => {
    const configPath = path.join(tmpDir, '.changetracks', 'config.toml');
    await fs.writeFile(configPath, '[tracking]\ninclude = ["**/*.md"]\n\n[author]\ndefault = "ai:claude-opus-4.6"\n\n[policy]\nmode = "safety-net"\n', 'utf-8');

    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, 'Updated text here.\n', 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: 'Original text here.',
      new_text: 'Updated text here.',
      timestamp: new Date().toISOString(),
      session_id: 'test-session',
    });

    const result = await handleStop({
      hook_event_name: 'Stop',
      session_id: 'test-session',
      cwd: tmpDir,
    });
    // Safety-net mode DOES batch-wrap
    expect(result.systemMessage).toBeDefined();
    expect(result.systemMessage).toContain('1 edit(s)');
  });
});

describe('Stop handler — creation tracking', () => {
  let tmpDir: string;

  /** Writes a safety-net config with optional creation_tracking override */
  async function writeConfig(creationTracking?: string) {
    const scDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(scDir, { recursive: true });
    const ct = creationTracking ? `\ncreation_tracking = "${creationTracking}"` : '';
    await fs.writeFile(
      path.join(scDir, 'config.toml'),
      `[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[author]\ndefault = "ai:claude-opus-4.6"\n\n[policy]\nmode = "safety-net"${ct}\n`,
      'utf-8',
    );
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-hooks-creation-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const makeInput = (sessionId: string): HookInput => ({
    hook_event_name: 'Stop',
    session_id: sessionId,
    cwd: tmpDir,
    stop_hook_active: true,
  });

  it('creation_tracking=footnote: adds header + footnote, no inline wrapping', async () => {
    await writeConfig('footnote');
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

    await handleStop(makeInput('ses_create'));

    const result = await fs.readFile(mdPath, 'utf-8');
    expect(result).toContain('<!-- ctrcks.com/v1: tracked -->');
    expect(result).toContain('[^ct-1]');
    expect(result).toContain('| creation | proposed');
    expect(result).not.toContain('{++');
    expect(result).not.toContain('++}');
    expect(result).toContain('# Hello World');
    expect(result).toContain('This is a new file.');
  });

  it('creation_tracking=none: file is left completely untouched', async () => {
    await writeConfig('none');
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

    await handleStop(makeInput('ses_none'));

    const result = await fs.readFile(mdPath, 'utf-8');
    expect(result).toBe(fullContent);
  });

  it('creation_tracking=inline: wraps entire file in {++...++} (legacy behavior)', async () => {
    await writeConfig('inline');
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

    await handleStop(makeInput('ses_inline'));

    const result = await fs.readFile(mdPath, 'utf-8');
    expect(result).toContain('{++');
    expect(result).toContain('++}');
  });

  it('defaults to footnote when creation_tracking is not specified', async () => {
    await writeConfig(); // no creation_tracking param
    const mdPath = path.join(tmpDir, 'new-doc.md');
    const fullContent = '# Default Behavior\n\nShould get footnote.\n';
    await fs.writeFile(mdPath, fullContent, 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: '',
      new_text: fullContent,
      timestamp: new Date().toISOString(),
      session_id: 'ses_default',
      tool_name: 'Write',
      edit_class: 'creation',
    });

    await handleStop(makeInput('ses_default'));

    const result = await fs.readFile(mdPath, 'utf-8');
    expect(result).toContain('<!-- ctrcks.com/v1: tracked -->');
    expect(result).toContain('| creation | proposed');
    expect(result).not.toContain('{++');
  });

  it('full-file safety guard: reclassifies Edit as creation when new_text ≈ fileContent', async () => {
    await writeConfig('footnote');
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
      edit_class: 'insertion',  // PostToolUse classified as insertion
    });

    await handleStop(makeInput('ses_guard'));

    const result = await fs.readFile(mdPath, 'utf-8');
    expect(result).toContain('<!-- ctrcks.com/v1: tracked -->');
    expect(result).toContain('| creation | proposed');
    expect(result).not.toContain('{++');
  });

  it('does NOT reclassify small insertions as creation', async () => {
    await writeConfig('footnote');
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

    await handleStop(makeInput('ses_small'));

    const result = await fs.readFile(mdPath, 'utf-8');
    expect(result).toContain('{++New paragraph here.');
    expect(result).toContain('++}');
    expect(result).toContain('| ins | proposed');
  });

  it('preserves existing tracking header during creation tracking', async () => {
    await writeConfig('footnote');
    const mdPath = path.join(tmpDir, 'already-tracked.md');
    const fullContent = '<!-- ctrcks.com/v1: tracked -->\n# Already Tracked\n\nContent.\n';
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

    await handleStop(makeInput('ses_existing'));

    const result = await fs.readFile(mdPath, 'utf-8');
    const headerCount = (result.match(/ctrcks.com\/v1/g) || []).length;
    expect(headerCount).toBe(1);
  });

  it('regression: Write creating file with CriticMarkup content does NOT corrupt it', async () => {
    await writeConfig('footnote');
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

    await handleStop(makeInput('ses_regression'));

    const result = await fs.readFile(mdPath, 'utf-8');
    expect(result).toContain('{++insertion++}');
    expect(result).toContain('{--deletion--}');
    expect(result).not.toMatch(/\{[+][+]# Test Fixture/);
    expect(result).toContain('<!-- ctrcks.com/v1: tracked -->');
    expect(result).toContain('| creation | proposed');
  });

  it('backward compat: old PendingEdit without edit_class falls through to existing logic', async () => {
    await writeConfig('footnote');
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Updated heading\n\nSome content.\n', 'utf-8');

    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: '# Original heading',
      new_text: '# Updated heading',
      timestamp: new Date().toISOString(),
      session_id: 'ses_compat',
    });

    await handleStop(makeInput('ses_compat'));

    const content = await fs.readFile(mdPath, 'utf-8');
    expect(content).toContain('{~~# Original heading~># Updated heading~~}');
    expect(content).toContain('| sub | proposed');
  });
});
