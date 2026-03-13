import { type ChangeNode, ChangeType } from '@changetracks/core';
import { type ViewMode, type RenderResult } from './renderer';
import { escapeHtml } from './utils';

/**
 * Apply view-specific DOM transformations after render.
 */
export function applyView(
  result: RenderResult,
  view: ViewMode,
  contentEl: HTMLElement,
  gutterEl: HTMLElement
): void {
  contentEl.innerHTML = result.html;
  gutterEl.innerHTML = '';

  switch (view) {
    case 'changes':
      applyChangesView(result, contentEl, gutterEl);
      break;
    case 'agent':
      applyAgentView(contentEl);
      break;
    case 'final':
      // Clean prose — no post-processing needed
      break;
  }
}

function applyChangesView(
  result: RenderResult,
  contentEl: HTMLElement,
  gutterEl: HTMLElement
): void {
  // Build gutter: colored bars per changed line
  buildGutter(result.changes, result.rawText, gutterEl);
}

function applyAgentView(contentEl: HTMLElement): void {
  // Tooltips on ct-anchor elements
  initAnchorTooltips(contentEl);
}

function initAnchorTooltips(contentEl: HTMLElement): void {
  contentEl.querySelectorAll('.ct-anchor').forEach(refEl => {
    const el = refEl as HTMLElement;
    const author = el.dataset.author;
    const status = el.dataset.status;
    const reason = el.dataset.reason;
    if (!author && !status) return;

    const tooltip = document.createElement('div');
    tooltip.className = 'fn-tooltip';
    tooltip.innerHTML = `
      <div class="fn-tooltip-author">${escapeHtml(author || 'unknown')}</div>
      <div class="fn-tooltip-meta">${escapeHtml(status || '')}</div>
      ${reason ? `<div class="fn-tooltip-reason">${escapeHtml(reason)}</div>` : ''}
    `;

    refEl.appendChild(tooltip);
    el.style.position = 'relative';
  });
}

function buildGutter(
  changes: ChangeNode[],
  rawText: string,
  gutterEl: HTMLElement
): void {
  const lines = rawText.split('\n');
  const lineChanges = new Map<number, ChangeType>();

  for (const change of changes) {
    const startLine = rawText.substring(0, change.range.start).split('\n').length;
    if (!lineChanges.has(startLine)) {
      lineChanges.set(startLine, change.type);
    }
  }

  const gutter = document.createElement('div');
  gutter.className = 'gutter-simple';
  for (let i = 1; i <= lines.length; i++) {
    const bar = document.createElement('div');
    bar.className = 'gutter-line';
    const changeType = lineChanges.get(i);
    if (changeType) {
      bar.classList.add(`gutter-${changeType.toLowerCase()}`);
    }
    gutter.appendChild(bar);
  }
  gutterEl.appendChild(gutter);
}
