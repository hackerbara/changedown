import { describe, it, expect } from 'vitest';
import { createInitialState, transition } from './machine';
import type { SceneId, TrackedChange } from './types';

describe('sandbox state machine', () => {
  it('starts in welcome with empty doc, guided mode, reviewedCount=0', () => {
    const s = createInitialState();
    expect(s.scene).toBe('welcome');
    expect(s.mode).toBe('guided');
    expect(s.reviewedCount).toBe(0);
    expect(s.doc.changes.length).toBe(0);
  });

  it('welcome -> claiming on next', () => {
    const s = transition(createInitialState(), { type: 'next' });
    expect(s.scene).toBe('claiming');
    expect(s.pane.welcomeState).toBe('claiming');
  });

  it('mock-claim-complete sets handoff scene and pane state', () => {
    const s1 = transition(createInitialState(), { type: 'next' });
    const s2 = transition(s1, { type: 'mock-claim-complete' });
    expect(s2.scene).toBe('handoff');
    expect(s2.pane.welcomeState).toBe('handoff');
  });

  it('mock-edits-arrive populates doc.changes from canonical scenario', () => {
    let s = createInitialState();
    s = { ...s, scene: 'edits-arriving' };
    const newChanges: TrackedChange[] = [
      {
        id: 'ch1',
        kind: 'ins',
        author: 'ai:claude',
        spanIndex: 0,
        startChar: 12,
        endChar: 12,
        replacement: 'most importantly, ',
        status: 'pending',
      },
    ];
    const s2 = transition(s, { type: 'mock-edits-arrive', changes: newChanges });
    expect(s2.doc.changes).toHaveLength(1);
    expect(s2.doc.changes[0].id).toBe('ch1');
    // Side effect: pane feed mirrors the change
    expect(s2.pane.feedItems).toHaveLength(1);
    expect(s2.pane.feedItems[0].changeId).toBe('ch1');
  });

  it('review-change marks change accepted and increments reviewedCount', () => {
    let s = createInitialState();
    s = {
      ...s,
      doc: {
        ...s.doc,
        changes: [
          { id: 'ch1', kind: 'ins', author: 'ai:claude', spanIndex: 0, startChar: 0, endChar: 0, status: 'pending' },
        ],
      },
    };
    const s2 = transition(s, { type: 'review-change', changeId: 'ch1', decision: 'accept' });
    expect(s2.doc.changes[0].status).toBe('accepted');
    expect(s2.reviewedCount).toBe(1);
  });

  it('review-change rejected marks change rejected', () => {
    let s = createInitialState();
    s = {
      ...s,
      doc: {
        ...s.doc,
        changes: [
          { id: 'ch1', kind: 'ins', author: 'ai:claude', spanIndex: 0, startChar: 0, endChar: 0, status: 'pending' },
        ],
      },
    };
    const s2 = transition(s, { type: 'review-change', changeId: 'ch1', decision: 'reject' });
    expect(s2.doc.changes[0].status).toBe('rejected');
    expect(s2.reviewedCount).toBe(1);
  });

  it('enter-free-mode and exit-free-mode toggle mode', () => {
    let s = createInitialState();
    s = transition(s, { type: 'enter-free-mode' });
    expect(s.mode).toBe('free');
    s = transition(s, { type: 'exit-free-mode' });
    expect(s.mode).toBe('guided');
  });

  it('full happy path with proper transitions covers all 8 scenes', () => {
    let s = createInitialState();
    const expectedPath: SceneId[] = [
      'welcome',
      'claiming',
      'handoff',
      'paste-into-ai',
      'agent-connected',
      'edits-arriving',
      'reviewing',
      'done',
    ];
    for (const expected of expectedPath) {
      expect(s.scene).toBe(expected);
      s = transition(s, { type: 'next' });
    }
    // Already at 'done'; another 'next' should stay there (terminal)
    expect(s.scene).toBe('done');
  });

  it('jump-to-scene sets the scene directly', () => {
    const s = transition(createInitialState(), { type: 'jump-to-scene', scene: 'reviewing' });
    expect(s.scene).toBe('reviewing');
  });

  it('prev steps backward; clamps at welcome', () => {
    let s = transition(createInitialState(), { type: 'jump-to-scene', scene: 'paste-into-ai' });
    s = transition(s, { type: 'prev' });
    expect(s.scene).toBe('handoff');
    // Clamping
    s = transition(s, { type: 'jump-to-scene', scene: 'welcome' });
    s = transition(s, { type: 'prev' });
    expect(s.scene).toBe('welcome');
  });

  it('mock-agent-connected sets agent-connected scene with presence + clears welcomeState', () => {
    let s = createInitialState();
    // Start from paste-into-ai so the dispatch is meaningful
    s = transition(s, { type: 'jump-to-scene', scene: 'paste-into-ai' });
    const s2 = transition(s, { type: 'mock-agent-connected' });
    expect(s2.scene).toBe('agent-connected');
    expect(s2.pane.welcomeState).toBeUndefined();
    expect(s2.pane.presence.count).toBe(1);
    expect(s2.pane.presence.agents).toEqual(['ai:claude']);
  });
});
