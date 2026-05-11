import { Show, For } from 'solid-js';
import type { SandboxState } from '../state/types';
import type { Action } from '../state/machine';

interface Props {
  state: SandboxState;
  dispatch: (a: Action) => void;
  openAffordance: (changeId: string, el: HTMLElement) => void;
}

/**
 * Mock ChangeDown task-pane visual.
 *
 * Mirrors the real pane's structural elements (header status dot,
 * wordmark, welcome states, live feed, footer presence). Palette is
 * tinted warm so it sits in the page; the real pane uses a different
 * palette inside Word.
 *
 * T7.4: feed-card is now a <button> that opens the ChangeAffordance
 * (alternate review path). Accepted/rejected cards are disabled.
 */
export function MockPane(props: Props) {
  return (
    <aside class="mock-pane" aria-label="Mock ChangeDown for Word task pane">
      <header class="pane-header">
        <span class={`status-dot status-${props.state.scene}`} aria-hidden="true" />
        <span class="wordmark">CHANGEDOWN</span>
      </header>

      <Show when={props.state.pane.welcomeState === 'default'}>
        <div class="welcome">
          <h3>Pull up a seat.</h3>
          <p>Bring any AI into your live document. Three steps.</p>
          <button
            type="button"
            class="cta"
            onClick={() => props.dispatch({ type: 'next' })}
          >
            Try a free slot
          </button>
        </div>
      </Show>

      <Show when={props.state.pane.welcomeState === 'claiming'}>
        <div class="welcome">
          <p class="loader" aria-live="polite">Opening your seat…</p>
        </div>
      </Show>

      <Show when={props.state.pane.welcomeState === 'handoff'}>
        <div class="welcome handoff">
          <h3>A seat is open for you.</h3>
          <code class="room-url">https://relay.changedown.com/r/public-3</code>
          <button
            type="button"
            class="cta"
            onClick={() => props.dispatch({ type: 'next' })}
          >
            Copy agent instructions
          </button>
        </div>
      </Show>

      <Show
        when={
          props.state.pane.welcomeState === undefined &&
          props.state.pane.presence.count > 0 &&
          props.state.scene !== 'done'
        }
      >
        <div class="feed" aria-label="Live changes feed">
          <header class="feed-head">
            <span class="dot-live" aria-hidden="true" />
            Live · {props.state.doc.changes.length} change{props.state.doc.changes.length === 1 ? '' : 's'}
          </header>
          <Show
            when={props.state.doc.changes.length > 0}
            fallback={<p class="feed-empty">Waiting for edits…</p>}
          >
            <For each={props.state.doc.changes}>
              {(change) => (
                <button
                  type="button"
                  class={`feed-card status-${change.status}`}
                  data-change-id={change.id}
                  onClick={(e) =>
                    change.status === 'pending'
                      ? props.openAffordance(change.id, e.currentTarget as HTMLElement)
                      : undefined
                  }
                  aria-label={`Review change ${change.id}`}
                  disabled={change.status !== 'pending'}
                >
                  <span class="author">{change.author}</span>
                  <span class={`kind kind-${change.kind}`}>{change.kind}</span>
                  {change.replacement && (
                    <span class="text">{change.replacement}</span>
                  )}
                </button>
              )}
            </For>
          </Show>
        </div>
      </Show>

      <Show when={props.state.scene === 'done'}>
        <div class="done-summary">
          <h3>Nice work.</h3>
          <p>You reviewed {props.state.reviewedCount} change{props.state.reviewedCount === 1 ? '' : 's'}.</p>
          <a href="/install" class="cta primary">Install for real →</a>
          <button
            type="button"
            class="cta replay"
            onClick={() => props.dispatch({ type: 'jump-to-scene', scene: 'welcome' })}
          >
            Replay
          </button>
        </div>
      </Show>

      <footer class="pane-footer">
        <Show
          when={props.state.pane.presence.count > 0}
          fallback={<span>local session</span>}
        >
          <span>{props.state.pane.presence.count} here</span>
          {props.state.pane.presence.agents.length > 0 && (
            <span class="agents">· {props.state.pane.presence.agents.join(', ')}</span>
          )}
        </Show>
      </footer>
    </aside>
  );
}
