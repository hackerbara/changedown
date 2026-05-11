import { Show, createSignal, createEffect, onCleanup } from 'solid-js';
import type { SceneId } from '../state/types';

interface Props { scene: SceneId; }

/**
 * Floating affordance shown in Scene 3 (paste-into-ai).
 * Visualizes the off-pane step where the user pastes agent
 * instructions into Claude/GPT/etc. Auto-types the AI response.
 */
export function MockAIChat(props: Props) {
  const [typedChars, setTypedChars] = createSignal(0);
  const aiMessage = 'Reading your document…';

  createEffect(() => {
    if (props.scene === 'paste-into-ai') {
      setTypedChars(0);
      const id = setInterval(() => {
        setTypedChars((c) => Math.min(c + 1, aiMessage.length));
      }, 60);
      onCleanup(() => clearInterval(id));
    }
  });

  return (
    <Show when={props.scene === 'paste-into-ai'}>
      <aside class="mock-ai-chat" role="dialog" aria-label="Mock AI agent receiving instructions">
        <header>
          <span class="chat-name">Claude</span>
          <span class="chat-time">now</span>
        </header>
        <div class="messages">
          <div class="msg user">
            <code>cdr2.public-3.token Read this Word doc and propose 3 tracked-change edits…</code>
          </div>
          <div class="msg ai">
            {aiMessage.slice(0, typedChars())}
            <span class="cursor" aria-hidden="true">▏</span>
          </div>
        </div>
      </aside>
    </Show>
  );
}
