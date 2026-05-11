import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import type { TrackedChange } from '../state/types';
import { computePopupPosition, type PopupPosition } from './computePopupPosition';

interface Props {
  change: TrackedChange;
  anchorEl: HTMLElement | undefined;
  onAccept: () => void;
  onReject: () => void;
  onClose: () => void;
}

const POPUP_WIDTH = 240;
const POPUP_HEIGHT = 120;

export function ChangeAffordance(props: Props) {
  const [pos, setPos] = createSignal<PopupPosition>({ top: 0, left: 0, placement: 'below' });
  let acceptBtn: HTMLButtonElement | undefined;
  let returnFocusEl: HTMLElement | null = null;

  onMount(() => {
    if (!props.anchorEl) return;

    // Remember where focus was so Esc/Close can restore it.
    returnFocusEl = props.anchorEl;

    const rect = props.anchorEl.getBoundingClientRect();
    setPos(
      computePopupPosition(
        { top: rect.top + window.scrollY, left: rect.left + window.scrollX, height: rect.height },
        { width: POPUP_WIDTH, height: POPUP_HEIGHT },
        { width: window.innerWidth, height: window.innerHeight }
      )
    );

    // Move focus to Accept (autofocus prop is unreliable in Solid; do it explicitly).
    queueMicrotask(() => acceptBtn?.focus());

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        props.onClose();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Close on outside click; clicks on the affordance itself are scoped via data-affordance
      if (!target.closest('[data-affordance]') && target !== props.anchorEl) {
        props.onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('click', handleClickOutside);

    onCleanup(() => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('click', handleClickOutside);
      // Restore focus to the change span that opened us.
      returnFocusEl?.focus?.();
    });
  });

  return (
    <div
      data-affordance
      role="dialog"
      aria-modal="false"
      aria-label={`Review change by ${props.change.author}`}
      class={`change-affordance placement-${pos().placement}`}
      style={{ position: 'absolute', top: `${pos().top}px`, left: `${pos().left}px` }}
    >
      <header class="affordance-head">
        <span class="dot" aria-hidden="true" />
        <span class="author">{props.change.author}</span>
        <span class="time">just now</span>
      </header>
      <Show when={props.change.reasoning}>
        <p class="reasoning">"{props.change.reasoning}"</p>
      </Show>
      <div class="actions">
        <button
          type="button"
          ref={acceptBtn}
          class="accept"
          onClick={props.onAccept}
        >
          <span aria-hidden="true">✓</span> Accept
        </button>
        <button
          type="button"
          class="reject"
          onClick={props.onReject}
        >
          <span aria-hidden="true">✗</span> Reject
        </button>
      </div>
    </div>
  );
}
