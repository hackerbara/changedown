/**
 * Review Panel Provider — WebviewView replacing the old TreeView changes panel.
 *
 * Renders four cognitive zones:
 *   1. Configure (tracking toggle + view mode selector)
 *   2. Navigate (prev/next)
 *   3. Bulk Act (accept all / reject all)
 *   4. Changes (summary + scrollable change cards)
 */

import * as vscode from 'vscode';
import { ChangeNode, ChangeType } from '@changetracks/core';
import { ViewMode } from './view-mode';
import { typeLabel, CHANGE_COLORS } from './visual-semantics';

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_PREVIEW_LENGTH = 60;
const ELLIPSIS = '\u2026';
const REFRESH_DEBOUNCE_MS = 80;

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReviewPanelState {
    trackingEnabled: boolean;
    viewMode: ViewMode;
    changes: ChangeCardData[];
    hasActiveMarkdownEditor: boolean;
}

export interface ChangeCardData {
    id: string;
    type: string;
    text: string;
    author: string;
    status: string;
    colorClass: string;
}

export interface ReviewPanelContext {
    getChanges(): ChangeNode[];
    getDocumentText(): string;
    trackingMode: boolean;
    viewMode: ViewMode;
    onDidChangeChanges(listener: (uris: vscode.Uri[]) => void): vscode.Disposable;
}

// ── Color class mapping ──────────────────────────────────────────────────────

function colorClassForType(type: ChangeType): string {
    switch (type) {
        case ChangeType.Insertion: return 'insertion';
        case ChangeType.Deletion: return 'deletion';
        case ChangeType.Substitution: return 'substitution';
        case ChangeType.Highlight: return 'highlight';
        case ChangeType.Comment: return 'comment';
    }
}

// ── Provider ─────────────────────────────────────────────────────────────────

export class ReviewPanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    private webviewView: vscode.WebviewView | undefined;
    private disposables: vscode.Disposable[] = [];
    private refreshTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(private ctx: ReviewPanelContext) {
        this.disposables.push(
            ctx.onDidChangeChanges(() => this.scheduleRefresh()),
            vscode.window.onDidChangeActiveTextEditor(() => this.scheduleRefresh()),
        );
    }

    dispose(): void {
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
            this.refreshTimeout = null;
        }
        for (const d of this.disposables) d.dispose();
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): void {
        this.webviewView = webviewView;
        webviewView.webview.options = { enableScripts: true };

        webviewView.webview.onDidReceiveMessage(
            (msg) => this.handleMessage(msg),
            undefined,
            this.disposables,
        );

        // Refresh content when the panel becomes visible again (e.g. user returns
        // to the ChangeTracks sidebar after viewing Explorer or another panel).
        this.disposables.push(
            webviewView.onDidChangeVisibility(() => {
                if (webviewView.visible) {
                    this.updateContent();
                }
            }),
        );

        this.updateContent();
    }

    /** Immediate refresh — call for explicit user actions. */
    refresh(): void {
        this.updateContent();
    }

    /** Debounced refresh — absorbs rapid-fire updates. */
    private scheduleRefresh(): void {
        if (this.refreshTimeout) clearTimeout(this.refreshTimeout);
        this.refreshTimeout = setTimeout(() => {
            this.refreshTimeout = null;
            this.updateContent();
        }, REFRESH_DEBOUNCE_MS);
    }

    private handleMessage(msg: { command: string; value?: string; mode?: string }): void {
        switch (msg.command) {
            case 'toggleTracking':
                vscode.commands.executeCommand('changetracks.toggleTracking');
                this.scheduleRefresh();
                break;
            case 'setViewMode':
                vscode.commands.executeCommand('changetracks.setViewMode', msg.mode ?? msg.value);
                this.scheduleRefresh();
                break;
            case 'prevChange':
                vscode.commands.executeCommand('changetracks.previousChange');
                break;
            case 'nextChange':
                vscode.commands.executeCommand('changetracks.nextChange');
                break;
            case 'acceptAll':
                vscode.commands.executeCommand('changetracks.acceptAll');
                break;
            case 'rejectAll':
                vscode.commands.executeCommand('changetracks.rejectAll');
                break;
            case 'revealChange':
                if (msg.value) {
                    vscode.commands.executeCommand('changetracks.revealChange', msg.value);
                }
                break;
            case 'acceptChange':
                if (msg.value) {
                    vscode.commands.executeCommand('changetracks.acceptChange', msg.value);
                }
                break;
            case 'rejectChange':
                if (msg.value) {
                    vscode.commands.executeCommand('changetracks.rejectChange', msg.value);
                }
                break;
            case 'exportToDocx':
                vscode.commands.executeCommand('changetracks.exportToDocx');
                break;
        }
    }

    private buildState(): ReviewPanelState {
        const changes = this.ctx.getChanges();
        const text = this.ctx.getDocumentText();
        // Show overlay when no markdown file is visible in any editor
        const hasActiveMarkdownEditor =
            vscode.window.activeTextEditor?.document.languageId === 'markdown' ||
            vscode.window.visibleTextEditors.some(e => e.document.languageId === 'markdown');

        const cards: ChangeCardData[] = changes.map(c => ({
            id: c.id,
            type: typeLabel(c.type),
            text: this.getChangePreview(c, text),
            author: c.metadata?.author ?? '',
            status: c.metadata?.status ?? c.inlineMetadata?.status ?? c.status ?? 'proposed',
            colorClass: colorClassForType(c.type),
        }));

        return {
            trackingEnabled: this.ctx.trackingMode,
            viewMode: this.ctx.viewMode,
            changes: cards,
            hasActiveMarkdownEditor: hasActiveMarkdownEditor ?? false,
        };
    }

    private getChangePreview(change: ChangeNode, text: string): string {
        let raw: string;
        switch (change.type) {
            case ChangeType.Substitution:
                raw = [change.originalText ?? '', change.modifiedText ?? '']
                    .filter(Boolean)
                    .join(' \u2192 ');
                break;
            case ChangeType.Insertion:
                raw = change.modifiedText ?? '';
                break;
            case ChangeType.Deletion:
                raw = change.originalText ?? '';
                break;
            case ChangeType.Comment:
                raw = change.metadata?.comment
                    ?? change.originalText
                    ?? '';
                break;
            case ChangeType.Highlight:
                raw = change.originalText ?? '';
                break;
            default:
                raw = text
                    .slice(change.contentRange.start, change.contentRange.end)
                    .replace(/\s+/g, ' ')
                    .trim();
        }
        raw = raw.replace(/\s+/g, ' ').trim();
        if (raw.length <= MAX_PREVIEW_LENGTH) {
            return raw || '(empty)';
        }
        return raw.slice(0, MAX_PREVIEW_LENGTH).trim() + ELLIPSIS;
    }

    private updateContent(): void {
        if (!this.webviewView) return;
        const state = this.buildState();
        const nonce = getNonce();
        this.webviewView.webview.html = generateReviewHtml(state, nonce);
    }
}

// ── HTML Generator ───────────────────────────────────────────────────────────

/** Exported for testing. */
export function generateReviewHtml(state: ReviewPanelState, nonce: string): string {
    const { trackingEnabled, viewMode, changes, hasActiveMarkdownEditor } = state;

    // Build summary
    const total = changes.length;
    const breakdown: Record<string, number> = {};
    for (const c of changes) {
        breakdown[c.type] = (breakdown[c.type] ?? 0) + 1;
    }
    const TYPE_ABBREV: Record<string, string> = {
        insertion: 'ins', deletion: 'del', substitution: 'sub',
        comment: 'cmt', highlight: 'hl',
    };
    const summaryParts = Object.entries(breakdown)
        .map(([type, count]) => `${count} ${TYPE_ABBREV[type.toLowerCase()] ?? type}`)
        .join(', ');
    const summaryText = total === 0
        ? 'No changes'
        : `${total} change${total === 1 ? '' : 's'} (${summaryParts})`;

    // Change cards
    const cardsHtml = changes.length === 0
        ? `<div class="empty-changes">
            <p>No changes in this document.</p>
            ${!trackingEnabled ? `<button class="btn btn-primary" id="emptyEnableTracking">Enable Tracking</button>` : ''}
        </div>`
        : changes.map(c => `
            <div class="change-card ${c.colorClass}" data-id="${escapeHtml(c.id)}" tabindex="0" role="button"
                 title="${escapeHtml(c.text)}">
                <div class="card-header">
                    <span class="type-badge ${c.colorClass}">${escapeHtml(c.type)}</span>
                    <span class="status-badge ${c.status}">${escapeHtml(c.status)}</span>
                </div>
                <div class="card-text">${escapeHtml(c.text)}</div>
                ${c.author ? `<div class="card-author">${escapeHtml(c.author)}</div>` : ''}
                <div class="card-actions">
                    <button class="icon-btn accept-btn" data-action="acceptChange" data-id="${escapeHtml(c.id)}" title="Accept">\u2713</button>
                    <button class="icon-btn reject-btn" data-action="rejectChange" data-id="${escapeHtml(c.id)}" title="Reject">\u2717</button>
                </div>
            </div>
        `).join('');

    const noEditorOverlay = !hasActiveMarkdownEditor
        ? '<div class="overlay">Open a markdown file to see changes</div>'
        : '';

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <style nonce="${nonce}">
        /* ── Base ────────────────────────────────────── */
        html, body {
            height: 100%;
            margin: 0;
            padding: 0;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-sideBar-background);
        }
        .panel {
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
        }

        /* ── Zone: Configure ─────────────────────────── */
        .zone {
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, rgba(128,128,128,0.2)));
        }
        .zone-label {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 6px;
        }

        /* ── Tracking toggle (pill button) ──────────── */
        .toggle-btn {
            width: 100%; padding: 10px 16px; border: none; border-radius: 6px;
            font-size: 14px; font-weight: 600; cursor: pointer;
            display: flex; align-items: center; gap: 8px;
        }
        .toggle-on {
            background: var(--vscode-testing-iconPassed, #388E3C);
            color: white;
        }
        .toggle-off {
            background: var(--vscode-input-background);
            color: var(--vscode-foreground);
            border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
        }

        /* ── View mode 2x2 grid ─────────────────────── */
        .vm-label { font-size: 11px; text-transform: uppercase; color: var(--vscode-descriptionForeground); margin: 10px 0 6px; letter-spacing: 0.5px; }
        .vm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin: 0 -4px; }
        .vm-btn {
            padding: 6px 4px; border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
            border-radius: 4px; background: var(--vscode-input-background);
            color: var(--vscode-foreground); cursor: pointer; font-size: 11px;
            text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .vm-btn:hover { background: var(--vscode-list-hoverBackground); }
        .vm-btn:active { opacity: 0.7; transform: scale(0.97); }
        .vm-active {
            background: var(--vscode-button-background) !important;
            color: var(--vscode-button-foreground) !important;
            border-color: var(--vscode-button-background) !important;
            font-weight: 600;
        }

        /* ── Zone: Navigate + Bulk Act ────────────────── */
        .action-row {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .action-btn {
            padding: 2px 8px;
            border: 1px solid var(--vscode-button-secondaryBackground, var(--vscode-input-border, #555));
            border-radius: 3px;
            background: var(--vscode-button-secondaryBackground, transparent);
            color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
            cursor: pointer;
            font-size: 11px;
            line-height: 18px;
        }
        .action-btn:hover {
            background: var(--vscode-button-hoverBackground, var(--vscode-list-hoverBackground));
        }
        .action-btn:active {
            opacity: 0.7;
            transform: scale(0.97);
        }
        .action-btn.primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
        }
        .action-btn.primary:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .action-btn.danger {
            background: transparent;
            color: var(--vscode-errorForeground, #f44);
            border-color: var(--vscode-errorForeground, #f44);
        }
        .action-btn.danger:hover {
            background: var(--vscode-errorForeground, #f44);
            color: var(--vscode-editor-background, #fff);
        }
        .spacer { flex: 1; }

        /* ── Zone: Changes (collapsible) ─────────────── */
        .changes-header {
            display: flex;
            align-items: center;
            cursor: pointer;
            user-select: none;
            gap: 4px;
        }
        .changes-header:hover { opacity: 0.8; }
        .collapse-icon {
            font-size: 10px;
            transition: transform 0.15s ease;
            display: inline-block;
            width: 12px;
        }
        .collapse-icon.open { transform: rotate(90deg); }
        .summary-line {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
        .changes-scroll {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            padding: 0 12px 12px;
        }
        .changes-scroll.collapsed {
            display: none;
        }

        /* ── Change card ─────────────────────────────── */
        .change-card {
            padding: 6px 8px;
            margin-bottom: 4px;
            border-radius: 4px;
            border-left: 3px solid transparent;
            background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.08));
            cursor: pointer;
            position: relative;
        }
        .change-card:hover {
            background: var(--vscode-list-activeSelectionBackground, rgba(128,128,128,0.15));
        }
        .change-card:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        .change-card.insertion { border-left-color: ${CHANGE_COLORS.insertion.dark}; }
        .change-card.deletion  { border-left-color: ${CHANGE_COLORS.deletion.dark}; }
        .change-card.substitution { border-left-color: #64B5F6; }
        .change-card.highlight { border-left-color: #ffeb3b; }
        .change-card.comment   { border-left-color: #64b5f6; }

        .card-header {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 2px;
        }
        .type-badge {
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 1px 4px;
            border-radius: 2px;
            background: rgba(128,128,128,0.15);
        }
        .type-badge.insertion { color: ${CHANGE_COLORS.insertion.dark}; }
        .type-badge.deletion  { color: ${CHANGE_COLORS.deletion.dark}; }
        .type-badge.substitution { color: #64B5F6; }
        .type-badge.highlight { color: #ffeb3b; }
        .type-badge.comment   { color: #64b5f6; }

        .status-badge {
            font-size: 9px;
            padding: 1px 4px;
            border-radius: 2px;
            background: rgba(128,128,128,0.1);
            color: var(--vscode-descriptionForeground);
        }
        .status-badge.accepted { color: ${CHANGE_COLORS.insertion.dark}; }
        .status-badge.rejected { color: ${CHANGE_COLORS.deletion.dark}; }

        .card-text {
            font-size: 12px;
            line-height: 1.4;
            word-break: break-word;
            color: var(--vscode-foreground);
        }
        .card-author {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            margin-top: 2px;
        }
        .card-actions {
            position: absolute;
            top: 4px;
            right: 4px;
            display: none;
            gap: 2px;
        }
        .change-card:hover .card-actions {
            display: flex;
        }
        .icon-btn {
            width: 18px;
            height: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: none;
            border-radius: 3px;
            background: var(--vscode-button-secondaryBackground, rgba(128,128,128,0.2));
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 12px;
            padding: 0;
        }
        .icon-btn:hover {
            background: var(--vscode-button-hoverBackground, rgba(128,128,128,0.4));
        }
        .accept-btn:hover { color: ${CHANGE_COLORS.insertion.dark}; }
        .reject-btn:hover { color: ${CHANGE_COLORS.deletion.dark}; }

        /* ── Empty state / overlay ────────────────────── */
        .empty-changes {
            text-align: center;
            padding: 24px 12px;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
        .empty-changes p { margin: 0 0 12px; }
        .btn {
            padding: 6px 14px; border: none; border-radius: 4px;
            cursor: pointer; font-size: 12px;
        }
        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-primary:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .overlay {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--vscode-sideBar-background);
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            z-index: 10;
            padding: 16px;
            text-align: center;
            word-wrap: break-word;
        }

        /* ── Export footer ──────────────────────────────── */
        .export-footer {
            margin-top: auto;
            padding: 12px;
            border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, rgba(128,128,128,0.2)));
        }
        .export-btn {
            width: 100%;
            padding: 7px 12px;
            border: none;
            border-radius: 4px;
            background: var(--vscode-button-secondaryBackground, rgba(128,128,128,0.2));
            color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }
        .export-btn:hover {
            background: var(--vscode-button-hoverBackground, rgba(128,128,128,0.35));
        }
        .export-btn:active {
            opacity: 0.7;
            transform: scale(0.98);
        }
    </style>
</head>
<body>
    <div class="panel">
        ${noEditorOverlay}

        <!-- Zone 1: Configure -->
        <div class="zone">
            <div class="zone-label">Configure</div>
            <button class="toggle-btn ${trackingEnabled ? 'toggle-on' : 'toggle-off'}" id="trackingToggle">
                <span class="toggle-dot">${trackingEnabled ? '\u25CF' : '\u25CB'}</span>
                Track Changes: ${trackingEnabled ? 'ON' : 'OFF'}
            </button>
            <div class="vm-label">View</div>
            <div class="vm-grid">
                <button class="vm-btn ${viewMode === 'review' ? 'vm-active' : ''}" data-mode="review">All Markup</button>
                <button class="vm-btn ${viewMode === 'changes' ? 'vm-active' : ''}" data-mode="changes">Simple</button>
                <button class="vm-btn ${viewMode === 'settled' ? 'vm-active' : ''}" data-mode="settled">Final</button>
                <button class="vm-btn ${viewMode === 'raw' ? 'vm-active' : ''}" data-mode="raw">Original</button>
            </div>
        </div>

        <!-- Zone 2: Navigate -->
        <div class="zone">
            <div class="zone-label">Navigate</div>
            <div class="action-row">
                <button class="action-btn" id="prevBtn" title="Previous change">\u25C0 Prev</button>
                <button class="action-btn" id="nextBtn" title="Next change">Next \u25B6</button>
            </div>
        </div>

        <!-- Zone 3: Bulk Act -->
        <div class="zone">
            <div class="zone-label">Bulk Actions</div>
            <div class="action-row">
                <button class="action-btn primary" id="acceptAllBtn">Accept All</button>
                <button class="action-btn danger" id="rejectAllBtn">Reject All</button>
            </div>
        </div>

        <!-- Zone 4: Changes (collapsed by default) -->
        <div class="zone" style="border-bottom: none; padding-bottom: 0;">
            <div class="changes-header" id="changesToggle" role="button" aria-expanded="false" tabindex="0">
                <span class="collapse-icon" id="collapseIcon">\u25B6</span>
                <span class="zone-label" style="margin-bottom: 0;">Changes</span>
            </div>
            <div class="summary-line">${escapeHtml(summaryText)}</div>
        </div>
        <div class="changes-scroll collapsed" id="changesList">
            ${cardsHtml}
        </div>

        <!-- Export footer -->
        <div class="export-footer">
            <button class="export-btn" id="exportDocxBtn" title="Export current document to Word (.docx)">
                \u2B07 Export to DOCX
            </button>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        function send(command, data) {
            if (data) {
                vscode.postMessage({ command, ...data });
            } else {
                vscode.postMessage({ command });
            }
        }

        // Changes section collapse/expand
        const changesToggle = document.getElementById('changesToggle');
        const changesList = document.getElementById('changesList');
        const collapseIcon = document.getElementById('collapseIcon');
        if (changesToggle && changesList && collapseIcon) {
            changesToggle.addEventListener('click', () => {
                const isCollapsed = changesList.classList.toggle('collapsed');
                collapseIcon.classList.toggle('open', !isCollapsed);
                changesToggle.setAttribute('aria-expanded', String(!isCollapsed));
            });
            changesToggle.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    changesToggle.click();
                }
            });
        }

        // Configure zone: tracking toggle
        document.getElementById('trackingToggle')?.addEventListener('click', () => {
            send('toggleTracking');
        });
        document.getElementById('emptyEnableTracking')?.addEventListener('click', () => {
            send('toggleTracking');
        });

        // Configure zone: view mode buttons
        document.querySelectorAll('.vm-btn[data-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.getAttribute('data-mode');
                if (mode) send('setViewMode', { mode });
            });
        });

        // Navigate zone
        document.getElementById('prevBtn')?.addEventListener('click', () => {
            send('prevChange');
        });
        document.getElementById('nextBtn')?.addEventListener('click', () => {
            send('nextChange');
        });

        // Bulk Act zone
        document.getElementById('acceptAllBtn')?.addEventListener('click', () => {
            send('acceptAll');
        });
        document.getElementById('rejectAllBtn')?.addEventListener('click', () => {
            send('rejectAll');
        });

        // Change cards: click to reveal, action buttons for accept/reject
        document.querySelectorAll('.change-card').forEach(card => {
            card.addEventListener('click', (e) => {
                // Don't navigate if clicking an action button
                if (e.target.closest('.icon-btn')) return;
                const id = card.getAttribute('data-id');
                if (id) send('revealChange', { value: id });
            });
        });

        // Export to DOCX
        document.getElementById('exportDocxBtn')?.addEventListener('click', () => {
            send('exportToDocx');
        });

        document.querySelectorAll('.icon-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.getAttribute('data-action');
                const id = btn.getAttribute('data-id');
                if (action && id) vscode.postMessage({ command: action, value: id });
            });
        });
    </script>
</body>
</html>`;
}

// ── Utilities ────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
