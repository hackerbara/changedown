/**
 * Webview HTML generators for the DOCX preview custom editor.
 *
 * Produces complete HTML strings for four states:
 * - Loading (spinner while pandoc converts)
 * - Error (conversion failure, with pandoc install link when relevant)
 * - Choice (existing markdown found — open or re-import)
 * - Preview (toolbar + rendered body + margin comment panel)
 *
 * Pure functions — no VS Code API dependency.
 */

import type { AnnotationCard } from './annotation-extractor';

function generateNonce(): string {
    const array = new Uint8Array(16);
    for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

export interface ImportStats {
    insertions: number;
    deletions: number;
    substitutions: number;
    comments: number;
    authors: string[];
}

function esc(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function buildLoadingHtml(fileName: string): string {
    return `<!DOCTYPE html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; }
  .cn-docx-loading { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; gap:16px; opacity:0.7; }
  .cn-docx-spinner { width:32px; height:32px; border:3px solid rgba(128,128,128,0.3); border-top-color:var(--vscode-button-background,#007ACC); border-radius:50%; animation:cn-spin .8s linear infinite; }
  @keyframes cn-spin { to { transform:rotate(360deg); } }
</style></head><body>
<div class="cn-docx-loading">
  <div class="cn-docx-spinner"></div>
  <div>Converting ${esc(fileName)}...</div>
</div>
</body></html>`;
}

export function buildErrorHtml(fileName: string, errorMsg: string): string {
    const isPandocMissing = /pandoc/i.test(errorMsg);
    const helpLink = isPandocMissing
        ? '<p><a class="cn-docx-error-link" href="https://pandoc.org/installing.html">Install pandoc</a> to enable DOCX import.</p>'
        : '';
    return `<!DOCTYPE html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; }
  .cn-docx-error { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; gap:16px; text-align:center; padding:2rem; }
  .cn-docx-error-icon { font-size:2em; }
  .cn-docx-error-msg { color:var(--vscode-errorForeground); max-width:500px; }
  .cn-docx-error-link { color:var(--vscode-textLink-foreground); text-decoration:none; }
  .cn-docx-error-link:hover { text-decoration:underline; }
</style></head><body>
<div class="cn-docx-error">
  <div class="cn-docx-error-icon">\u26A0\uFE0F</div>
  <h2>Could not convert ${esc(fileName)}</h2>
  <div class="cn-docx-error-msg">${esc(errorMsg)}</div>
  ${helpLink}
</div>
</body></html>`;
}

export function buildChoiceHtml(fileName: string, existingMdName: string): string {
    const nonce = generateNonce();
    return `<!DOCTYPE html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; }
  .cn-docx-choice { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; gap:16px; text-align:center; padding:2rem; }
  .cn-docx-choice h2 { font-size:1.3em; margin-bottom:0.5em; }
  .cn-docx-choice-subtitle { color:var(--vscode-descriptionForeground); margin-bottom:1.5em; max-width:450px; }
  .cn-docx-choice-btn { background:var(--vscode-button-background); color:var(--vscode-button-foreground); border:none; padding:14px 28px; font-size:1em; cursor:pointer; border-radius:4px; min-width:360px; margin:4px 0; }
  .cn-docx-choice-btn:hover { background:var(--vscode-button-hoverBackground); }
  .cn-docx-choice-btn-warn { background:var(--vscode-inputValidation-warningBackground,#5a4308); color:var(--vscode-inputValidation-warningForeground,#fff); border:1px solid var(--vscode-inputValidation-warningBorder,#be8c00); }
  .cn-docx-choice-btn-warn:hover { opacity:0.9; }
  .cn-docx-choice-warn-text { font-size:0.85em; color:var(--vscode-errorForeground); margin-top:-4px; max-width:360px; }
</style></head><body>
<div class="cn-docx-choice">
  <h2>\u{1F4C4} ${esc(fileName)}</h2>
  <p class="cn-docx-choice-subtitle">A converted markdown file already exists: <strong>${esc(existingMdName)}</strong></p>
  <button class="cn-docx-choice-btn" id="openExistingBtn">
    Open existing ${esc(existingMdName)}
  </button>
  <button class="cn-docx-choice-btn cn-docx-choice-btn-warn" id="reimportBtn">
    Re-import from DOCX (overwrites existing markdown)
  </button>
  <p class="cn-docx-choice-warn-text">\u26A0\uFE0F This will overwrite any edits you made to the markdown file.</p>
</div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
document.getElementById('openExistingBtn').addEventListener('click', function() {
  vscode.postMessage({ command: 'openExisting' });
});
document.getElementById('reimportBtn').addEventListener('click', function() {
  vscode.postMessage({ command: 'reimport' });
});
</script>
</body></html>`;
}

export interface PreviewHtmlOptions {
    fileName: string;
    bodyHtml: string;
    annotations: AnnotationCard[];
    stats: ImportStats;
    currentViewMode: string;
}

function replaceUnsupportedImages(html: string): string {
    return html.replace(
        /<img[^>]*src="[^"]*\.(emf|wmf|tiff?|bmp)"[^>]*>/gi,
        (match) => {
            const srcMatch = match.match(/src="([^"]*)"/);
            const filename = srcMatch ? srcMatch[1].split('/').pop() : 'unknown';
            return `<div class="image-placeholder" style="padding:12px;border:1px dashed #888;color:#888;text-align:center;margin:8px 0;">[Unsupported format: ${filename}]</div>`;
        }
    );
}

export function buildPreviewHtml(opts: PreviewHtmlOptions): string {
    const { fileName, bodyHtml: rawBodyHtml, annotations, stats, currentViewMode } = opts;
    const bodyHtml = replaceUnsupportedImages(rawBodyHtml);
    const nonce = generateNonce();

    const sel = (mode: string) => mode === currentViewMode ? 'selected' : '';

    const authorBadges = stats.authors
        .map(a => `<span class="cn-toolbar-author">${esc(a)}</span>`)
        .join('');

    const statsHtml = [
        stats.insertions > 0 ? `<span class="cn-stat-ins">${stats.insertions} ins</span>` : '',
        stats.deletions > 0 ? `<span class="cn-stat-del">${stats.deletions} del</span>` : '',
        stats.substitutions > 0 ? `<span class="cn-stat-sub">${stats.substitutions} sub</span>` : '',
    ].filter(Boolean).join(' ');

    const annotationCards = annotations.map(card => {
        return `<div class="cn-sidebar-card cn-type-${esc(card.type)}" data-cn-pair="${esc(card.pairId)}" data-cn-id="${esc(card.changeId)}">
  <div class="cn-card-header">
    <span class="cn-card-type">${esc(card.type)}</span>
    <span class="cn-card-author">${esc(card.author ?? '')}</span>
    <span class="cn-card-date">${esc(card.date ?? '')}</span>
  </div>
  <div class="cn-card-preview">${esc(card.textPreview)}</div>
  ${card.commentText ? `<div class="cn-card-comment">${esc(card.commentText)}</div>` : ''}
  ${card.approvalCount > 0 ? `<span class="cn-card-approvals">\u2713${card.approvalCount}</span>` : ''}
  ${card.rejectionCount > 0 ? `<span class="cn-card-rejections">\u2717${card.rejectionCount}</span>` : ''}
</div>`;
    }).join('\n');

    return `<!DOCTYPE html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src data: https: vscode-resource: vscode-webview-resource:;">
<style nonce="${nonce}">
/* Base */
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; }

/* Toolbar */
.cn-docx-toolbar {
  position: sticky; top: 0; z-index: 100;
  display: flex; align-items: center; gap: 12px;
  padding: 8px 16px;
  background: var(--vscode-titleBar-activeBackground, var(--vscode-editor-background));
  border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.35));
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
  font-size: 13px;
}
.cn-toolbar-filename { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
.cn-toolbar-viewmode {
  background: var(--vscode-dropdown-background, var(--vscode-input-background));
  color: var(--vscode-dropdown-foreground, var(--vscode-input-foreground));
  border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border, rgba(128,128,128,0.3)));
  padding: 4px 8px; border-radius: 4px; font-size: 12px;
}
.cn-toolbar-stats { display: flex; gap: 8px; font-size: 12px; opacity: 0.8; }
.cn-stat-ins { color: #1E824C; } .vscode-dark .cn-stat-ins { color: #66BB6A; }
.cn-stat-del { color: #C0392B; } .vscode-dark .cn-stat-del { color: #EF5350; }
.cn-stat-sub { color: #2980B9; } .vscode-dark .cn-stat-sub { color: #64B5F6; }
.cn-toolbar-spacer { flex: 1; }
.cn-toolbar-authors { display: flex; gap: 6px; }
.cn-toolbar-author { padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 500; }
.vscode-light .cn-toolbar-author { background: rgba(0,0,0,0.06); }
.vscode-dark .cn-toolbar-author { background: rgba(255,255,255,0.08); }
.cn-toolbar-edit {
  background: var(--vscode-button-background); color: var(--vscode-button-foreground);
  border: none; padding: 6px 16px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 500;
}
.cn-toolbar-edit:hover { background: var(--vscode-button-hoverBackground); }

/* Layout */
.cn-preview-layout { display: flex; height: calc(100vh - 45px); overflow: hidden; }
.cn-preview-body { flex: 1; overflow-y: auto; padding: 24px; background: var(--vscode-sideBar-background, var(--vscode-editor-background)); }
.cn-sidebar {
  width: 300px; overflow-y: auto; flex-shrink: 0;
  border-left: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
  padding: 8px; background: var(--vscode-editor-background);
}

/* Document card */
.cn-document-card {
  max-width: 800px; margin: 0 auto; padding: 32px 48px;
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.15));
  border-radius: 4px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 15px; line-height: 1.7; color: var(--vscode-editor-foreground);
}

/* Sidebar cards */
.cn-sidebar-card {
  padding: 8px 10px; margin-bottom: 6px; border-radius: 4px; cursor: pointer;
  border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
  border-left: 3px solid rgba(128,128,128,0.3);
  font-size: 12px; transition: background 0.15s;
}
.cn-sidebar-card:hover { background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.05)); }
.cn-sidebar-card.cn-card-active { border-left-color: #2196F3 !important; background: rgba(33, 150, 243, 0.08); box-shadow: 0 1px 6px rgba(0,0,0,0.15); }
.cn-sidebar-card.cn-card-hover { border-left-color: #42A5F5; background: var(--vscode-list-hoverBackground); }
.cn-type-insertion { border-left-color: #1E824C; } .vscode-dark .cn-type-insertion { border-left-color: #66BB6A; }
.cn-type-deletion { border-left-color: #C0392B; } .vscode-dark .cn-type-deletion { border-left-color: #EF5350; }
.cn-type-substitution { border-left-color: #2980B9; } .vscode-dark .cn-type-substitution { border-left-color: #64B5F6; }
.cn-type-highlight { border-left-color: #FFCA28; }
.cn-type-comment { border-left-color: #FFCA28; }
.cn-card-header { display: flex; gap: 6px; align-items: center; margin-bottom: 4px; }
.cn-card-type { font-weight: 600; font-size: 11px; text-transform: capitalize; }
.cn-card-author { font-weight: 500; }
.cn-card-date { opacity: 0.6; font-size: 11px; }
.cn-card-preview { opacity: 0.9; line-height: 1.4; }
.cn-card-comment { margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(128,128,128,0.15); opacity: 0.85; }
.cn-card-approvals { color: #1E824C; font-size: 11px; } .vscode-dark .cn-card-approvals { color: #66BB6A; }
.cn-card-rejections { color: #C0392B; font-size: 11px; } .vscode-dark .cn-card-rejections { color: #EF5350; }

/* CriticMarkup semantic colors — Insertions */
.vscode-light .cn-ins { color: #1E824C; }
.vscode-dark .cn-ins { color: #66BB6A; }
/* Deletions */
.vscode-light .cn-del { color: #C0392B; text-decoration: line-through; }
.vscode-dark .cn-del { color: #EF5350; text-decoration: line-through; }
/* Substitution deletion side */
.vscode-light .cn-sub-del { color: #C0392B; text-decoration: line-through; }
.vscode-dark .cn-sub-del { color: #EF5350; text-decoration: line-through; }
/* Substitution insertion side */
.vscode-light .cn-sub-ins { color: #1E824C; }
.vscode-dark .cn-sub-ins { color: #66BB6A; }
/* Highlights */
.cn-hl { background: rgba(255,255,0,0.3); padding: 0 2px; border-radius: 2px; }
/* Comments */
.cn-comment { cursor: help; font-size: 0.85em; opacity: 0.8; }
/* Moves */
.vscode-light .cn-move-from { color: #8E44AD; text-decoration: line-through; }
.vscode-dark .cn-move-from { color: #CE93D8; text-decoration: line-through; }
.vscode-light .cn-move-to { color: #8E44AD; text-decoration: underline; }
.vscode-dark .cn-move-to { color: #CE93D8; text-decoration: underline; }
/* Status modifiers */
.cn-accepted { opacity: 0.6; }
.cn-rejected { opacity: 0.5; font-style: italic; }
/* Active highlight for sidebar linking */
.cn-hl-active { background: rgba(33, 150, 243, 0.3) !important; outline: 2px solid rgba(33, 150, 243, 0.5); border-radius: 2px; }
/* Anchor metadata */
.cn-anchor-meta { font-size: 0.75em; margin-left: 0.3em; opacity: 0.7; }
.cn-anchor-author { font-weight: 500; }
/* Inline change click target */
#previewBody [data-cn-pair] { cursor: pointer; }
/* Hide footnote ref badges — sidebar provides annotation access; hover linkage uses data-cn-pair */
.cn-ref { display: none; }

/* ── Simple view: settled text + change gutter ── */
[data-view-mode="simple"] .cn-del,
[data-view-mode="simple"] .cn-sub-del,
[data-view-mode="simple"] del.cn-move-from,
[data-view-mode="simple"] .cn-move-label { display: none; }
[data-view-mode="simple"] .cn-ins,
[data-view-mode="simple"] .cn-sub-ins,
[data-view-mode="simple"] ins.cn-move-to { text-decoration: none; }
[data-view-mode="simple"] .cn-comment { display: none; }
[data-view-mode="simple"] .cn-hl { background: none; padding: 0; }
[data-view-mode="simple"] .cn-anchor-meta { display: none; }
[data-view-mode="simple"] .cn-accepted { opacity: 1; }
[data-view-mode="simple"] .cn-rejected { opacity: 1; font-style: normal; }
[data-view-mode="simple"] .cn-footnotes { display: none; }
[data-view-mode="simple"] .cn-ref { cursor: pointer; }
[data-view-mode="simple"] .cn-ref a { color: var(--vscode-textLink-foreground); text-decoration: none; }
/* Gutter: insertion (green) */
[data-view-mode="simple"] .cn-document-card :is(p,li,h1,h2,h3,h4,h5,h6,blockquote,pre):has(ins.cn-ins) {
  border-left: 3px solid #66BB6A; padding-left: 8px; margin-left: -12px;
}
.vscode-light [data-view-mode="simple"] .cn-document-card :is(p,li,h1,h2,h3,h4,h5,h6,blockquote,pre):has(ins.cn-ins) {
  border-left-color: #1E824C;
}
/* Gutter: deletion only (red) */
[data-view-mode="simple"] .cn-document-card :is(p,li,h1,h2,h3,h4,h5,h6,blockquote,pre):has(del.cn-del):not(:has(ins.cn-ins)) {
  border-left: 3px solid #EF5350; padding-left: 8px; margin-left: -12px; min-height: 1.2em;
}
.vscode-light [data-view-mode="simple"] .cn-document-card :is(p,li,h1,h2,h3,h4,h5,h6,blockquote,pre):has(del.cn-del):not(:has(ins.cn-ins)) {
  border-left-color: #C0392B;
}
/* Gutter: substitution (blue) */
[data-view-mode="simple"] .cn-document-card :is(p,li,h1,h2,h3,h4,h5,h6,blockquote,pre):has(.cn-sub-del) {
  border-left: 3px solid #64B5F6; padding-left: 8px; margin-left: -12px;
}
.vscode-light [data-view-mode="simple"] .cn-document-card :is(p,li,h1,h2,h3,h4,h5,h6,blockquote,pre):has(.cn-sub-del) {
  border-left-color: #2980B9;
}
</style>
</head><body>
<div class="cn-docx-toolbar">
  <span class="cn-toolbar-filename">${esc(fileName)}</span>
  <select class="cn-toolbar-viewmode" id="viewModeSelect">
    <option value="allMarkup" ${sel('allMarkup')}>All Markup</option>
    <option value="simple" ${sel('simple')}>Simple</option>
    <option value="original" ${sel('original')}>Original</option>
    <option value="final" ${sel('final')}>Final</option>
  </select>
  <div class="cn-toolbar-stats">${statsHtml}</div>
  <div class="cn-toolbar-spacer"></div>
  <div class="cn-toolbar-authors">${authorBadges}</div>
  <button class="cn-toolbar-edit" id="editBtn">Edit as Markdown</button>
</div>
<div class="cn-preview-layout" data-view-mode="${esc(currentViewMode)}">
  <div class="cn-preview-body" id="previewBody">
    <div class="cn-document-card">
      ${bodyHtml}
    </div>
  </div>
  <div class="cn-sidebar" id="sidebar">
    ${annotationCards}
  </div>
</div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();

// View mode switching
document.getElementById('viewModeSelect').addEventListener('change', function(e) {
  vscode.postMessage({ command: 'setViewMode', mode: e.target.value });
});

// Edit button
document.getElementById('editBtn').addEventListener('click', function() {
  var btn = document.getElementById('editBtn');
  btn.textContent = 'Opening...';
  btn.disabled = true;
  vscode.postMessage({ command: 'edit' });
});

// Helpers for bidirectional highlight + scroll
function clearActive() {
  document.querySelectorAll('.cn-hl-active').forEach(function(el) { el.classList.remove('cn-hl-active'); });
  document.querySelectorAll('.cn-card-active').forEach(function(el) { el.classList.remove('cn-card-active'); });
}
function activateCard(card) {
  card.classList.add('cn-card-active');
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Sidebar card click → highlight + scroll to inline anchor
document.querySelectorAll('.cn-sidebar-card').forEach(function(card) {
  card.addEventListener('click', function() {
    clearActive();
    card.classList.add('cn-card-active');
    var pairId = card.dataset.cnPair;
    var anchor = document.querySelector('#previewBody [data-cn-pair="' + pairId + '"]');
    if (anchor) {
      anchor.classList.add('cn-hl-active');
      anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
});

// Inline anchor click → highlight + scroll to sidebar card
document.querySelectorAll('#previewBody [data-cn-pair]').forEach(function(el) {
  el.addEventListener('click', function() {
    clearActive();
    el.classList.add('cn-hl-active');
    var pairId = el.dataset.cnPair;
    var card = document.querySelector('.cn-sidebar-card[data-cn-pair="' + pairId + '"]');
    if (card) activateCard(card);
  });
});

// Footnote ref badge click → scroll to sidebar card by changeId
document.querySelectorAll('.cn-ref a').forEach(function(link) {
  link.addEventListener('click', function(e) {
    e.preventDefault();
    clearActive();
    var ref = link.closest('.cn-ref');
    var cnId = ref ? ref.dataset.cnId : null;
    if (!cnId) return;
    var card = document.querySelector('.cn-sidebar-card[data-cn-id="' + cnId + '"]');
    if (card) activateCard(card);
    // Also highlight the parent inline anchor if present
    var parent = ref.closest('[data-cn-pair]');
    if (parent) parent.classList.add('cn-hl-active');
  });
});

// Inline anchor hover → highlight sidebar card
document.querySelectorAll('#previewBody [data-cn-pair]').forEach(function(el) {
  el.addEventListener('mouseenter', function() {
    var card = document.querySelector('.cn-sidebar-card[data-cn-pair="' + el.dataset.cnPair + '"]');
    if (card) card.classList.add('cn-card-hover');
  });
  el.addEventListener('mouseleave', function() {
    var card = document.querySelector('.cn-sidebar-card[data-cn-pair="' + el.dataset.cnPair + '"]');
    if (card) card.classList.remove('cn-card-hover');
  });
});
</script>
</body></html>`;
}
