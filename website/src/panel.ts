import { type ChangeNode, ChangeType, ChangeStatus } from '@changetracks/core';
import { type ViewMode } from './renderer';
import { escapeHtml } from './utils';

export function updatePanel(
  changes: ChangeNode[],
  view: ViewMode,
  panelEl: HTMLElement,
  contentEl: HTMLElement
): void {
  panelEl.innerHTML = '';

  if (view === 'agent' || view === 'final') {
    // Agent/Final views: no side panel
    panelEl.classList.add('hidden');
    return;
  }

  panelEl.classList.remove('hidden');

  // Final view: show only resolved/accepted changes (deliberation history)
  // Simple view: show all annotated changes

  // Filter to changes that have metadata worth showing.
  // L0 changes (bare CriticMarkup) have level === 0 and no footnote metadata — skip them.
  const displayChanges = changes.filter(c =>
    c.level > 0 && (c.metadata?.comment || c.metadata?.author || c.metadata?.discussion?.length)
  );

  if (displayChanges.length === 0) {
    panelEl.innerHTML = '<div class="panel-empty">No annotations</div>';
    return;
  }

  for (const change of displayChanges) {
    const entry = createPanelEntry(change);
    panelEl.appendChild(entry);

    // Hover: highlight corresponding change in editor
    entry.addEventListener('mouseenter', () => {
      highlightChange(change.id, contentEl, true);
      entry.classList.add('panel-entry-active');
    });
    entry.addEventListener('mouseleave', () => {
      highlightChange(change.id, contentEl, false);
      entry.classList.remove('panel-entry-active');
    });

    // Click: scroll to change in editor
    entry.addEventListener('click', () => {
      const target = contentEl.querySelector(`[data-ct-id="${change.id}"]`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  // Reverse: hover change in editor → highlight panel entry
  contentEl.querySelectorAll('[data-ct-id]').forEach(el => {
    el.addEventListener('mouseenter', () => {
      const id = (el as HTMLElement).dataset.ctId;
      const entry = panelEl.querySelector(`[data-panel-id="${id}"]`);
      entry?.classList.add('panel-entry-active');
    });
    el.addEventListener('mouseleave', () => {
      const id = (el as HTMLElement).dataset.ctId;
      const entry = panelEl.querySelector(`[data-panel-id="${id}"]`);
      entry?.classList.remove('panel-entry-active');
    });
  });
}

function createPanelEntry(change: ChangeNode): HTMLElement {
  const entry = document.createElement('div');
  entry.className = 'panel-entry';
  entry.dataset.panelId = change.id;

  const header = document.createElement('div');
  header.className = 'panel-entry-header';

  const author = change.metadata?.author || change.inlineMetadata?.author || 'unknown';
  const date = change.metadata?.date || change.inlineMetadata?.date || '';
  const status = change.metadata?.status || change.status || '';
  const type = change.type;

  header.innerHTML = `
    <span class="panel-author">${escapeHtml(author)}</span>
    <span class="panel-badge panel-badge-${type.toLowerCase()}">${type.toLowerCase()}</span>
    <span class="panel-status">${escapeHtml(status)}</span>
  `;

  entry.appendChild(header);

  if (date) {
    const dateEl = document.createElement('div');
    dateEl.className = 'panel-date';
    dateEl.textContent = date;
    entry.appendChild(dateEl);
  }

  const comment = change.metadata?.comment;
  if (comment) {
    const commentEl = document.createElement('div');
    commentEl.className = 'panel-comment';
    commentEl.textContent = comment;
    entry.appendChild(commentEl);
  }

  // Discussion thread
  if (change.metadata?.discussion?.length) {
    const thread = document.createElement('div');
    thread.className = 'panel-thread';
    for (const msg of change.metadata.discussion) {
      const msgEl = document.createElement('div');
      msgEl.className = 'panel-thread-msg';
      msgEl.innerHTML = `<strong>${escapeHtml(msg.author)}</strong>: ${escapeHtml(msg.text)}`;
      thread.appendChild(msgEl);
    }
    entry.appendChild(thread);
  }

  return entry;
}

function highlightChange(
  changeId: string,
  contentEl: HTMLElement,
  highlight: boolean
): void {
  const els = contentEl.querySelectorAll(`[data-ct-id="${changeId}"]`);
  els.forEach(el => {
    el.classList.toggle('ct-highlight-active', highlight);
  });
}
