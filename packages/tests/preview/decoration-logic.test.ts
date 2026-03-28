import { describe, it, expect } from 'vitest';
import { buildDecorationPlan } from '@changedown/preview';
import { CriticMarkupParser } from '@changedown/core';

const parser = new CriticMarkupParser();

function planFor(text: string, mode: 'review' | 'changes' | 'settled' | 'raw' = 'review', cursorOffset = 0, showDelimiters = false) {
    const doc = parser.parse(text);
    return buildDecorationPlan(doc.getChanges(), text, mode, cursorOffset, showDelimiters, 'never');
}

describe('buildDecorationPlan', () => {
    describe('insertions', () => {
        it('marks insertion in review mode', () => {
            const text = 'Hello {++world++}!';
            const plan = planFor(text);
            expect(plan.insertions.length).toBe(1);
            expect(plan.insertions[0].range.start).toBe(6 + 3); // after {++
            expect(plan.insertions[0].range.end).toBe(6 + 3 + 5); // before ++}
        });

        it('hides delimiters in review mode', () => {
            const text = 'Hello {++world++}!';
            const plan = planFor(text);
            // Opening {++ and closing ++} should be hidden
            expect(plan.hiddens.length).toBe(2);
        });

        it('shows full range with delimiters in showDelimiters+review mode', () => {
            const text = 'Hello {++world++}!';
            const plan = planFor(text, 'review', 0, true);
            expect(plan.insertions.length).toBe(1);
            expect(plan.insertions[0].range.start).toBe(6); // full range includes {++
            expect(plan.hiddens.length).toBe(0); // no hiding
        });

        it('hides entire insertion in raw (original) mode', () => {
            const text = 'Hello {++world++}!';
            const plan = planFor(text, 'raw');
            expect(plan.insertions.length).toBe(0);
            expect(plan.hiddens.length).toBe(1);
            expect(plan.hiddens[0].range.start).toBe(6);
            expect(plan.hiddens[0].range.end).toBe(17);
        });

        it('shows insertion content in settled (final) mode with hidden delimiters', () => {
            const text = 'Hello {++world++}!';
            const plan = planFor(text, 'settled');
            // Settled shows content, hides delimiters
            expect(plan.insertions.length).toBe(0);
            expect(plan.hiddens.length).toBe(2);
        });
    });

    describe('deletions', () => {
        it('marks deletion in review mode', () => {
            const text = 'Hello {--world--}!';
            const plan = planFor(text);
            expect(plan.deletions.length).toBe(1);
        });

        it('hides entire deletion in settled (final) mode', () => {
            const text = 'Hello {--world--}!';
            const plan = planFor(text, 'settled');
            expect(plan.deletions.length).toBe(0);
            expect(plan.hiddens.length).toBe(1);
            expect(plan.hiddens[0].range.start).toBe(6);
            expect(plan.hiddens[0].range.end).toBe(17); // {--world--} = 11 chars
        });

        it('shows deletion content in raw (original) mode with hidden delimiters', () => {
            const text = 'Hello {--world--}!';
            const plan = planFor(text, 'raw');
            expect(plan.deletions.length).toBe(0);
            expect(plan.hiddens.length).toBe(2); // opening + closing delimiters
        });
    });

    describe('substitutions', () => {
        it('marks both halves in review mode', () => {
            const text = 'Hello {~~old~>new~~}!';
            const plan = planFor(text);
            expect(plan.substitutionOriginals.length).toBe(1);
            expect(plan.substitutionModifieds.length).toBe(1);
        });
    });

    describe('highlights', () => {
        it('marks highlight in review mode', () => {
            const text = 'Hello {==world==}!';
            const plan = planFor(text);
            expect(plan.highlights.length).toBe(1);
        });
    });

    describe('comments', () => {
        it('hides comments in review mode and shows icon', () => {
            const text = 'Hello {>>a comment<<}!';
            const plan = planFor(text);
            expect(plan.hiddens.length).toBe(1);
            expect(plan.commentIcons.length).toBe(1);
        });

        it('shows comment in showDelimiters+review mode', () => {
            const text = 'Hello {>>a comment<<}!';
            const plan = planFor(text, 'review', 0, true);
            expect(plan.comments.length).toBe(1);
            expect(plan.hiddens.length).toBe(0);
        });
    });

    describe('empty document', () => {
        it('returns empty plan for no changes', () => {
            const text = 'Hello world!';
            const plan = planFor(text);
            expect(plan.insertions.length).toBe(0);
            expect(plan.deletions.length).toBe(0);
            expect(plan.hiddens.length).toBe(0);
        });
    });

    describe('cursor interaction', () => {
        it('adds active highlight when cursor is inside a change', () => {
            const text = 'Hello {++world++}!';
            // Cursor at offset 10 = inside "world"
            const plan = planFor(text, 'review', 10);
            expect(plan.activeHighlights.length).toBe(1);
        });

        it('no active highlight when cursor is outside all changes', () => {
            const text = 'Hello {++world++}!';
            // Cursor at offset 0 = before the change
            const plan = planFor(text, 'review', 0);
            expect(plan.activeHighlights.length).toBe(0);
        });
    });

    describe('hiddenOffsets', () => {
        it('mirrors hiddens array as offset ranges', () => {
            const text = 'Hello {++world++}!';
            const plan = planFor(text);
            expect(plan.hiddenOffsets.length).toBe(plan.hiddens.length);
            for (let i = 0; i < plan.hiddens.length; i++) {
                expect(plan.hiddenOffsets[i].start).toBe(plan.hiddens[i].range.start);
                expect(plan.hiddenOffsets[i].end).toBe(plan.hiddens[i].range.end);
            }
        });
    });

    describe('author colors', () => {
        it('groups decorations by author when authorColorMode=always', () => {
            const text = 'Hello {++world++}!';
            const doc = parser.parse(text);
            const changes = doc.getChanges();
            // Manually set author metadata
            if (changes[0]) {
                changes[0].metadata = { author: 'Alice' };
            }
            const plan = buildDecorationPlan(changes, text, 'review', 0, false, 'always');
            // Should be in author decorations, not default insertions
            expect(plan.insertions.length).toBe(0);
            expect(plan.authorDecorations.size).toBe(1);
            const entry = plan.authorDecorations.get('Alice:insertion');
            expect(entry).toBeDefined();
            expect(entry!.ranges.length).toBe(1);
        });
    });
});
