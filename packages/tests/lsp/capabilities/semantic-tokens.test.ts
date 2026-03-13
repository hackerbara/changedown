import * as assert from 'assert';
import { getSemanticTokensLegend, buildSemanticTokens } from '@changetracks/lsp-server/internals';
import type { SemanticTokensLegend } from '@changetracks/lsp-server/internals';
import { ChangeType, ChangeNode, ChangeStatus } from '@changetracks/core';

describe('Semantic Tokens', () => {
  describe('getSemanticTokensLegend', () => {
    it('should return token types for CriticMarkup', () => {
      const legend = getSemanticTokensLegend();
      assert.ok(legend);
      assert.ok(Array.isArray(legend.tokenTypes));
      assert.ok(Array.isArray(legend.tokenModifiers));

      // Verify expected token types (custom types to avoid theme color override)
      assert.ok(legend.tokenTypes.includes('changetracks-insertion'));
      assert.ok(legend.tokenTypes.includes('changetracks-deletion'));
      assert.ok(legend.tokenTypes.includes('changetracks-highlight'));

      // Verify expected modifiers
      assert.ok(legend.tokenModifiers.includes('modification'));
      assert.ok(legend.tokenModifiers.includes('deprecated'));
    });

    it('should have consistent order for token types', () => {
      const legend = getSemanticTokensLegend();
      const expectedTokenTypes = [
          'changetracks-insertion', 'changetracks-deletion', 'changetracks-highlight',
          'changetracks-comment', 'changetracks-subOriginal', 'changetracks-subModified',
          'changetracks-moveFrom', 'changetracks-moveTo'
      ];
      assert.deepStrictEqual(legend.tokenTypes, expectedTokenTypes);
    });

    it('should have consistent order for token modifiers', () => {
      const legend = getSemanticTokensLegend();
      const expectedModifiers = [
          'modification', 'deprecated', 'proposed', 'accepted',
          'hasThread', 'authorSlot0', 'authorSlot1', 'authorSlot2'
      ];
      assert.deepStrictEqual(legend.tokenModifiers, expectedModifiers);
    });
  });

  describe('buildSemanticTokens', () => {
    const testText = 'Sample text for testing';

    describe('insertion tokens', () => {
      it('should generate tokens for insertion with correct type and modifier', () => {
        const changes: ChangeNode[] = [{
          id: '1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 14 },
          contentRange: { start: 3, end: 11 },
          level: 0, anchored: false
        }];

        const result = buildSemanticTokens(changes, testText);
        assert.ok(result);
        assert.ok(Array.isArray(result.data));

        // LSP format: [deltaLine, deltaStartChar, length, tokenType, tokenModifiers]
        // For insertion with Proposed status:
        //   tokenType=0 (changetracks-insertion)
        //   tokenModifiers = modification(1) | proposed(4) = 5
        const data = result.data;
        assert.strictEqual(data.length, 5);
        assert.strictEqual(data[0], 0); // deltaLine (first token, line 0)
        assert.strictEqual(data[1], 3); // deltaStartChar (start at char 3)
        assert.strictEqual(data[2], 8); // length (11-3=8)
        assert.strictEqual(data[3], 0); // tokenType (changetracks-insertion=0)
        assert.strictEqual(data[4], 5); // tokenModifiers (modification=1 | proposed=4 = 5)
      });

      it('should skip multi-line insertions', () => {
        const multilineText = 'Line 1\nLine 2\nLine 3';
        const changes: ChangeNode[] = [{
          id: '1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 20 },
          contentRange: { start: 3, end: 17 }, // spans from Line 1 to Line 2
          level: 0, anchored: false
        }];

        const result = buildSemanticTokens(changes, multilineText);
        // Multi-line tokens are skipped in current implementation
        assert.strictEqual(result.data.length, 0);
      });
    });

    describe('deletion tokens', () => {
      it('should generate tokens for deletion with correct type and modifier', () => {
        const changes: ChangeNode[] = [{
          id: '1',
          type: ChangeType.Deletion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 14 },
          contentRange: { start: 3, end: 11 },
          level: 0, anchored: false
        }];

        const result = buildSemanticTokens(changes, testText);
        assert.ok(result);

        // For deletion with Proposed status:
        //   tokenType=1 (changetracks-deletion)
        //   tokenModifiers = deprecated(2) | proposed(4) = 6
        const data = result.data;
        assert.strictEqual(data.length, 5);
        assert.strictEqual(data[3], 1); // tokenType (changetracks-deletion=1)
        assert.strictEqual(data[4], 6); // tokenModifiers (deprecated=2 | proposed=4 = 6)
      });
    });

    describe('substitution tokens', () => {
      it('should generate tokens for both original and modified text', () => {
        const changes: ChangeNode[] = [{
          id: '1',
          type: ChangeType.Substitution,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 20 },
          contentRange: { start: 3, end: 17 },
          originalRange: { start: 3, end: 10 },
          modifiedRange: { start: 12, end: 17 },
          level: 0, anchored: false
        }];

        const result = buildSemanticTokens(changes, testText);
        assert.ok(result);

        // Should have tokens for both original (subOriginal+deprecated) and modified (subModified+modification)
        const data = result.data;
        assert.strictEqual(data.length, 10); // 2 tokens × 5 integers each

        // First token: original (changetracks-subOriginal + deprecated + proposed)
        //   tokenModifiers = deprecated(2) | proposed(4) = 6
        assert.strictEqual(data[3], 4); // tokenType (changetracks-subOriginal=4)
        assert.strictEqual(data[4], 6); // tokenModifiers (deprecated=2 | proposed=4 = 6)

        // Second token: modified (changetracks-subModified + modification + proposed)
        //   tokenModifiers = modification(1) | proposed(4) = 5
        assert.strictEqual(data[8], 5); // tokenType (changetracks-subModified=5)
        assert.strictEqual(data[9], 5); // tokenModifiers (modification=1 | proposed=4 = 5)
      });

      it('should handle missing originalRange or modifiedRange', () => {
        const changes: ChangeNode[] = [{
          id: '1',
          type: ChangeType.Substitution,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 20 },
          contentRange: { start: 3, end: 17 },
          level: 0, anchored: false
          // Missing originalRange and modifiedRange
        }];

        const result = buildSemanticTokens(changes, testText);
        // Should not crash, should return empty or fallback tokens
        assert.ok(result);
      });
    });

    describe('highlight tokens', () => {
      it('should generate tokens for highlight with type tokenType', () => {
        const changes: ChangeNode[] = [{
          id: '1',
          type: ChangeType.Highlight,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 14 },
          contentRange: { start: 3, end: 11 },
          level: 0, anchored: false
        }];

        const result = buildSemanticTokens(changes, testText);
        assert.ok(result);

        // For highlight with Proposed status:
        //   tokenType=2 (changetracks-highlight)
        //   tokenModifiers = proposed(4)
        const data = result.data;
        assert.strictEqual(data.length, 5);
        assert.strictEqual(data[3], 2); // tokenType (changetracks-highlight=2)
        assert.strictEqual(data[4], 4); // tokenModifiers (proposed=4)
      });
    });

    describe('comment tokens', () => {
      it('should generate tokens for comment with comment tokenType', () => {
        const changes: ChangeNode[] = [{
          id: '1',
          type: ChangeType.Comment,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 14 },
          contentRange: { start: 3, end: 11 },
          level: 0, anchored: false
        }];

        const result = buildSemanticTokens(changes, testText);
        assert.ok(result);

        // For comment with Proposed status:
        //   tokenType=3 (changetracks-comment)
        //   tokenModifiers = proposed(4)
        const data = result.data;
        assert.strictEqual(data.length, 5);
        assert.strictEqual(data[3], 3); // tokenType (changetracks-comment=3)
        assert.strictEqual(data[4], 4); // tokenModifiers (proposed=4)
      });
    });

    describe('multiple changes', () => {
      it('should generate tokens for multiple changes in document order', () => {
        const changes: ChangeNode[] = [
          {
            id: '1',
            type: ChangeType.Insertion,
            status: ChangeStatus.Proposed,
            range: { start: 0, end: 10 },
            contentRange: { start: 3, end: 7 },
            level: 0, anchored: false
          },
          {
            id: '2',
            type: ChangeType.Deletion,
            status: ChangeStatus.Proposed,
            range: { start: 15, end: 25 },
            contentRange: { start: 18, end: 22 },
            level: 0, anchored: false
          }
        ];

        const result = buildSemanticTokens(changes, testText);
        assert.ok(result);

        // Should have 2 tokens × 5 integers
        const data = result.data;
        assert.strictEqual(data.length, 10);

        // First token: insertion with proposed status
        //   tokenModifiers = modification(1) | proposed(4) = 5
        assert.strictEqual(data[0], 0); // deltaLine
        assert.strictEqual(data[1], 3); // deltaStartChar
        assert.strictEqual(data[3], 0); // tokenType (changetracks-insertion)
        assert.strictEqual(data[4], 5); // tokenModifiers (modification=1 | proposed=4 = 5)

        // Second token: deletion (delta from first token) with proposed status
        //   tokenModifiers = deprecated(2) | proposed(4) = 6
        // deltaLine should still be 0 (same line)
        // deltaStartChar should be relative to previous token
        assert.strictEqual(data[5], 0); // deltaLine
        assert.strictEqual(data[8], 1); // tokenType (changetracks-deletion)
        assert.strictEqual(data[9], 6); // tokenModifiers (deprecated=2 | proposed=4 = 6)
      });

      it('should handle changes across multiple lines', () => {
        const multilineText = 'Line 1\nLine 2\nLine 3';
        const changes: ChangeNode[] = [
          {
            id: '1',
            type: ChangeType.Insertion,
            status: ChangeStatus.Proposed,
            range: { start: 0, end: 5 },
            contentRange: { start: 0, end: 5 },
            level: 0, anchored: false
          },
          {
            id: '2',
            type: ChangeType.Deletion,
            status: ChangeStatus.Proposed,
            range: { start: 7, end: 12 },
            contentRange: { start: 7, end: 12 },
            level: 0, anchored: false
          }
        ];

        const result = buildSemanticTokens(changes, multilineText);
        assert.ok(result.data.length >= 10);
      });
    });

    describe('empty input', () => {
      it('should return empty tokens for empty changes array', () => {
        const result = buildSemanticTokens([], testText);
        assert.ok(result);
        assert.strictEqual(result.data.length, 0);
      });

      it('should return empty tokens for empty text', () => {
        const changes: ChangeNode[] = [{
          id: '1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 0 },
          contentRange: { start: 0, end: 0 },
          level: 0, anchored: false
        }];

        const result = buildSemanticTokens(changes, '');
        assert.ok(result);
        // Zero-length tokens should be skipped
      });
    });

    describe('LSP encoding format', () => {
      it('should encode tokens in delta format', () => {
        const changes: ChangeNode[] = [
          {
            id: '1',
            type: ChangeType.Insertion,
            status: ChangeStatus.Proposed,
            range: { start: 0, end: 10 },
            contentRange: { start: 3, end: 7 },
            level: 0, anchored: false
          },
          {
            id: '2',
            type: ChangeType.Insertion,
            status: ChangeStatus.Proposed,
            range: { start: 10, end: 20 },
            contentRange: { start: 13, end: 17 },
            level: 0, anchored: false
          }
        ];

        const result = buildSemanticTokens(changes, testText);
        const data = result.data;

        // First token: absolute position
        assert.strictEqual(data[0], 0); // deltaLine (line 0)
        assert.strictEqual(data[1], 3); // deltaStartChar (char 3)

        // Second token: delta from first
        assert.strictEqual(data[5], 0); // deltaLine (still line 0)
        // deltaStartChar should be relative: (13 - 3) = 10
        assert.strictEqual(data[6], 10); // deltaStartChar (relative to previous)
      });

      it('should handle token modifiers as bit flags', () => {
        const changes: ChangeNode[] = [{
          id: '1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 10 },
          contentRange: { start: 3, end: 7 },
          level: 0, anchored: false
        }];

        const result = buildSemanticTokens(changes, testText);
        const modifiers = result.data[4];

        // modification modifier (bit 0 = 1) + proposed modifier (bit 2 = 4) = 5
        assert.strictEqual(modifiers, 5);
      });
    });
  });

  describe('enriched semantic tokens', () => {
    const testText = 'Sample text for testing enriched tokens here';

    describe('move token types', () => {
      it('should emit moveTo token type for insertion with moveRole=to', () => {
        const changes: ChangeNode[] = [{
          id: '1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 14 },
          contentRange: { start: 3, end: 11 },
          level: 0, anchored: false,
          moveRole: 'to',
          groupId: 'g1'
        }];

        const result = buildSemanticTokens(changes, testText);
        const data = result.data;
        assert.strictEqual(data.length, 5);
        assert.strictEqual(data[3], 7); // tokenType (changetracks-moveTo=7)
        // modification(1) | proposed(4) = 5
        assert.strictEqual(data[4], 5);
      });

      it('should emit moveFrom token type for deletion with moveRole=from', () => {
        const changes: ChangeNode[] = [{
          id: '1',
          type: ChangeType.Deletion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 14 },
          contentRange: { start: 3, end: 11 },
          level: 0, anchored: false,
          moveRole: 'from',
          groupId: 'g1'
        }];

        const result = buildSemanticTokens(changes, testText);
        const data = result.data;
        assert.strictEqual(data.length, 5);
        assert.strictEqual(data[3], 6); // tokenType (changetracks-moveFrom=6)
        // deprecated(2) | proposed(4) = 6
        assert.strictEqual(data[4], 6);
      });

      it('should emit standard insertion token when moveRole is absent', () => {
        const changes: ChangeNode[] = [{
          id: '1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 14 },
          contentRange: { start: 3, end: 11 },
          level: 0, anchored: false
        }];

        const result = buildSemanticTokens(changes, testText);
        const data = result.data;
        assert.strictEqual(data[3], 0); // tokenType (changetracks-insertion=0)
      });

      it('should emit standard deletion token when moveRole is absent', () => {
        const changes: ChangeNode[] = [{
          id: '1',
          type: ChangeType.Deletion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 14 },
          contentRange: { start: 3, end: 11 },
          level: 0, anchored: false
        }];

        const result = buildSemanticTokens(changes, testText);
        const data = result.data;
        assert.strictEqual(data[3], 1); // tokenType (changetracks-deletion=1)
      });
    });

    describe('status modifiers', () => {
      it('should set proposed modifier for Proposed status', () => {
        const changes: ChangeNode[] = [{
          id: '1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 14 },
          contentRange: { start: 3, end: 11 },
          level: 0, anchored: false
        }];

        const result = buildSemanticTokens(changes, testText);
        const modifiers = result.data[4];
        // proposed bit is 1<<2 = 4
        assert.strictEqual(modifiers & 4, 4, 'proposed modifier bit should be set');
        // accepted bit is 1<<3 = 8
        assert.strictEqual(modifiers & 8, 0, 'accepted modifier bit should not be set');
      });

      it('should set accepted modifier for Accepted status', () => {
        const changes: ChangeNode[] = [{
          id: '1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Accepted,
          range: { start: 0, end: 14 },
          contentRange: { start: 3, end: 11 },
          level: 0, anchored: false
        }];

        const result = buildSemanticTokens(changes, testText);
        const modifiers = result.data[4];
        // accepted bit is 1<<3 = 8
        assert.strictEqual(modifiers & 8, 8, 'accepted modifier bit should be set');
        // proposed bit is 1<<2 = 4
        assert.strictEqual(modifiers & 4, 0, 'proposed modifier bit should not be set');
      });

      it('should set proposed modifier when metadata.status is proposed', () => {
        const changes: ChangeNode[] = [{
          id: '1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 14 },
          contentRange: { start: 3, end: 11 },
          level: 0, anchored: false,
          metadata: { status: 'proposed' }
        }];

        const result = buildSemanticTokens(changes, testText);
        const modifiers = result.data[4];
        assert.strictEqual(modifiers & 4, 4, 'proposed modifier bit should be set');
      });

      it('should set accepted modifier when metadata.status is accepted', () => {
        const changes: ChangeNode[] = [{
          id: '1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,  // status field disagrees — metadata wins too
          range: { start: 0, end: 14 },
          contentRange: { start: 3, end: 11 },
          level: 0, anchored: false,
          metadata: { status: 'accepted' }
        }];

        const result = buildSemanticTokens(changes, testText);
        const modifiers = result.data[4];
        // metadata.status='accepted' sets accepted bit; ChangeStatus.Proposed sets proposed bit
        assert.strictEqual(modifiers & 8, 8, 'accepted modifier bit should be set from metadata');
      });
    });

    describe('thread modifier', () => {
      it('should set hasThread modifier when discussion is non-empty', () => {
        const changes: ChangeNode[] = [{
          id: '1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 14 },
          contentRange: { start: 3, end: 11 },
          level: 0, anchored: false,
          metadata: {
            discussion: [{
              author: 'alice',
              date: '2026-01-01',
              timestamp: { date: '2026-01-01', iso: '2026-01-01T00:00:00Z' },
              text: 'This looks good',
              depth: 0
            }]
          }
        }];

        const result = buildSemanticTokens(changes, testText);
        const modifiers = result.data[4];
        // hasThread bit is 1<<4 = 16
        assert.strictEqual(modifiers & 16, 16, 'hasThread modifier bit should be set');
      });

      it('should not set hasThread modifier when discussion is empty', () => {
        const changes: ChangeNode[] = [{
          id: '1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 14 },
          contentRange: { start: 3, end: 11 },
          level: 0, anchored: false,
          metadata: { discussion: [] }
        }];

        const result = buildSemanticTokens(changes, testText);
        const modifiers = result.data[4];
        assert.strictEqual(modifiers & 16, 0, 'hasThread modifier bit should not be set for empty discussion');
      });

      it('should not set hasThread modifier when metadata is absent', () => {
        const changes: ChangeNode[] = [{
          id: '1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 14 },
          contentRange: { start: 3, end: 11 },
          level: 0, anchored: false
        }];

        const result = buildSemanticTokens(changes, testText);
        const modifiers = result.data[4];
        assert.strictEqual(modifiers & 16, 0, 'hasThread modifier bit should not be set when no metadata');
      });
    });

    describe('author slot modifiers', () => {
      it('should set authorSlot0 for the first author seen', () => {
        const changes: ChangeNode[] = [{
          id: '1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 14 },
          contentRange: { start: 3, end: 11 },
          level: 0, anchored: false,
          metadata: { author: 'alice' }
        }];

        const result = buildSemanticTokens(changes, testText);
        const modifiers = result.data[4];
        // authorSlot0 bit is 1<<5 = 32
        assert.strictEqual(modifiers & 32, 32, 'authorSlot0 modifier bit should be set for first author');
        // authorSlot1 bit is 1<<6 = 64 — should not be set
        assert.strictEqual(modifiers & 64, 0, 'authorSlot1 should not be set for first author');
      });

      it('should set authorSlot1 for the second distinct author', () => {
        const changes: ChangeNode[] = [
          {
            id: '1',
            type: ChangeType.Insertion,
            status: ChangeStatus.Proposed,
            range: { start: 0, end: 10 },
            contentRange: { start: 3, end: 7 },
            level: 0, anchored: false,
            metadata: { author: 'alice' }
          },
          {
            id: '2',
            type: ChangeType.Deletion,
            status: ChangeStatus.Proposed,
            range: { start: 12, end: 22 },
            contentRange: { start: 15, end: 20 },
            level: 0, anchored: false,
            metadata: { author: 'bob' }
          }
        ];

        const result = buildSemanticTokens(changes, testText);
        const data = result.data;

        // First token (alice): authorSlot0 = bit 5 = 32
        assert.strictEqual(data[4] & 32, 32, 'alice should get authorSlot0');
        assert.strictEqual(data[4] & 64, 0, 'alice should not get authorSlot1');

        // Second token (bob): authorSlot1 = bit 6 = 64
        assert.strictEqual(data[9] & 64, 64, 'bob should get authorSlot1');
        assert.strictEqual(data[9] & 32, 0, 'bob should not get authorSlot0');
      });

      it('should set authorSlot2 for the third distinct author', () => {
        const changes: ChangeNode[] = [
          {
            id: '1',
            type: ChangeType.Insertion,
            status: ChangeStatus.Proposed,
            range: { start: 0, end: 6 },
            contentRange: { start: 0, end: 6 },
            level: 0, anchored: false,
            metadata: { author: 'alice' }
          },
          {
            id: '2',
            type: ChangeType.Insertion,
            status: ChangeStatus.Proposed,
            range: { start: 7, end: 13 },
            contentRange: { start: 7, end: 13 },
            level: 0, anchored: false,
            metadata: { author: 'bob' }
          },
          {
            id: '3',
            type: ChangeType.Insertion,
            status: ChangeStatus.Proposed,
            range: { start: 14, end: 18 },
            contentRange: { start: 14, end: 18 },
            level: 0, anchored: false,
            metadata: { author: 'carol' }
          }
        ];

        const result = buildSemanticTokens(changes, testText);
        const data = result.data;

        // Third token (carol): authorSlot2 = bit 7 = 128
        assert.strictEqual(data[14] & 128, 128, 'carol should get authorSlot2');
        assert.strictEqual(data[14] & 32, 0, 'carol should not get authorSlot0');
        assert.strictEqual(data[14] & 64, 0, 'carol should not get authorSlot1');
      });

      it('should recycle slots for a fourth author (mod 3)', () => {
        const changes: ChangeNode[] = [
          {
            id: '1',
            type: ChangeType.Insertion,
            status: ChangeStatus.Proposed,
            range: { start: 0, end: 6 },
            contentRange: { start: 0, end: 6 },
            level: 0, anchored: false,
            metadata: { author: 'alice' }
          },
          {
            id: '2',
            type: ChangeType.Insertion,
            status: ChangeStatus.Proposed,
            range: { start: 7, end: 13 },
            contentRange: { start: 7, end: 13 },
            level: 0, anchored: false,
            metadata: { author: 'bob' }
          },
          {
            id: '3',
            type: ChangeType.Insertion,
            status: ChangeStatus.Proposed,
            range: { start: 14, end: 18 },
            contentRange: { start: 14, end: 18 },
            level: 0, anchored: false,
            metadata: { author: 'carol' }
          },
          {
            id: '4',
            type: ChangeType.Insertion,
            status: ChangeStatus.Proposed,
            range: { start: 19, end: 23 },
            contentRange: { start: 19, end: 23 },
            level: 0, anchored: false,
            metadata: { author: 'dave' }  // slot index 3, 3%3=0 → authorSlot0
          }
        ];

        const result = buildSemanticTokens(changes, testText);
        const data = result.data;

        // Fourth token (dave): slot 3 % 3 = 0 → authorSlot0 = bit 5 = 32
        assert.strictEqual(data[19] & 32, 32, 'dave (4th author) should recycle to authorSlot0');
      });

      it('should not set any author slot when metadata has no author', () => {
        const changes: ChangeNode[] = [{
          id: '1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 14 },
          contentRange: { start: 3, end: 11 },
          level: 0, anchored: false,
          metadata: { comment: 'no author here' }
        }];

        const result = buildSemanticTokens(changes, testText);
        const modifiers = result.data[4];
        // No author slot bits (32, 64, 128) should be set
        assert.strictEqual(modifiers & (32 | 64 | 128), 0, 'no author slot should be set when author is absent');
      });
    });

    describe('combined modifiers', () => {
      it('should combine multiple modifier bits for a change with thread and author', () => {
        const changes: ChangeNode[] = [{
          id: '1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Accepted,
          range: { start: 0, end: 14 },
          contentRange: { start: 3, end: 11 },
          level: 0, anchored: false,
          metadata: {
            author: 'alice',
            discussion: [{
              author: 'bob',
              date: '2026-01-01',
              timestamp: { date: '2026-01-01', iso: '2026-01-01T00:00:00Z' },
              text: 'Looks good',
              depth: 0
            }]
          }
        }];

        const result = buildSemanticTokens(changes, testText);
        const modifiers = result.data[4];
        // modification(1) | accepted(8) | hasThread(16) | authorSlot0(32) = 57
        assert.strictEqual(modifiers & 1, 1, 'modification bit should be set');
        assert.strictEqual(modifiers & 8, 8, 'accepted bit should be set');
        assert.strictEqual(modifiers & 16, 16, 'hasThread bit should be set');
        assert.strictEqual(modifiers & 32, 32, 'authorSlot0 bit should be set');
      });
    });
  });
});
