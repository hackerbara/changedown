import { describe, it, expect, beforeAll } from 'vitest';
import { initHashline } from '@changetracks/core';
import { formatRedirect, formatReadRedirect } from 'changetracks-hooks/internals';

describe('formatRedirect', () => {
  // ─── Classic mode ────────────────────────────────────────────────────────

  describe('classic mode', () => {
    const baseConfig = {
      protocol: { mode: 'classic' as const },
      hashline: { enabled: false },
    };

    it('formats Edit as propose_change with old_text/new_text', () => {
      const result = formatRedirect({
        toolName: 'Edit',
        filePath: 'packages/benchmarks/V1-RUNBOOK.md',
        oldText: '**RUNNING**',
        newText: '**DONE** (14/15)',
        fileContent: 'some\n**RUNNING**\nmore',
        config: baseConfig,
      });

      expect(result).toContain('propose_change');
      expect(result).toContain('old_text="**RUNNING**"');
      expect(result).toContain('new_text="**DONE** (14/15)"');
      expect(result).toContain('reason=');
    });

    it('escapes double quotes in old_text and new_text', () => {
      const result = formatRedirect({
        toolName: 'Edit',
        filePath: 'doc.md',
        oldText: 'said "hello"',
        newText: 'said "goodbye"',
        fileContent: 'He said "hello" to her.',
        config: baseConfig,
      });

      expect(result).toContain('old_text="said \\"hello\\""');
      expect(result).toContain('new_text="said \\"goodbye\\""');
    });

    it('formats batch skeleton for Write with multiple changes', () => {
      const oldContent = 'Line one\nLine two\nLine three';
      const newContent = 'Line ONE\nLine two\nLine THREE';
      const result = formatRedirect({
        toolName: 'Write',
        filePath: 'doc.md',
        oldText: '',
        newText: newContent,
        fileContent: oldContent,
        config: baseConfig,
      });

      expect(result).toContain('changes multiple sections');
      expect(result).toContain('read_tracked_file');
    });

    it('detects pure insertion in Write', () => {
      const oldContent = 'Line one\nLine two';
      const newContent = 'Line one\nLine two\n\n## New Section\nNew content';
      const result = formatRedirect({
        toolName: 'Write',
        filePath: 'doc.md',
        oldText: '',
        newText: newContent,
        fileContent: oldContent,
        config: baseConfig,
      });

      expect(result).toContain('insertion');
      expect(result).toContain('propose_change');
      expect(result).toContain('insert_after=');
    });

    it('truncates long insertions in Write to 200 chars', () => {
      const oldContent = 'Line one';
      const longInsert = '\n' + 'A'.repeat(300);
      const newContent = oldContent + longInsert;
      const result = formatRedirect({
        toolName: 'Write',
        filePath: 'doc.md',
        oldText: '',
        newText: newContent,
        fileContent: oldContent,
        config: baseConfig,
      });

      expect(result).toContain('...');
      expect(result).toContain('insertion');
    });
  });

  // ─── Compact mode ────────────────────────────────────────────────────────

  describe('compact mode', () => {
    const compactConfig = {
      protocol: { mode: 'compact' as const },
      hashline: { enabled: true },
    };

    // WASM init required for computeLineHash
    beforeAll(async () => {
      await initHashline();
    });

    it('computes LINE:HASH for single-line edit', () => {
      const content = 'Line one\nLine two\nLine three';
      const result = formatRedirect({
        toolName: 'Edit',
        filePath: 'doc.md',
        oldText: 'Line two',
        newText: 'Line TWO',
        fileContent: content,
        config: compactConfig,
      });

      expect(result).toContain('at=');
      expect(result).toContain('op="Line two~>Line TWO');
      expect(result).toContain('>>describe');
    });

    it('computes hash range for multi-line edit', () => {
      const content = 'Line one\nLine two\nLine three\nLine four';
      const result = formatRedirect({
        toolName: 'Edit',
        filePath: 'doc.md',
        oldText: 'Line two\nLine three',
        newText: 'Replacement',
        fileContent: content,
        config: compactConfig,
      });

      expect(result).toContain('spans lines 2-3');
      expect(result).toContain('at="2:');
      expect(result).toContain('-3:');
    });

    it('falls back when old_text not found', () => {
      const result = formatRedirect({
        toolName: 'Edit',
        filePath: 'doc.md',
        oldText: 'nonexistent text',
        newText: 'replacement',
        fileContent: 'actual content here',
        config: compactConfig,
      });

      expect(result).toContain('not found');
      expect(result).toContain('read_tracked_file');
    });

    it('formats Write insertion with compact at+op syntax', () => {
      const oldContent = 'Line one\nLine two';
      const newContent = 'Line one\nLine two\nNew stuff';
      const result = formatRedirect({
        toolName: 'Write',
        filePath: 'doc.md',
        oldText: '',
        newText: newContent,
        fileContent: oldContent,
        config: compactConfig,
      });

      expect(result).toContain('insertion after line 2');
      expect(result).toContain('at="2:');
      expect(result).toContain('op="+');
    });

    it('includes footnote annotation hint in single-line output', () => {
      const content = 'First line\nSecond line\nThird line';
      const result = formatRedirect({
        toolName: 'Edit',
        filePath: 'doc.md',
        oldText: 'Second line',
        newText: 'Updated line',
        fileContent: content,
        config: compactConfig,
      });

      expect(result).toContain('>>annotation is your reasoning');
      expect(result).toContain('footnote');
    });

    it('includes hash-range explanation for multi-line output', () => {
      const content = 'A\nB\nC\nD';
      const result = formatRedirect({
        toolName: 'Edit',
        filePath: 'doc.md',
        oldText: 'B\nC',
        newText: 'X',
        fileContent: content,
        config: compactConfig,
      });

      expect(result).toContain('Hash range replaces the full block');
      expect(result).toContain('no need to reproduce old text');
    });
  });
});

describe('formatReadRedirect', () => {
  it('formats read_tracked_file call with default view', () => {
    const result = formatReadRedirect('docs/readme.md', {});
    expect(result).toContain('read_tracked_file');
    expect(result).toContain('file="docs/readme.md"');
    expect(result).toContain('view="review"');
    expect(result).toContain('tracked');
  });

  it('uses configured default_view when set', () => {
    const result = formatReadRedirect('docs/readme.md', {
      policy: { default_view: 'changes' },
    });
    expect(result).toContain('view="changes"');
  });

  it('falls back to review when default_view is undefined', () => {
    const result = formatReadRedirect('docs/readme.md', {
      policy: {},
    });
    expect(result).toContain('view="review"');
  });
});
