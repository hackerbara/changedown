import { describe, it, expect } from 'vitest';
import { compactToLevel1, compactToLevel0 } from '@changetracks/core/internals';

describe('Level descent (compaction)', () => {
  it('compacts Level 2 to Level 1', () => {
    const text = '{~~REST~>GraphQL~~}[^ct-1]\n\n[^ct-1]: @alice | 2026-02-13 | sub | accepted\n    approved: @carol 2026-02-15';
    const result = compactToLevel1(text, 'ct-1');
    expect(result).toBe('{~~REST~>GraphQL~~}{>>@alice|2026-02-13|sub|accepted<<}');
  });

  it('compacts Level 1 to Level 0', () => {
    const text = '{~~REST~>GraphQL~~}{>>@alice|accepted<<}';
    const result = compactToLevel0(text, 0);
    expect(result).toBe('{~~REST~>GraphQL~~}');
  });

  it('compactToLevel0 removes adjacent comment with full metadata', () => {
    const text = '{++quick brown fox++}{>>@alice|2026-02-13|ins|accepted<<}';
    const result = compactToLevel0(text, 0);
    expect(result).toBe('{++quick brown fox++}');
  });

  it('compactToLevel0 preserves user comment on highlight while removing metadata comment', () => {
    const text = '{==highlighted text==}{>>user comment<<}{>>@alice|2026-02-13|highlight|accepted<<}';
    const result = compactToLevel0(text, 0);
    expect(result).toBe('{==highlighted text==}{>>user comment<<}');
  });

  it('compactToLevel0 preserves surrounding text when change is mid-document', () => {
    const text = 'before {~~old~>new~~}{>>@bob|2026-03-01|sub|accepted<<} after';
    const result = compactToLevel0(text, 0);
    expect(result).toBe('before {~~old~>new~~} after');
  });
});
