import { describe, it, expect } from 'vitest';
import { getSemanticTokensLegend, buildSemanticTokens } from '@changetracks/lsp-server/internals';
import type { SemanticTokensLegend } from '@changetracks/lsp-server/internals';
import { ChangeType, ChangeNode, ChangeStatus } from '@changetracks/core';

describe('Semantic Tokens', () => {
  describe('getSemanticTokensLegend', () => {
    it('should return token types for CriticMarkup', () => {
      const legend = getSemanticTokensLegend();
      expect(legend).toBeTruthy();
      expect(Array.isArray(legend.tokenTypes)).toBeTruthy();
      expect(Array.isArray(legend.tokenModifiers)).toBeTruthy();

      // Verify expected token types (custom types to avoid theme color override)
      expect(legend.tokenTypes.includes('changetracks-insertion')).toBeTruthy();
      expect(legend.tokenTypes.includes('changetracks-deletion')).toBeTruthy();
      expect(legend.tokenTypes.includes('changetracks-highlight')).toBeTruthy();

      // Verify expected modifiers
      expect(legend.tokenModifiers.includes('modification')).toBeTruthy();
      expect(legend.tokenModifiers.includes('deprecated')).toBeTruthy();
    });

    it('should have consistent order for token types', () => {
      const legend = getSemanticTokensLegend();
      const expectedTokenTypes = [
          'changetracks-insertion', 'changetracks-deletion', 'changetracks-highlight',
          'changetracks-comment', 'changetracks-subOriginal', 'changetracks-subModified',
          'changetracks-moveFrom', 'changetracks-moveTo'
      ];
      expect(legend.tokenTypes).toStrictEqual(expectedTokenTypes);
    });

    it('should have consistent order for token modifiers', () => {
      const legend = getSemanticTokensLegend();
      const expectedModifiers = [
          'modification', 'deprecated', 'proposed', 'accepted',
          'hasThread', 'authorSlot0', 'authorSlot1', 'authorSlot2'
      ];
      expect(legend.tokenModifiers).toStrictEqual(expectedModifiers);
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
        expect(result).toBeTruthy();
        expect(Array.isArray(result.data)).toBeTruthy();

        // LSP format: [deltaLine, deltaStartChar, length, tokenType, tokenModifiers]
        // For insertion with Proposed status:
        //   tokenType=0 (changetracks-insertion)
        //   tokenModifiers = modification(1) | proposed(4) = 5
        const data = result.data;
        expect(data).toHaveLength(5);
        expect(data[0]).toBe(0); // deltaLine (first token, line 0)
        expect(data[1]).toBe(3); // deltaStartChar (start at char 3)
        expect(data[2]).toBe(8); // length (11-3=8)
        expect(data[3]).toBe(0); // tokenType (changetracks-insertion=0)
        expect(data[4]).toBe(5); // tokenModifiers (modification=1 | proposed=4 = 5)
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
        expect(result.data).toHaveLength(0);
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
        expect(result).toBeTruthy();

        // For deletion with Proposed status:
        //   tokenType=1 (changetracks-deletion)
        //   tokenModifiers = deprecated(2) | proposed(4) = 6
        const data = result.data;
        expect(data).toHaveLength(5);
        expect(data[3]).toBe(1); // tokenType (changetracks-deletion=1)
        expect(data[4]).toBe(6); // tokenModifiers (deprecated=2 | proposed=4 = 6)
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
        expect(result).toBeTruthy();

        // Should have tokens for both original (subOriginal+deprecated) and modified (subModified+modification)
        const data = result.data;
        expect(data).toHaveLength(10); // 2 tokens × 5 integers each

        // First token: original (changetracks-subOriginal + deprecated + proposed)
        //   tokenModifiers = deprecated(2) | proposed(4) = 6
        expect(data[3]).toBe(4); // tokenType (changetracks-subOriginal=4)
        expect(data[4]).toBe(6); // tokenModifiers (deprecated=2 | proposed=4 = 6)

        // Second token: modified (changetracks-subModified + modification + proposed)
        //   tokenModifiers = modification(1) | proposed(4) = 5
        expect(data[8]).toBe(5); // tokenType (changetracks-subModified=5)
        expect(data[9]).toBe(5); // tokenModifiers (modification=1 | proposed=4 = 5)
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
        expect(result).toBeTruthy();
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
        expect(result).toBeTruthy();

        // For highlight with Proposed status:
        //   tokenType=2 (changetracks-highlight)
        //   tokenModifiers = proposed(4)
        const data = result.data;
        expect(data).toHaveLength(5);
        expect(data[3]).toBe(2); // tokenType (changetracks-highlight=2)
        expect(data[4]).toBe(4); // tokenModifiers (proposed=4)
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
        expect(result).toBeTruthy();

        // For comment with Proposed status:
        //   tokenType=3 (changetracks-comment)
        //   tokenModifiers = proposed(4)
        const data = result.data;
        expect(data).toHaveLength(5);
        expect(data[3]).toBe(3); // tokenType (changetracks-comment=3)
        expect(data[4]).toBe(4); // tokenModifiers (proposed=4)
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
        expect(result).toBeTruthy();

        // Should have 2 tokens × 5 integers
        const data = result.data;
        expect(data).toHaveLength(10);

        // First token: insertion with proposed status
        //   tokenModifiers = modification(1) | proposed(4) = 5
        expect(data[0]).toBe(0); // deltaLine
        expect(data[1]).toBe(3); // deltaStartChar
        expect(data[3]).toBe(0); // tokenType (changetracks-insertion)
        expect(data[4]).toBe(5); // tokenModifiers (modification=1 | proposed=4 = 5)

        // Second token: deletion (delta from first token) with proposed status
        //   tokenModifiers = deprecated(2) | proposed(4) = 6
        // deltaLine should still be 0 (same line)
        // deltaStartChar should be relative to previous token
        expect(data[5]).toBe(0); // deltaLine
        expect(data[8]).toBe(1); // tokenType (changetracks-deletion)
        expect(data[9]).toBe(6); // tokenModifiers (deprecated=2 | proposed=4 = 6)
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
        expect(result.data.length >= 10).toBeTruthy();
      });
    });

    describe('empty input', () => {
      it('should return empty tokens for empty changes array', () => {
        const result = buildSemanticTokens([], testText);
        expect(result).toBeTruthy();
        expect(result.data).toHaveLength(0);
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
        expect(result).toBeTruthy();
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
        expect(data[0]).toBe(0); // deltaLine (line 0)
        expect(data[1]).toBe(3); // deltaStartChar (char 3)

        // Second token: delta from first
        expect(data[5]).toBe(0); // deltaLine (still line 0)
        // deltaStartChar should be relative: (13 - 3) = 10
        expect(data[6]).toBe(10); // deltaStartChar (relative to previous)
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
        expect(modifiers).toBe(5);
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
        expect(data).toHaveLength(5);
        expect(data[3]).toBe(7); // tokenType (changetracks-moveTo=7)
        // modification(1) | proposed(4) = 5
        expect(data[4]).toBe(5);
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
        expect(data).toHaveLength(5);
        expect(data[3]).toBe(6); // tokenType (changetracks-moveFrom=6)
        // deprecated(2) | proposed(4) = 6
        expect(data[4]).toBe(6);
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
        expect(data[3]).toBe(0); // tokenType (changetracks-insertion=0)
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
        expect(data[3]).toBe(1); // tokenType (changetracks-deletion=1)
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
        expect(modifiers & 4).toBe(4);
        // accepted bit is 1<<3 = 8
        expect(modifiers & 8).toBe(0);
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
        expect(modifiers & 8).toBe(8);
        // proposed bit is 1<<2 = 4
        expect(modifiers & 4).toBe(0);
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
        expect(modifiers & 4).toBe(4);
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
        expect(modifiers & 8).toBe(8);
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
        expect(modifiers & 16).toBe(16);
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
        expect(modifiers & 16).toBe(0);
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
        expect(modifiers & 16).toBe(0);
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
        expect(modifiers & 32).toBe(32);
        // authorSlot1 bit is 1<<6 = 64 — should not be set
        expect(modifiers & 64).toBe(0);
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
        expect(data[4] & 32).toBe(32);
        expect(data[4] & 64).toBe(0);

        // Second token (bob): authorSlot1 = bit 6 = 64
        expect(data[9] & 64).toBe(64);
        expect(data[9] & 32).toBe(0);
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
        expect(data[14] & 128).toBe(128);
        expect(data[14] & 32).toBe(0);
        expect(data[14] & 64).toBe(0);
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
        expect(data[19] & 32).toBe(32);
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
        expect(modifiers & (32 | 64 | 128)).toBe(0);
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
        expect(modifiers & 1).toBe(1);
        expect(modifiers & 8).toBe(8);
        expect(modifiers & 16).toBe(16);
        expect(modifiers & 32).toBe(32);
      });
    });

    describe('consumed op modifier', () => {
      it('should apply deprecated modifier to consumed op tokens', () => {
        const changes: ChangeNode[] = [{
          id: 'ct-3',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 14 },
          contentRange: { start: 3, end: 11 },
          level: 2, anchored: false,
          consumedBy: 'ct-5',
        }];

        const result = buildSemanticTokens(changes, testText, 'review');
        expect(result.data.length).toBeGreaterThan(0);
        // deprecated is bit 1 (value 2) in TOKEN_MODIFIERS
        const modifierBits = result.data[4]; // 5th element is modifiers
        expect(modifierBits & 2).toBe(2); // deprecated bit set
      });

      it('should apply deprecated modifier to consumed deletion tokens', () => {
        const changes: ChangeNode[] = [{
          id: 'ct-4',
          type: ChangeType.Deletion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 14 },
          contentRange: { start: 3, end: 11 },
          level: 2, anchored: false,
          consumedBy: 'ct-6',
        }];

        const result = buildSemanticTokens(changes, testText, 'review');
        expect(result.data.length).toBeGreaterThan(0);
        const modifierBits = result.data[4];
        // Deletion already has deprecated(2); consumedBy should also set it (idempotent)
        expect(modifierBits & 2).toBe(2);
      });

      it('should not apply deprecated modifier when consumedBy is absent', () => {
        const changes: ChangeNode[] = [{
          id: 'ct-7',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 14 },
          contentRange: { start: 3, end: 11 },
          level: 0, anchored: false,
        }];

        const result = buildSemanticTokens(changes, testText, 'review');
        expect(result.data.length).toBeGreaterThan(0);
        const modifierBits = result.data[4];
        // modification(1) | proposed(4) = 5, no deprecated bit
        expect(modifierBits & 2).toBe(0);
      });
    });
  });
});
