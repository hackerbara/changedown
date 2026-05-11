import { For } from 'solid-js';
import { USER_SCENE_INDEX, type SceneId } from '../state/types';

interface Props { scene: SceneId; onJump: (s: SceneId) => void; }

/**
 * 7-dot scene scrubber. claiming + handoff share Scene 2 — the
 * scrubber uses one representative SceneId per user scene (so jumping
 * to Scene 2 always lands on 'claiming', which is the entry-point).
 */
const REPRESENTATIVES: SceneId[] = [
  'welcome',
  'claiming',
  'paste-into-ai',
  'agent-connected',
  'edits-arriving',
  'reviewing',
  'done',
];

export function SceneScrubber(props: Props) {
  const userScene = () => USER_SCENE_INDEX[props.scene];
  return (
    <div class="scene-scrubber" role="group" aria-label="Sandbox scene navigation">
      <For each={REPRESENTATIVES}>
        {(id, i) => (
          <button
            type="button"
            class={`scene-dot ${userScene() === i() + 1 ? 'active' : ''}`}
            onClick={() => props.onJump(id)}
            aria-label={`Jump to scene ${i() + 1} of 7`}
            aria-current={userScene() === i() + 1 ? 'step' : undefined}
          />
        )}
      </For>
    </div>
  );
}
