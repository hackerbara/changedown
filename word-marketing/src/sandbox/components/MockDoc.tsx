import { For, Show, createMemo } from 'solid-js';
import type { MockDoc as MockDocType, SceneId } from '../state/types';

interface Props {
  doc: MockDocType;
  scene: SceneId;
  openAffordance: (changeId: string, el: HTMLElement) => void;
}

/**
 * Mock Word document panel.
 *
 * Renders the canonical memo with tracked changes inline. In scenes
 * <= 'agent-connected', doc.lines is an empty placeholder (canonical
 * scenario doesn't load until 'edits-arriving' — handled in Tranche 6).
 *
 * Each tracked change span is interactive: clicking opens the
 * ChangeAffordance popup (mounted in SandboxRoot — Tranche 7).
 */
export function MockDoc(props: Props) {
  const changesBySpan = createMemo(() => {
    const map = new Map<number, typeof props.doc.changes>();
    for (const c of props.doc.changes) {
      const arr = map.get(c.spanIndex) ?? [];
      arr.push(c);
      map.set(c.spanIndex, arr);
    }
    return map;
  });

  return (
    <div class="mock-doc paper" aria-label="Mock Word document">
      <Show
        when={props.doc.lines.length > 0}
        fallback={
          <div class="empty-doc">
            <p class="empty-headline">Q4 Priorities Memo</p>
            <p class="empty-note">[Document loads when AI joins the room]</p>
          </div>
        }
      >
        <For each={props.doc.lines}>
          {(line, idx) => (
            <p class="doc-paragraph" data-line={idx()}>
              {line.text}
              <For each={changesBySpan().get(idx()) ?? []}>
                {(change) => (
                  <span
                    class={`change change-${change.kind} change-${change.status}`}
                    data-change-id={change.id}
                    tabindex="0"
                    onClick={(e) => props.openAffordance(change.id, e.currentTarget as HTMLElement)}
                    onKeyDown={(e: KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        props.openAffordance(change.id, e.currentTarget as HTMLElement);
                      }
                    }}
                    aria-label={`Tracked change by ${change.author}: ${change.kind}. Press Enter to review.`}
                  >
                    {change.kind === 'ins' ? change.replacement : ''}
                  </span>
                )}
              </For>
            </p>
          )}
        </For>
      </Show>
    </div>
  );
}
