import { Show } from 'solid-js';
import type { SandboxMode } from '../state/types';

interface Props {
  mode: SandboxMode;
  onEnter: () => void;
  onExit: () => void;
}

export function EscapeHatch(props: Props) {
  return (
    <Show
      when={props.mode === 'guided'}
      fallback={
        <div class="escape-banner" role="status">
          <span>Exploring freely. </span>
          <button type="button" onClick={props.onExit}>Back to guided</button>
        </div>
      }
    >
      <button
        type="button"
        class="escape-link"
        onClick={props.onEnter}
        aria-label="Switch to free exploration mode"
      >
        Explore freely →
      </button>
    </Show>
  );
}
