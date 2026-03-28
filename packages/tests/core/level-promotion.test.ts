import { describe, it, expect } from 'vitest';
import { promoteToLevel1, promoteToLevel2 } from '@changedown/core/internals';

describe('Level promotion', () => {
  it('promotes Level 0 to Level 1 by adding adjacent comment', () => {
    const text = '{~~REST~>GraphQL~~}';
    const result = promoteToLevel1(text, 0, '@alice|proposed');
    expect(result).toBe('{~~REST~>GraphQL~~}{>>@alice|proposed<<}');
  });

  it('promotes Level 1 to Level 2 by adding footnote', () => {
    const text = '{~~REST~>GraphQL~~}{>>@alice|2026-02-13|sub|proposed<<}';
    const result = promoteToLevel2(text, 0, 'cn-1');
    expect(result).toMatch(/\{~~REST~>GraphQL~~\}\[\^cn-1\]/);
    expect(result).toMatch(/\[\^cn-1\]: @alice \| 2026-02-13 \| sub \| proposed/);
  });
});
