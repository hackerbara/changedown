import { scanCriticMarkup } from './scanner.js';
import { buildPositionMap, collectText } from './position-map.js';
import { HighlightStrategy } from './highlight-strategy.js';
import { DomMutationStrategy } from './dom-strategy.js';
import { isEnabled } from './config-reader.js';
import type { RenderStrategy, TextNodeEntry, ScanMatch } from './types.js';

const LEXICAL_CONTAINER_SELECTOR = '.markdown-lexical-editor-container';
const DEBOUNCE_MS = 50;

let activeStrategy: RenderStrategy | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let observer: MutationObserver | null = null;
let isRendering = false;
let lastRenderedText = '';

/** Select the best available rendering strategy */
export function selectStrategy(): RenderStrategy {
  const hlStrategy = new HighlightStrategy();
  if (hlStrategy.isAvailable()) return hlStrategy;
  return new DomMutationStrategy();
}

/** Scan a container's text for CriticMarkup and render via the given strategy */
export function scanAndRender(container: Element, strategy: RenderStrategy): void {
  const positionMap = buildPositionMap(container);
  const text = collectText(positionMap);
  const matches = scanCriticMarkup(text);
  strategy.apply(container, matches, positionMap);
}

function scheduleRender(): void {
  if (isRendering) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (!isEnabled() || isRendering) return;
    const containers = document.querySelectorAll(LEXICAL_CONTAINER_SELECTOR);
    if (containers.length === 0) return;

    for (const container of containers) {
      const editable = container.querySelector('[contenteditable="true"]');
      if (editable && activeStrategy) {
        // Skip if text hasn't changed (avoids re-render loops)
        const text = editable.textContent ?? '';
        if (text === lastRenderedText) continue;
        lastRenderedText = text;

        isRendering = true;
        try {
          scanAndRender(editable, activeStrategy);
        } finally {
          isRendering = false;
        }
      }
    }
  }, DEBOUNCE_MS);
}

/** Initialize the bridge — called on script load */
export function init(): void {
  if (!isEnabled()) return;

  activeStrategy = selectStrategy();
  console.log(`[changetracks] Lexical bridge initialized (strategy: ${activeStrategy.name})`);

  // Only observe the document, not with overly broad scope
  observer = new MutationObserver((mutations) => {
    // Skip mutations caused by our own rendering
    if (isRendering) return;

    // Only react to mutations inside or near Lexical containers
    const relevant = mutations.some(m => {
      const target = m.target as Element;
      if (target.closest?.(LEXICAL_CONTAINER_SELECTOR)) return true;
      if (target.querySelector?.(LEXICAL_CONTAINER_SELECTOR)) return true;
      return false;
    });
    if (relevant) scheduleRender();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // Initial scan after a short delay (Lexical container needs time to mount)
  setTimeout(() => scheduleRender(), 500);
}

/** Teardown */
export function destroy(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (activeStrategy) {
    activeStrategy.clear();
    activeStrategy = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  isRendering = false;
  lastRenderedText = '';
}

// Auto-init when loaded as IIFE in the browser — DISABLED: experimental preview causes hangs in Cursor
// if (typeof window !== 'undefined') {
//   if (document.readyState === 'loading') {
//     document.addEventListener('DOMContentLoaded', init);
//   } else {
//     init();
//   }
// }
