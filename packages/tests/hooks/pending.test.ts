import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { readPendingEdits, appendPendingEdit, clearPendingEdits, type PendingEdit } from 'changetracks-hooks/internals';

describe('pending edits', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-hooks-pending-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const makeEdit = (overrides?: Partial<PendingEdit>): PendingEdit => ({
    file: '/project/docs/readme.md',
    old_text: 'old content',
    new_text: 'new content',
    timestamp: '2026-02-10T12:00:00.000Z',
    session_id: 'ses_abc123',
    ...overrides,
  });

  it('readPendingEdits returns empty array when file does not exist', async () => {
    const edits = await readPendingEdits(tmpDir);
    expect(edits).toEqual([]);
  });

  it('appendPendingEdit creates .changetracks dir and pending.json if they do not exist', async () => {
    const edit = makeEdit();
    await appendPendingEdit(tmpDir, edit);

    const pendingPath = path.join(tmpDir, '.changetracks', 'pending.json');
    const raw = await fs.readFile(pendingPath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].file).toBe(edit.file);
    expect(parsed[0].old_text).toBe(edit.old_text);
    expect(parsed[0].new_text).toBe(edit.new_text);
  });

  it('appendPendingEdit adds to existing entries', async () => {
    const edit1 = makeEdit({ file: '/project/a.md' });
    const edit2 = makeEdit({ file: '/project/b.md' });

    await appendPendingEdit(tmpDir, edit1);
    await appendPendingEdit(tmpDir, edit2);

    const edits = await readPendingEdits(tmpDir);
    expect(edits).toHaveLength(2);
    expect(edits[0].file).toBe('/project/a.md');
    expect(edits[1].file).toBe('/project/b.md');
  });

  it('clearPendingEdits removes the file', async () => {
    const edit = makeEdit();
    await appendPendingEdit(tmpDir, edit);
    await clearPendingEdits(tmpDir);

    const edits = await readPendingEdits(tmpDir);
    expect(edits).toEqual([]);
  });

  it('round-trip: append then read preserves all fields', async () => {
    const edit = makeEdit({
      context_before: 'text before edit',
      context_after: 'text after edit',
    });
    await appendPendingEdit(tmpDir, edit);

    const edits = await readPendingEdits(tmpDir);
    expect(edits).toHaveLength(1);
    expect(edits[0]).toEqual(edit);
  });

  it('readPendingEdits returns empty array for malformed JSON', async () => {
    const pendingPath = path.join(tmpDir, '.changetracks', 'pending.json');
    await fs.mkdir(path.dirname(pendingPath), { recursive: true });
    await fs.writeFile(pendingPath, '{{not valid json', 'utf-8');

    const edits = await readPendingEdits(tmpDir);
    expect(edits).toEqual([]);
  });
});
