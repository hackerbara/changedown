import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  readPendingEdits,
  appendPendingEdit,
  clearSessionEdits,
  clearAllEdits,
} from '@changedown/opencode-plugin/internals';
import type { PendingEdit } from '@changedown/opencode-plugin/internals';

describe('Pending Edit Queue', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pending-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('readPendingEdits', () => {
    it('returns empty array when file does not exist', async () => {
      const result = await readPendingEdits(tempDir);
      expect(result).toEqual([]);
    });
  });

  describe('appendPendingEdit', () => {
    it('appends and reads edits', async () => {
      const edit1: PendingEdit = {
        file: 'test.ts',
        old_text: 'old content',
        new_text: 'new content',
        timestamp: new Date().toISOString(),
        session_id: 'session-1',
        context_before: 'some context',
        context_after: 'more context',
      };

      const edit2: PendingEdit = {
        file: 'other.ts',
        old_text: 'foo',
        new_text: 'bar',
        timestamp: new Date().toISOString(),
        session_id: 'session-2',
      };

      await appendPendingEdit(tempDir, edit1);
      await appendPendingEdit(tempDir, edit2);

      const result = await readPendingEdits(tempDir);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(edit1);
      expect(result[1]).toEqual(edit2);
    });

    it('creates .changedown directory if it does not exist', async () => {
      const edit: PendingEdit = {
        file: 'test.ts',
        old_text: 'old',
        new_text: 'new',
        timestamp: new Date().toISOString(),
        session_id: 'session-1',
      };

      await appendPendingEdit(tempDir, edit);

      const stats = await fs.stat(path.join(tempDir, '.changedown'));
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('clearSessionEdits', () => {
    it('clears only specified session edits (preserves other sessions)', async () => {
      const edit1: PendingEdit = {
        file: 'test1.ts',
        old_text: 'old1',
        new_text: 'new1',
        timestamp: new Date().toISOString(),
        session_id: 'session-1',
      };

      const edit2: PendingEdit = {
        file: 'test2.ts',
        old_text: 'old2',
        new_text: 'new2',
        timestamp: new Date().toISOString(),
        session_id: 'session-2',
      };

      const edit3: PendingEdit = {
        file: 'test3.ts',
        old_text: 'old3',
        new_text: 'new3',
        timestamp: new Date().toISOString(),
        session_id: 'session-1',
      };

      await appendPendingEdit(tempDir, edit1);
      await appendPendingEdit(tempDir, edit2);
      await appendPendingEdit(tempDir, edit3);

      await clearSessionEdits(tempDir, 'session-1');

      const result = await readPendingEdits(tempDir);
      expect(result).toHaveLength(1);
      expect(result[0].session_id).toBe('session-2');
    });

    it('removes file entirely when no edits remain', async () => {
      const edit: PendingEdit = {
        file: 'test.ts',
        old_text: 'old',
        new_text: 'new',
        timestamp: new Date().toISOString(),
        session_id: 'session-1',
      };

      await appendPendingEdit(tempDir, edit);
      await clearSessionEdits(tempDir, 'session-1');

      const filePath = path.join(tempDir, '.changedown', 'pending.json');
      await expect(fs.access(filePath)).rejects.toThrow();
    });
  });

  describe('clearAllEdits', () => {
    it('removes entire pending file', async () => {
      const edit: PendingEdit = {
        file: 'test.ts',
        old_text: 'old',
        new_text: 'new',
        timestamp: new Date().toISOString(),
        session_id: 'session-1',
      };

      await appendPendingEdit(tempDir, edit);
      await clearAllEdits(tempDir);

      const filePath = path.join(tempDir, '.changedown', 'pending.json');
      await expect(fs.access(filePath)).rejects.toThrow();
    });

    it('handles missing file gracefully', async () => {
      await expect(clearAllEdits(tempDir)).resolves.not.toThrow();
    });
  });
});
