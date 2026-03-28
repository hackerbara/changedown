/**
 * ReviewPanel unit tests.
 *
 * Tests pure functions exported from review-panel.ts:
 *   - buildCardData     (data layer)
 *   - generateReviewHtml (HTML generation)
 *
 * NOTE: These tests are written for the Mocha/vscode-test runner.
 * The vscode module dependency in review-panel.ts does not affect
 * buildCardData or generateReviewHtml — both are pure functions.
 */

import * as assert from 'assert';
import { buildCardData, buildCardHtml, generateReviewHtml, ChangeCardData } from '../../review-panel';
import { ChangeNode, ChangeType } from '@changedown/core';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeChange(overrides: Partial<ChangeNode> = {}): ChangeNode {
    return {
        id: 'cn-1',
        type: ChangeType.Insertion,
        range: { start: 0, end: 20 },
        contentRange: { start: 3, end: 17 },
        originalText: '',
        modifiedText: 'hello world',
        status: 'proposed',
        metadata: undefined,
        inlineMetadata: undefined,
        ...overrides,
    } as ChangeNode;
}

function makeState(overrides: Partial<any> = {}): any {
    return {
        trackingEnabled: false,
        viewMode: 'review',
        changes: [],
        hasActiveMarkdownEditor: true,
        activeFilter: 'all',
        activeGrouping: 'flat',
        activeSorting: 'document-order',
        ...overrides,
    };
}

// ── buildCardData suite ──────────────────────────────────────────────────────

suite('ReviewPanel', () => {
    suite('buildCardData', () => {

        test('strips leading @ from discussion author to avoid @@', () => {
            const change = makeChange({
                metadata: {
                    author: '@ai:claude-opus-4.6',
                    date: '2026-03-15',
                    status: 'proposed',
                    discussion: [
                        { author: '@human:alice', date: '2026-03-15', text: 'Looks good', timestamp: { date: '2026-03-15', time: '' }, depth: 0 },
                    ],
                } as any,
            });
            const cards = buildCardData([change], 'hello world');
            assert.ok(!cards[0].discussionPreview[0].startsWith('@@'), 'Should not have double @@');
            assert.ok(cards[0].discussionPreview[0].startsWith('@human:alice'), 'Should start with single @');
        });

        test('strips leading @ from approval author', () => {
            const change = makeChange({
                metadata: {
                    author: '@ai:claude-opus-4.6',
                    date: '2026-03-15',
                    status: 'accepted',
                    approvals: [{ author: '@ai:claude-opus-4.6', date: '2026-03-15', timestamp: { date: '2026-03-15', time: '' } }],
                } as any,
            });
            const cards = buildCardData([change], 'hello world');
            assert.ok(!cards[0].approvalSummary.includes('@@'), 'Should not have double @@');
            assert.match(cards[0].approvalSummary, /Approved by @ai:claude-opus-4\.6/);
        });

        test('strips leading @ from card author', () => {
            const change = makeChange({
                metadata: {
                    author: '@ai:claude-opus-4.6',
                    date: '2026-03-15',
                    status: 'proposed',
                } as any,
            });
            const cards = buildCardData([change], 'hello world');
            assert.ok(!cards[0].author.startsWith('@@'), 'Should not have double @@');
            assert.strictEqual(cards[0].author, 'ai:claude-opus-4.6');
        });

        test('includes full discussion data in discussionFull', () => {
            const change = makeChange({
                metadata: {
                    author: 'human:alice',
                    date: '2026-03-15',
                    status: 'proposed',
                    discussion: [
                        { author: 'human:bob', date: '2026-03-15', text: 'First comment', timestamp: { date: '2026-03-15', time: '10:00' }, depth: 0 },
                        { author: 'human:alice', date: '2026-03-15', text: 'Reply to first', timestamp: { date: '2026-03-15', time: '10:05' }, depth: 1, label: 'suggestion' },
                        { author: 'human:bob', date: '2026-03-15', text: 'Third comment', timestamp: { date: '2026-03-15', time: '10:10' }, depth: 0 },
                        { author: 'human:carol', date: '2026-03-15', text: 'Fourth comment that is very long and should not be truncated in discussionFull', timestamp: { date: '2026-03-15', time: '10:15' }, depth: 0 },
                    ],
                } as any,
            });
            const cards = buildCardData([change], 'hello world');
            assert.strictEqual(cards[0].discussionFull.length, 4, 'Should include all 4 discussion entries');
            assert.strictEqual(cards[0].discussionFull[1].depth, 1, 'Should preserve depth');
            assert.strictEqual(cards[0].discussionFull[1].label, 'suggestion', 'Should preserve label');
            assert.strictEqual(cards[0].discussionFull[3].text, 'Fourth comment that is very long and should not be truncated in discussionFull', 'Should not truncate text');
            // discussionPreview is still limited to 3 entries
            assert.strictEqual(cards[0].discussionPreview.length, 3);
        });

    });

    // ── buildCardHtml suite ──────────────────────────────────────────────────

    suite('buildCardHtml', () => {
        test('collapsed card only shows accept and reject action buttons', () => {
            const card: ChangeCardData = {
                id: 'cn-1', type: 'INSERTION', text: 'hello', author: 'human:alice',
                status: 'proposed', colorClass: 'insertion', replyCount: 0,
                hasDiscussion: false, isResolved: false, hasRequestChanges: false,
                hasAmendments: false, isOwnChange: false, date: '', discussionPreview: [],
                approvalSummary: '', discussionFull: [],
                fullText: 'hello world',
            };
            const html = buildCardHtml(card);
            assert.ok(html.includes('data-action="acceptChange"'), 'Should have accept button');
            assert.ok(html.includes('data-action="rejectChange"'), 'Should have reject button');
            // card-actions div must NOT contain lifecycle buttons (they belong in thread section only)
            const cardActionsMatch = html.match(/<div class="card-actions">([\s\S]*?)<\/div>/);
            assert.ok(cardActionsMatch, 'Should have card-actions div');
            const cardActionsHtml = cardActionsMatch![1];
            assert.ok(!cardActionsHtml.includes('data-lifecycle='), 'card-actions must not contain lifecycle buttons');
            assert.ok(!html.includes('data-lifecycle="requestChanges"'), 'Should NOT have request-changes in card at all');
        });
    });

    // ── generateReviewHtml suite ─────────────────────────────────────────────

    suite('generateReviewHtml', () => {

        test('view mode buttons have descriptive tooltips', () => {
            const html = generateReviewHtml(makeState(), 'test-nonce');
            assert.ok(html.includes('title="Show all markup"'), 'All Markup button needs tooltip');
            assert.ok(html.includes('title="Hide delimiters"'), 'Simple button needs tooltip');
            assert.ok(html.includes('title="Show final document"'), 'Final button needs tooltip');
            assert.ok(html.includes('title="Show original document"'), 'Original button needs tooltip');
        });

        test('tracking toggle has tooltip', () => {
            const html = generateReviewHtml(makeState(), 'test-nonce');
            assert.ok(html.includes('title="Toggle change tracking on/off"'));
        });

        test('bulk action buttons have tooltips', () => {
            const html = generateReviewHtml(makeState(), 'test-nonce');
            assert.ok(html.includes('title="Accept all changes in document"'));
            assert.ok(html.includes('title="Reject all changes in document"'));
        });

    });
});
