import { describe, it, expect, beforeEach } from 'vitest';
import { SessionState, ActiveGroup } from '@changetracks/opencode-plugin/internals';

describe('SessionState', () => {
  let state: SessionState;

  beforeEach(() => {
    state = new SessionState();
  });

  describe('getNextId', () => {
    it('generates sequential IDs starting from 1', () => {
      const id1 = state.getNextId('/test/file.ts', '');
      expect(id1).toBe('ct-1');

      const id2 = state.getNextId('/test/file.ts', '');
      expect(id2).toBe('ct-2');

      const id3 = state.getNextId('/test/file.ts', '');
      expect(id3).toBe('ct-3');
    });

    it('scans existing IDs in text to find max', () => {
      const text = 'Some [^ct-5] and [^ct-10] content';
      const id = state.getNextId('/test/file.ts', text);
      expect(id).toBe('ct-11');
    });

    it('maintains separate counters per file', () => {
      const id1 = state.getNextId('/test/file1.ts', '');
      expect(id1).toBe('ct-1');

      const id2 = state.getNextId('/test/file2.ts', '');
      expect(id2).toBe('ct-1');

      const id3 = state.getNextId('/test/file1.ts', '');
      expect(id3).toBe('ct-2');
    });
  });

  describe('resetFile', () => {
    it('resets file counter correctly', () => {
      const id1 = state.getNextId('/test/file.ts', '');
      expect(id1).toBe('ct-1');

      state.resetFile('/test/file.ts');

      const id2 = state.getNextId('/test/file.ts', '');
      expect(id2).toBe('ct-1');
    });

    it('does not affect other files when resetting', () => {
      state.getNextId('/test/file1.ts', '');
      state.getNextId('/test/file1.ts', '');
      
      state.getNextId('/test/file2.ts', '');
      
      state.resetFile('/test/file1.ts');

      const id = state.getNextId('/test/file2.ts', '');
      expect(id).toBe('ct-2');
    });
  });

  describe('group management', () => {
    it('hasActiveGroup returns false initially', () => {
      expect(state.hasActiveGroup()).toBe(false);
    });

    it('getActiveGroup returns null initially', () => {
      expect(state.getActiveGroup()).toBeNull();
    });

    it('beginGroup creates parent ID and returns group ID', () => {
      const groupId = state.beginGroup('Test group');
      expect(groupId).toBe('ct-1');
      expect(state.hasActiveGroup()).toBe(true);
    });

    it('groups create parent ID with dotted children', () => {
      state.beginGroup('Test group');
      
      const childId1 = state.getNextId('/test/file.ts', '');
      expect(childId1).toBe('ct-1.1');

      const childId2 = state.getNextId('/test/file.ts', '');
      expect(childId2).toBe('ct-1.2');

      const childId3 = state.getNextId('/test/file.ts', '');
      expect(childId3).toBe('ct-1.3');
    });

    it('endGroup returns summary and clears active group', () => {
      state.beginGroup('Test group', 'Test reasoning');
      state.getNextId('/test/file.ts', '');
      state.getNextId('/test/file.ts', '');

      const summary = state.endGroup();

      expect(summary.id).toBe('ct-1');
      expect(summary.description).toBe('Test group');
      expect(summary.reasoning).toBe('Test reasoning');
      expect(summary.childIds).toEqual(['ct-1.1', 'ct-1.2']);
      expect(summary.files).toContain('/test/file.ts');
      expect(state.hasActiveGroup()).toBe(false);
    });

    it('throws when beginning group while another is active', () => {
      state.beginGroup('First group');
      expect(() => state.beginGroup('Second group')).toThrow('A change group is already active');
    });

    it('throws when ending group with no active group', () => {
      expect(() => state.endGroup()).toThrow('No active change group');
    });

    it('incorporates knownMaxId when beginning group', () => {
      state.getNextId('/test/file.ts', ''); // ct-1
      state.getNextId('/test/file.ts', ''); // ct-2

      const groupId = state.beginGroup('Test group', undefined, 10);
      expect(groupId).toBe('ct-11');
    });

    it('ActiveGroup tracks childIds and files', () => {
      state.beginGroup('Test group');
      
      state.getNextId('/test/file1.ts', '');
      state.getNextId('/test/file2.ts', '');
      state.getNextId('/test/file1.ts', '');

      const activeGroup = state.getActiveGroup();
      expect(activeGroup).not.toBeNull();
      expect(activeGroup?.childCount).toBe(3);
      expect(activeGroup?.childIds).toEqual(['ct-1.1', 'ct-1.2', 'ct-1.3']);
      expect(activeGroup?.files.size).toBe(2);
      expect(activeGroup?.files.has('/test/file1.ts')).toBe(true);
      expect(activeGroup?.files.has('/test/file2.ts')).toBe(true);
    });
  });

  describe('file hashes', () => {
    it('recordFileHashes stores hashes', () => {
      const hashes = [
        { line: 1, raw: 'abc123', settled: 'def456' },
        { line: 2, raw: 'ghi789', settled: 'jkl012' },
      ];

      state.recordFileHashes('/test/file.ts', hashes);
      const retrieved = state.getRecordedHashes('/test/file.ts');

      expect(retrieved).toEqual(hashes);
    });

    it('getRecordedHashes returns undefined for unknown file', () => {
      const result = state.getRecordedHashes('/test/unknown.ts');
      expect(result).toBeUndefined();
    });

    it('recordFileHashes overwrites previous hashes', () => {
      const hashes1 = [{ line: 1, raw: 'abc', settled: 'def' }];
      const hashes2 = [{ line: 1, raw: 'xyz', settled: 'uvw' }];

      state.recordFileHashes('/test/file.ts', hashes1);
      state.recordFileHashes('/test/file.ts', hashes2);

      const retrieved = state.getRecordedHashes('/test/file.ts');
      expect(retrieved).toEqual(hashes2);
    });
  });
});
