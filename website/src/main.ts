import { initHashline } from '@changetracks/core';
import { render, type ViewMode } from './renderer';
import { applyView } from './views';
import { updatePanel } from './panel';

let currentView: ViewMode = (localStorage.getItem('ct-view') as ViewMode) || 'changes';
let currentPage = 'index';
let lastRawMarkdown: string | null = null;

const contentEl = document.getElementById('editor-content')!;
const gutterEl = document.getElementById('editor-gutter')!;
const panelEl = document.getElementById('comment-panel')!;
const toggleEl = document.getElementById('view-toggle')!;

const VALID_PAGES = ['index', 'spec', 'ideas', 'install'] as const;

// --- View Toggle ---
toggleEl.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button');
  if (!btn) return;
  const view = btn.dataset.view as ViewMode;
  setView(view);
});

function setView(view: ViewMode) {
  currentView = view;
  localStorage.setItem('ct-view', view);

  // Update toggle buttons
  toggleEl.querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.view === view);
  });

  // Update body class for CSS
  document.body.className = `view-${view}`;

  // Re-render with smooth transition
  if (lastRawMarkdown !== null) {
    if (document.startViewTransition) {
      document.startViewTransition(() => renderPage(lastRawMarkdown!));
    } else {
      renderPage(lastRawMarkdown);
    }
  }
}

// --- Page Navigation ---
document.getElementById('page-nav')!.addEventListener('click', (e) => {
  const link = (e.target as HTMLElement).closest('a');
  if (!link) return;
  e.preventDefault();
  const page = link.dataset.page!;
  navigateTo(page);
});

window.addEventListener('hashchange', () => {
  const page = getPageFromHash();
  if (page !== currentPage) {
    navigateTo(page);
  }
});

function getPageFromHash(): string {
  const hash = window.location.hash.replace('#/', '').replace('#', '');
  return VALID_PAGES.includes(hash as typeof VALID_PAGES[number]) ? hash : 'index';
}

async function navigateTo(page: string) {
  currentPage = page;

  // Update nav active state
  document.querySelectorAll('#page-nav a').forEach(a => {
    a.classList.toggle('current', (a as HTMLElement).dataset.page === page);
  });

  // Update URL
  window.location.hash = page === 'index' ? '/' : `/${page}`;

  // Fetch and render
  try {
    const response = await fetch(`/content/${page}.md`);
    if (!response.ok) throw new Error(`Failed to load ${page}.md`);
    const rawMarkdown = await response.text();
    lastRawMarkdown = rawMarkdown;
    renderPage(rawMarkdown);
  } catch (_err) {
    contentEl.textContent = '';
    const errP = document.createElement('p');
    errP.style.color = 'var(--red)';
    errP.textContent = `Failed to load page: ${page}`;
    contentEl.appendChild(errP);
  }
}

function renderPage(rawMarkdown: string) {
  const result = render(rawMarkdown, currentView);
  applyView(result, currentView, contentEl, gutterEl);
  updatePanel(result.changes, currentView, panelEl, contentEl);
}

// --- Init ---
initHashline().then(() => {
  setView(currentView);
  navigateTo(getPageFromHash());
});
