import { describe, it, expect } from 'vitest';
import { ChangeStatus, ChangeType, CriticMarkupParser, type ChangeNode } from '@changedown/core';
import { buildDecorationPlan } from '@changedown/core/host';
import { makeView } from '../helpers/view-test-utils.js';

const parser = new CriticMarkupParser();

type LegacyMode = 'working' | 'simple' | 'decided' | 'original';

function planFor(text: string, mode: LegacyMode = 'working', cursorOffset = 0, showDelimiters = false) {
    const doc = parser.parse(text);
    const view = makeView(mode, { display: { delimiters: showDelimiters ? 'show' : 'hide' } });
    return buildDecorationPlan(doc.getChanges(), text, view, cursorOffset);
}

describe('buildDecorationPlan', () => {
    describe('insertions', () => {
        it('marks insertion in working mode', () => {
            const text = 'Hello {++world++}!';
            const plan = planFor(text);
            expect(plan.insertions.length).toBe(1);
            expect(plan.insertions[0].range.start).toBe(6 + 3); // after {++
            expect(plan.insertions[0].range.end).toBe(6 + 3 + 5); // before ++}
        });

        it('hides delimiters in working mode', () => {
            const text = 'Hello {++world++}!';
            const plan = planFor(text);
            // Opening {++ and closing ++} should be hidden
            expect(plan.hiddens.length).toBe(2);
        });

        it('shows full range with delimiters in showDelimiters+working mode', () => {
            const text = 'Hello {++world++}!';
            const plan = planFor(text, 'working', 0, true);
            expect(plan.insertions.length).toBe(1);
            expect(plan.insertions[0].range.start).toBe(6); // full range includes {++
            expect(plan.hiddens.length).toBe(0); // no hiding
        });

        it('hides entire insertion in original mode', () => {
            const text = 'Hello {++world++}!';
            const plan = planFor(text, 'original');
            expect(plan.insertions.length).toBe(0);
            expect(plan.hiddens.length).toBe(1);
            expect(plan.hiddens[0].range.start).toBe(6);
            expect(plan.hiddens[0].range.end).toBe(17);
        });

        it('shows insertion content in settled (decided) mode with hidden delimiters', () => {
            const text = 'Hello {++world++}!';
            const plan = planFor(text, 'decided');
            // Settled shows content, hides delimiters
            expect(plan.insertions.length).toBe(0);
            expect(plan.hiddens.length).toBe(2);
        });
    });

    describe('deletions', () => {
        it('marks deletion in working mode', () => {
            const text = 'Hello {--world--}!';
            const plan = planFor(text);
            expect(plan.deletions.length).toBe(1);
        });

        it('hides entire deletion in settled (decided) mode', () => {
            const text = 'Hello {--world--}!';
            const plan = planFor(text, 'decided');
            expect(plan.deletions.length).toBe(0);
            expect(plan.hiddens.length).toBe(1);
            expect(plan.hiddens[0].range.start).toBe(6);
            expect(plan.hiddens[0].range.end).toBe(17); // {--world--} = 11 chars
        });

        it('shows deletion content in original mode with hidden delimiters', () => {
            const text = 'Hello {--world--}!';
            const plan = planFor(text, 'original');
            expect(plan.deletions.length).toBe(0);
            expect(plan.hiddens.length).toBe(2); // opening + closing delimiters
        });
    });

    describe('substitutions', () => {
        it('marks both halves in working mode', () => {
            const text = 'Hello {~~old~>new~~}!';
            const plan = planFor(text);
            expect(plan.substitutionOriginals.length).toBe(1);
            expect(plan.substitutionModifieds.length).toBe(1);
        });
    });

    describe('highlights', () => {
        it('marks highlight in working mode', () => {
            const text = 'Hello {==world==}!';
            const plan = planFor(text);
            expect(plan.highlights.length).toBe(1);
        });
    });

    describe('comments', () => {
        it('hides comments in working mode and shows icon', () => {
            const text = 'Hello {>>a comment<<}!';
            const plan = planFor(text);
            expect(plan.hiddens.length).toBe(1);
            expect(plan.commentIcons.length).toBe(1);
        });

        it('shows comment in showDelimiters+working mode', () => {
            const text = 'Hello {>>a comment<<}!';
            const plan = planFor(text, 'working', 0, true);
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
            const plan = planFor(text, 'working', 10);
            expect(plan.activeHighlights.length).toBe(1);
        });

        it('no active highlight when cursor is outside all changes', () => {
            const text = 'Hello {++world++}!';
            // Cursor at offset 0 = before the change
            const plan = planFor(text, 'working', 0);
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
            const plan = buildDecorationPlan(changes, text, makeView('working', { display: { authorColors: 'always', delimiters: 'hide' } }), 0);
            // Should be in author decorations, not default insertions
            expect(plan.insertions.length).toBe(0);
            expect(plan.authorDecorations.size).toBe(1);
            const entry = plan.authorDecorations.get('Alice:insertion');
            expect(entry).toBeDefined();
            expect(entry!.ranges.length).toBe(1);
        });
    });
});

describe('L3 ghost text delimiters', () => {
    it('createEmptyPlan includes ghostDelimiters and ghostRefs arrays', () => {
        const { createEmptyPlan } = require('@changedown/core/host');
        const plan = createEmptyPlan();
        expect(plan.ghostDelimiters).toEqual([]);
        expect(plan.ghostRefs).toEqual([]);
    });

    it('shows whole range (including delimiters) styled when showDelimiters=true in full-inline working mode', () => {
        // In working mode with showDelimiters=true and full inline mode, the whole range is
        // decorated (delimiters included) — no hiddens, no ghost delimiters.
        const text = 'Hello {++world++}!';
        const plan = planFor(text, 'working', 0, true);
        expect(plan.ghostDelimiters.length).toBe(0);
        expect(plan.insertions.length).toBeGreaterThan(0);
    });

    it('does not populate ghostDelimiters when showDelimiters is false', () => {
        const text = 'Hello {++world++}!';
        const plan = planFor(text, 'working', 0, false);
        expect(plan.ghostDelimiters.length).toBe(0);
    });

    it('does not populate ghostRefs for inline CriticMarkup changes (footnoteRefStart is undefined)', () => {
        // CriticMarkup-parsed {++world++} has no footnoteRefStart, but ghost refs are only injected
        // when footnoteRefStart === undefined AND the change has no inline delimiters.
        // {++world++} has inline delimiters, so ghostRefs stays empty.
        const text = 'Hello {++world++}!';
        const plan = planFor(text, 'working', 0, false);
        expect(plan.ghostRefs.length).toBe(0);
    });

    it('does not populate ghostRefs in decided mode', () => {
        const text = 'Hello {++world++}!';
        const plan = planFor(text, 'decided', 0, false);
        expect(plan.ghostRefs.length).toBe(0);
    });

    it('does not populate ghostRefs in raw mode', () => {
        const text = 'Hello {++world++}!';
        const plan = planFor(text, 'raw', 0, false);
        expect(plan.ghostRefs.length).toBe(0);
    });

    it('places L3 deletion ghost refs at the deletion seam, not the end of contextual span', () => {
        const text = 'alpha omega';
        const change: ChangeNode = {
            id: 'cn-1',
            type: ChangeType.Deletion,
            status: ChangeStatus.Proposed,
            range: { start: 0, end: text.length },
            contentRange: { start: 0, end: text.length },
            level: 2,
            anchored: true,
            resolved: true,
            originalText: ' middle',
            deletionSeamOffset: 'alpha '.length,
        };

        const plan = buildDecorationPlan(
            [change],
            text,
            makeView('working', { display: { delimiters: 'hide' } }),
            0,
        );

        expect(plan.ghostDeletions[0].range).toEqual({
            start: 'alpha '.length,
            end: 'alpha '.length,
        });
        expect(plan.ghostRefs[0].range).toEqual({
            start: 'alpha '.length,
            end: 'alpha '.length,
        });
    });
});
