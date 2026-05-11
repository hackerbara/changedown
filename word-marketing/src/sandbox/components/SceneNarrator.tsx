import { Show, createResource } from 'solid-js';
import type { SceneId } from '../state/types';
import { loadCanonicalScenario } from '../content/load-scenario';

interface Props { scene: SceneId; onNext: () => void; }

export function SceneNarrator(props: Props) {
  const [scenario] = createResource(loadCanonicalScenario);
  return (
    <div class="scene-narrator" role="status">
      <Show when={scenario()}>
        <p class="narration">{scenario()!.narration[props.scene]}</p>
      </Show>
      <Show when={props.scene !== 'done'}>
        <button
          type="button"
          class="continue"
          onClick={props.onNext}
        >
          Continue ↓
        </button>
      </Show>
    </div>
  );
}
