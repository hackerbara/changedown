export type SceneId =
  | 'welcome'
  | 'claiming'
  | 'handoff'
  | 'paste-into-ai'
  | 'agent-connected'
  | 'edits-arriving'
  | 'reviewing'
  | 'done';

/**
 * Map of 8 internal states → 7 user-facing scene numbers.
 * `claiming` + `handoff` both present as Scene 2 ("Claim a room").
 */
export const USER_SCENE_INDEX: Record<SceneId, number> = {
  welcome: 1,
  claiming: 2,
  handoff: 2,
  'paste-into-ai': 3,
  'agent-connected': 4,
  'edits-arriving': 5,
  reviewing: 6,
  done: 7,
};

export interface DocLine {
  text: string;
}

export interface TrackedChange {
  id: string;
  kind: 'ins' | 'del' | 'sub';
  author: string;
  spanIndex: number;
  startChar: number;
  endChar: number;
  replacement?: string;
  reasoning?: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface MockDoc {
  lines: DocLine[];
  changes: TrackedChange[];
}

export interface MockPaneState {
  welcomeState?: 'default' | 'claiming' | 'handoff';
  feedItems: { changeId: string; ts: number }[];
  presence: { count: number; agents: string[] };
}

export interface MockAIChatState {
  visible: boolean;
  messages: { role: 'user' | 'ai'; text: string }[];
}

export type SandboxMode = 'guided' | 'free';

export interface SandboxState {
  scene: SceneId;
  doc: MockDoc;
  pane: MockPaneState;
  aiChat: MockAIChatState;
  mode: SandboxMode;
  reviewedCount: number;
}
