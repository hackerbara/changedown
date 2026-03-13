import * as assert from 'node:assert';
import { promoteToLevel1, promoteToLevel2 } from '@changetracks/core/internals';

describe('Level promotion', () => {
  it('promotes Level 0 to Level 1 by adding adjacent comment', () => {
    const text = '{~~REST~>GraphQL~~}';
    const result = promoteToLevel1(text, 0, '@alice|proposed');
    assert.strictEqual(result, '{~~REST~>GraphQL~~}{>>@alice|proposed<<}');
  });

  it('promotes Level 1 to Level 2 by adding footnote', () => {
    const text = '{~~REST~>GraphQL~~}{>>@alice|2026-02-13|sub|proposed<<}';
    const result = promoteToLevel2(text, 0, 'ct-1');
    assert.match(result, /\{~~REST~>GraphQL~~\}\[\^ct-1\]/);
    assert.match(result, /\[\^ct-1\]: @alice \| 2026-02-13 \| sub \| proposed/);
  });
});
