import { describe, it, expect, beforeAll } from 'vitest';
import { computeAmendEdits, initHashline } from '@changetracks/core';

beforeAll(async () => {
  await initHashline();
});

describe('computeAmendEdits', () => {
  const baseDoc = [
    'Hello {++wrold++}[^ct-1] more text',
    '',
    '[^ct-1]: @alice | 2026-03-09 | ins | proposed',
    '    reason: Added greeting',
    '',
  ].join('\n');

  it('rewrites insertion inline text', () => {
    const result = computeAmendEdits(baseDoc, 'ct-1', {
      newText: 'world',
      reason: 'Fixed typo',
      author: '@alice',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.text).toContain('{++world++}');
      // 'wrold' still appears in the `previous:` footnote line but not in inline markup
      expect(result.text).toMatch(/\{\+\+world\+\+\}/);
      expect(result.text).not.toMatch(/\{\+\+wrold\+\+\}/);
      expect(result.text).toContain('revised');
      expect(result.text).toContain('Fixed typo');
      expect(result.inlineUpdated).toBe(true);
      expect(result.previousText).toBe('wrold');
    }
  });

  it('preserves footnote ref in rewritten markup', () => {
    const result = computeAmendEdits(baseDoc, 'ct-1', {
      newText: 'world',
      reason: 'Fixed typo',
      author: '@alice',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.text).toContain('{++world++}[^ct-1]');
    }
  });

  it('adds previous line with original text', () => {
    const result = computeAmendEdits(baseDoc, 'ct-1', {
      newText: 'world',
      reason: 'Fixed typo',
      author: '@alice',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.text).toContain('    previous: "wrold"');
    }
  });

  it('rewrites substitution modified text', () => {
    const subDoc = [
      'Hello {~~old~>nwe~~}[^ct-1] more text',
      '',
      '[^ct-1]: @alice | 2026-03-09 | sub | proposed',
      '    reason: Fixed word',
      '',
    ].join('\n');
    const result = computeAmendEdits(subDoc, 'ct-1', {
      newText: 'new',
      reason: 'Better wording',
      author: '@alice',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.text).toContain('{~~old~>new~~}');
      expect(result.text).not.toContain('~>nwe~~');
      expect(result.previousText).toBe('nwe');
    }
  });

  it('supports substitution scope expansion with oldText', () => {
    const subDoc = [
      'prefix Hello {~~old~>new~~}[^ct-1] suffix more text',
      '',
      '[^ct-1]: @alice | 2026-03-09 | sub | proposed',
      '    reason: Changed word',
      '',
    ].join('\n');
    const result = computeAmendEdits(subDoc, 'ct-1', {
      newText: 'replacement',
      oldText: 'Hello old suffix',
      reason: 'Wider scope',
      author: '@alice',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.text).toContain('{~~Hello old suffix~>replacement~~}');
      // The prefix "Hello " and suffix " suffix" are consumed from surrounding text
      expect(result.text).toContain('prefix {~~Hello old suffix~>replacement~~}[^ct-1] more text');
    }
  });

  it('rewrites comment text', () => {
    const commentDoc = [
      'Hello {>>old note<<}[^ct-1] more text',
      '',
      '[^ct-1]: @alice | 2026-03-09 | com | proposed',
      '    reason: Comment',
      '',
    ].join('\n');
    const result = computeAmendEdits(commentDoc, 'ct-1', {
      newText: 'updated note',
      reason: 'Clarified',
      author: '@alice',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.text).toContain('{>>updated note<<}');
      // Parser doesn't populate modifiedText for Comment nodes; previousText is ''
      // The comment content is stored in metadata.comment, not modifiedText
      expect(result.previousText).toBe('');
    }
  });

  it('supports reasoning-only amendment (same text, with reason)', () => {
    const result = computeAmendEdits(baseDoc, 'ct-1', {
      newText: 'wrold',
      reason: 'Actually this is correct spelling',
      author: '@alice',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      // Inline markup unchanged
      expect(result.text).toContain('{++wrold++}');
      expect(result.inlineUpdated).toBe(false);
      // Revision entry added
      expect(result.text).toContain('revised');
      expect(result.text).toContain('Actually this is correct spelling');
    }
  });

  it('rejects amend by different author', () => {
    const result = computeAmendEdits(baseDoc, 'ct-1', {
      newText: 'world',
      reason: 'Fix',
      author: '@bob',
    });
    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error).toContain('not the original author');
    }
  });

  it('normalizes @ prefix for author comparison', () => {
    // Author without @ should still match @alice
    const result = computeAmendEdits(baseDoc, 'ct-1', {
      newText: 'world',
      reason: 'Fix',
      author: 'alice',
    });
    expect(result.isError).toBe(false);
  });

  it('rejects amend on non-proposed change (accepted)', () => {
    const acceptedDoc = baseDoc.replace('| proposed', '| accepted');
    const result = computeAmendEdits(acceptedDoc, 'ct-1', {
      newText: 'world',
      reason: 'Fix',
      author: '@alice',
    });
    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error).toContain('Cannot amend a accepted change');
    }
  });

  it('rejects amend on non-proposed change (rejected)', () => {
    const rejectedDoc = baseDoc.replace('| proposed', '| rejected');
    const result = computeAmendEdits(rejectedDoc, 'ct-1', {
      newText: 'world',
      reason: 'Fix',
      author: '@alice',
    });
    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error).toContain('Cannot amend a rejected change');
    }
  });

  it('rejects newText on deletion changes', () => {
    const delDoc = [
      'Hello {--removed--}[^ct-1] more text',
      '',
      '[^ct-1]: @alice | 2026-03-09 | del | proposed',
      '    reason: Removed text',
      '',
    ].join('\n');
    const result = computeAmendEdits(delDoc, 'ct-1', {
      newText: 'something',
      reason: 'Fix',
      author: '@alice',
    });
    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error).toContain('Deletion changes cannot be amended inline');
    }
  });

  it('rejects newText containing CriticMarkup delimiters', () => {
    const result = computeAmendEdits(baseDoc, 'ct-1', {
      newText: 'hello {++nested++}',
      reason: 'Fix',
      author: '@alice',
    });
    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error).toContain('CriticMarkup delimiters');
    }
  });

  it('rejects identical text with no reasoning', () => {
    const result = computeAmendEdits(baseDoc, 'ct-1', {
      newText: 'wrold',
      author: '@alice',
    });
    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error).toContain('identical to current proposed text');
    }
  });

  it('rejects empty newText for insertion', () => {
    const result = computeAmendEdits(baseDoc, 'ct-1', {
      newText: '',
      reason: 'Remove it',
      author: '@alice',
    });
    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error).toContain('required for amend');
    }
  });

  it('rejects old_text on non-substitution changes', () => {
    const result = computeAmendEdits(baseDoc, 'ct-1', {
      newText: 'world',
      oldText: 'Hello wrold',
      reason: 'Fix',
      author: '@alice',
    });
    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error).toContain('only supported for substitution');
    }
  });

  it('returns error for nonexistent change ID', () => {
    const result = computeAmendEdits(baseDoc, 'ct-99', {
      newText: 'world',
      reason: 'Fix',
      author: '@alice',
    });
    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error).toContain('not found');
    }
  });

  it('truncates previous text longer than 100 characters', () => {
    const longText = 'a'.repeat(150);
    const longDoc = [
      `Hello {++${longText}++}[^ct-1] more text`,
      '',
      '[^ct-1]: @alice | 2026-03-09 | ins | proposed',
      '    reason: Added long text',
      '',
    ].join('\n');
    const result = computeAmendEdits(longDoc, 'ct-1', {
      newText: 'short',
      reason: 'Shorten',
      author: '@alice',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      // The previous line should have truncated text with ...
      expect(result.text).toContain('    previous: "' + 'a'.repeat(100) + '..."');
    }
  });

  it('uses provided date instead of nowTimestamp', () => {
    const result = computeAmendEdits(baseDoc, 'ct-1', {
      newText: 'world',
      reason: 'Fixed typo',
      author: '@alice',
      date: '2026-03-09T12:00:00Z',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.text).toContain('revised @alice 2026-03-09T12:00:00Z: Fixed typo');
    }
  });
});

describe('computeAmendEdits on L3 (footnote-native)', () => {
  const l3Doc = [
    '<!-- ctrcks.com/v1: tracked -->',
    'Hello wrold more text',
    '',
    '[^ct-1]: @alice | 2026-03-09 | ins | proposed',
    '    2:b4 {++wrold ++}',
  ].join('\n');

  it('finds the change and produces valid edits for L3 format', () => {
    const result = computeAmendEdits(l3Doc, 'ct-1', {
      newText: 'world ',
      reason: 'Fixed typo',
      author: '@alice',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      // The amended text should have the corrected inline markup
      expect(result.text).toContain('world');
      // Revision entry should be added
      expect(result.text).toContain('revised');
      expect(result.text).toContain('Fixed typo');
      expect(result.previousText).toBe('wrold ');
    }
  });

  it('rejects amend from non-author on L3', () => {
    const result = computeAmendEdits(l3Doc, 'ct-1', {
      newText: 'world ',
      author: '@bob',
    });
    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error).toContain('not the original author');
    }
  });
});
