import type { SandboxState, SceneId, TrackedChange, MockPaneState } from './types';

export type Action =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'jump-to-scene'; scene: SceneId }
  | { type: 'mock-claim-complete' }
  | { type: 'mock-agent-connected' }
  | { type: 'mock-edits-arrive'; changes: TrackedChange[] }
  | { type: 'review-change'; changeId: string; decision: 'accept' | 'reject' }
  | { type: 'enter-free-mode' }
  | { type: 'exit-free-mode' };

const SCENE_ORDER: SceneId[] = [
  'welcome',
  'claiming',
  'handoff',
  'paste-into-ai',
  'agent-connected',
  'edits-arriving',
  'reviewing',
  'done',
];

/**
 * Derive the pane state that should accompany a given scene.
 *
 * Welcome resets the pane completely (so Replay clears state). Mid-flow
 * scenes mirror "agent is in the room" once we've gotten past handoff.
 */
function paneForScene(scene: SceneId, current: MockPaneState): MockPaneState {
  if (scene === 'welcome') {
    return { welcomeState: 'default', feedItems: [], presence: { count: 0, agents: [] } };
  }
  if (scene === 'claiming') return { ...current, welcomeState: 'claiming' };
  if (scene === 'handoff') return { ...current, welcomeState: 'handoff' };
  // paste-into-ai | agent-connected | edits-arriving | reviewing | done
  return {
    ...current,
    welcomeState: undefined,
    presence: { count: 1, agents: ['ai:claude'] },
  };
}

export function createInitialState(): SandboxState {
  return {
    scene: 'welcome',
    doc: { lines: [], changes: [] },
    pane: { welcomeState: 'default', feedItems: [], presence: { count: 0, agents: [] } },
    aiChat: { visible: false, messages: [] },
    mode: 'guided',
    reviewedCount: 0,
  };
}

export function transition(state: SandboxState, action: Action): SandboxState {
  switch (action.type) {
    case 'next': {
      const i = SCENE_ORDER.indexOf(state.scene);
      const next = SCENE_ORDER[Math.min(i + 1, SCENE_ORDER.length - 1)];
      return { ...state, scene: next, pane: paneForScene(next, state.pane) };
    }
    case 'prev': {
      const i = SCENE_ORDER.indexOf(state.scene);
      return { ...state, scene: SCENE_ORDER[Math.max(i - 1, 0)] };
    }
    case 'jump-to-scene': {
      const scene = action.scene;
      // Jumping back to welcome resets doc + reviewedCount for a clean replay
      if (scene === 'welcome') {
        return {
          ...state,
          scene,
          pane: paneForScene(scene, state.pane),
          doc: { lines: [], changes: [] },
          reviewedCount: 0,
        };
      }
      return { ...state, scene, pane: paneForScene(scene, state.pane) };
    }
    case 'mock-claim-complete':
      return { ...state, scene: 'handoff', pane: paneForScene('handoff', state.pane) };
    case 'mock-agent-connected':
      return { ...state, scene: 'agent-connected', pane: paneForScene('agent-connected', state.pane) };
    case 'mock-edits-arrive':
      return {
        ...state,
        doc: { ...state.doc, changes: [...state.doc.changes, ...action.changes] },
        pane: {
          ...state.pane,
          feedItems: [...state.pane.feedItems, ...action.changes.map((c) => ({ changeId: c.id, ts: Date.now() }))],
        },
      };
    case 'review-change': {
      const updated = state.doc.changes.map((c) =>
        c.id === action.changeId
          ? { ...c, status: action.decision === 'accept' ? ('accepted' as const) : ('rejected' as const) }
          : c
      );
      return {
        ...state,
        doc: { ...state.doc, changes: updated },
        reviewedCount: state.reviewedCount + 1,
      };
    }
    case 'enter-free-mode':
      return { ...state, mode: 'free' };
    case 'exit-free-mode':
      return { ...state, mode: 'guided' };
    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return state;
    }
  }
}
