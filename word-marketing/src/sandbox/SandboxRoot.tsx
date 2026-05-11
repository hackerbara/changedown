import { createSignal, createEffect, onMount, onCleanup, Show } from 'solid-js';
import { createInitialState, transition, type Action } from './state/machine';
import { MockDoc } from './components/MockDoc';
import { MockPane } from './components/MockPane';
import { SceneScrubber } from './components/SceneScrubber';
import { SceneNarrator } from './components/SceneNarrator';
import { EscapeHatch } from './components/EscapeHatch';
import { MockAIChat } from './components/MockAIChat';
import { ChangeAffordance } from './components/ChangeAffordance';
import { loadCanonicalScenario } from './content/load-scenario';

export default function SandboxRoot() {
  const [state, setState] = createSignal(createInitialState());
  const dispatch = (action: Action) => setState((s) => transition(s, action));

  const [activeChangeId, setActiveChangeId] = createSignal<string | undefined>();
  const [anchorEl, setAnchorEl] = createSignal<HTMLElement | undefined>();
  const [lastReviewedId, setLastReviewedId] = createSignal<string | undefined>();

  const openAffordance = (changeId: string, el: HTMLElement) => {
    setActiveChangeId(changeId);
    setAnchorEl(el);
  };
  const closeAffordance = () => {
    setActiveChangeId(undefined);
    setAnchorEl(undefined);
  };
  const handleAccept = () => {
    const id = activeChangeId();
    if (!id) return;
    dispatch({ type: 'review-change', changeId: id, decision: 'accept' });
    setLastReviewedId(id);
    closeAffordance();
  };
  const handleReject = () => {
    const id = activeChangeId();
    if (!id) return;
    dispatch({ type: 'review-change', changeId: id, decision: 'reject' });
    setLastReviewedId(id);
    closeAffordance();
  };

  const activeChange = () => state().doc.changes.find((c) => c.id === activeChangeId());

  onMount(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Only step scenes if no affordance is open (Esc handled inside affordance)
      if (activeChangeId()) return;
      if (e.key === 'ArrowRight') dispatch({ type: 'next' });
      if (e.key === 'ArrowLeft') dispatch({ type: 'prev' });
      if (e.key === 'Escape' && state().mode === 'free') dispatch({ type: 'exit-free-mode' });
    };
    document.addEventListener('keydown', handleKey);
    onCleanup(() => document.removeEventListener('keydown', handleKey));
  });

  createEffect(async () => {
    if (state().scene === 'edits-arriving' && state().doc.changes.length === 0 && state().doc.lines.length === 0) {
      const scenario = await loadCanonicalScenario();
      // Populate doc lines first
      setState((s) => ({ ...s, doc: { ...s.doc, lines: scenario.body.lines } }));
      // Stagger changes arriving
      for (const change of scenario.changes) {
        await new Promise((r) => setTimeout(r, 600));
        dispatch({ type: 'mock-edits-arrive', changes: [change] });
      }
    }
  });

  return (
    <div
      data-sandbox-root
      class="sandbox"
      role="region"
      aria-label="ChangeDown for Word interactive demo"
    >
      <div class="sandbox-header">
        <SceneScrubber
          scene={state().scene}
          onJump={(scene) => dispatch({ type: 'jump-to-scene', scene })}
        />
      </div>
      <div class="sandbox-body">
        <MockDoc
          doc={state().doc}
          scene={state().scene}
          openAffordance={openAffordance}
        />
        <MockPane
          state={state()}
          dispatch={dispatch}
          openAffordance={openAffordance}
        />
      </div>
      <MockAIChat scene={state().scene} />
      <SceneNarrator
        scene={state().scene}
        onNext={() => dispatch({ type: 'next' })}
      />
      <EscapeHatch
        mode={state().mode}
        onEnter={() => dispatch({ type: 'enter-free-mode' })}
        onExit={() => dispatch({ type: 'exit-free-mode' })}
      />
      <Show when={activeChange() && anchorEl()}>
        <ChangeAffordance
          change={activeChange()!}
          anchorEl={anchorEl()}
          onAccept={handleAccept}
          onReject={handleReject}
          onClose={closeAffordance}
        />
      </Show>
      {/* T7.6 ARIA live region — announces scene changes AND review decisions */}
      <div class="sr-only" aria-live="polite" aria-atomic="true">
        Scene {state().scene}.{' '}
        <Show when={lastReviewedId()}>
          {(id) => {
            const change = state().doc.changes.find((c) => c.id === id());
            return change ? <>Change {change.status}.</> : null;
          }}
        </Show>
      </div>
    </div>
  );
}
