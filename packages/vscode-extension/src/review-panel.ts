/**
 * Review Panel Provider — WebviewView replacing the old TreeView changes panel.
 *
 * Renders four cognitive zones:
 *   1. Configure (tracking toggle + view mode selector)
 *   2. Navigate (prev/next)
 *   3. Bulk Act (accept all / reject all)
 *   4. Changes (summary + filter bar + scrollable change cards)
 */

import * as vscode from 'vscode';
import { ChangeNode, ChangeType, isGhostNode } from '@changedown/core';
import { ViewMode } from './view-mode';
import { typeLabel } from './visual-semantics';
import { resolveAuthorIdentity } from './author-identity';

// ── Constants ────────────────────────────────────────────────────────────────

const REFRESH_DEBOUNCE_MS = 80;

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReviewPanelState {
    trackingEnabled: boolean;
    viewMode: ViewMode;
    changes: ChangeCardData[];
    hasActiveMarkdownEditor: boolean;
    activeFilter: 'all' | 'proposed' | 'accepted' | 'rejected' | 'consumed';
    activeGrouping: 'flat' | 'by-author' | 'by-type' | 'by-status';
    activeSorting: 'document-order' | 'date' | 'status';
}

export interface ChangeCardData {
    id: string;
    type: string;
    text: string;          // truncated preview (MAX 60 chars)
    fullText: string;      // full change text for expanded view
    author: string;
    status: string;
    colorClass: string;
    replyCount: number;
    hasDiscussion: boolean;
    isResolved: boolean;
    hasRequestChanges: boolean;
    hasAmendments: boolean;
    isOwnChange: boolean;
    date: string;
    discussionPreview: string[];
    approvalSummary: string;
    consumedBy?: string;
    discussionFull: Array<{ author: string; date: string; text: string; depth?: number; label?: string }>;
}

export interface StateDiff {
    hasChanges: boolean;
    added: ChangeCardData[];
    removed: string[];
    updated: Array<{ card: ChangeCardData; html: string }>;
    trackingEnabled?: boolean;
    viewMode?: ViewMode;
}

export interface ReviewPanelContext {
    getChanges(): ChangeNode[];
    getDocumentText(): string;
    trackingMode: boolean;
    viewMode: ViewMode;
    onDidChangeChanges(listener: (uris: vscode.Uri[]) => void): vscode.Disposable;
}

// ── Color class mapping ──────────────────────────────────────────────────────

export function colorClassForType(type: ChangeType): string {
    switch (type) {
        case ChangeType.Insertion: return 'insertion';
        case ChangeType.Deletion: return 'deletion';
        case ChangeType.Substitution: return 'substitution';
        case ChangeType.Highlight: return 'highlight';
        case ChangeType.Comment: return 'comment';
    }
}

// ── Change preview extraction ───────────────────────────────────────────────

const MAX_PREVIEW_LENGTH = 60;
const ELLIPSIS = '\u2026';

/** Extract preview text from a ChangeNode for display in cards. */
export function getChangePreview(change: ChangeNode, text: string): string {
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

/** Extract full (un-truncated) text from a ChangeNode for display in expanded cards. */
export function getFullChangeText(change: ChangeNode, text: string): string {
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
            raw = change.metadata?.comment ?? change.originalText ?? '';
            break;
        case ChangeType.Highlight:
            raw = change.originalText ?? '';
            break;
        default:
            raw = text.slice(change.contentRange.start, change.contentRange.end).replace(/\s+/g, ' ').trim();
    }
    return raw.replace(/\s+/g, ' ').trim() || '(empty)';
}

// ── Card data builder ───────────────────────────────────────────────────────

/** Strip leading @ from author to avoid @@ when we prepend @ in templates. */
function stripLeadingAt(author: string): string {
    return (author ?? '').replace(/^@/, '');
}

/** Build ChangeCardData[] from parsed ChangeNodes. */
export function buildCardData(changes: ChangeNode[], text: string, currentAuthor?: string): ChangeCardData[] {
    return changes
        .filter(c => !isGhostNode(c))
        .map(c => ({
        id: c.id,
        type: typeLabel(c.type),
        text: getChangePreview(c, text),
        fullText: getFullChangeText(c, text),
        author: stripLeadingAt(c.metadata?.author ?? ''),
        status: (c.metadata?.status ?? c.inlineMetadata?.status ?? c.status ?? 'proposed').toLowerCase(),
        colorClass: colorClassForType(c.type),
        replyCount: c.metadata?.discussion?.length ?? 0,
        hasDiscussion: (c.metadata?.discussion?.length ?? 0) > 0,
        isResolved: c.metadata?.resolution?.type === 'resolved',
        hasRequestChanges: (c.metadata?.requestChanges?.length ?? 0) > 0,
        hasAmendments: (c.metadata?.revisions?.length ?? 0) > 0,
        consumedBy: c.consumedBy,
        isOwnChange: (c.metadata?.author ?? '') === (currentAuthor ?? ''),
        date: c.metadata?.date ?? '',
        discussionPreview: (c.metadata?.discussion ?? []).slice(0, 3).map((d: any) =>
            `@${stripLeadingAt(d.author)}: ${(d.text ?? '').substring(0, 80)}`
        ),
        approvalSummary: c.metadata?.approvals?.[0]
            ? `Approved by @${stripLeadingAt(c.metadata.approvals[0].author)}`
            : c.metadata?.rejections?.[0]
            ? `Rejected by @${stripLeadingAt(c.metadata.rejections[0].author)}`
            : '',
        discussionFull: (c.metadata?.discussion ?? []).map((d: any) => ({
            author: stripLeadingAt(d.author ?? ''),
            date: d.timestamp?.date ?? d.date ?? '',
            text: d.text ?? '',
            depth: d.depth,
            label: d.label,
        })),
    }));
}

// ── Filter / Sort / Group helpers ────────────────────────────────────────────

function filterCards(
    cards: ChangeCardData[],
    filter: 'all' | 'proposed' | 'accepted' | 'rejected' | 'consumed',
): ChangeCardData[] {
    switch (filter) {
        case 'proposed':    return cards.filter(c => c.status === 'proposed' && !c.consumedBy);
        case 'accepted':    return cards.filter(c => c.status === 'accepted' && !c.consumedBy);
        case 'rejected':    return cards.filter(c => c.status === 'rejected' && !c.consumedBy);
        case 'consumed':    return cards.filter(c => c.consumedBy != null);
        default:            return cards;
    }
}

function sortCards(cards: ChangeCardData[], sorting: string): ChangeCardData[] {
    const sorted = [...cards];
    switch (sorting) {
        case 'date':
            sorted.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
            break;
        case 'status': {
            const order: Record<string, number> = { proposed: 0, 'request-changes': 1, accepted: 2, rejected: 3 };
            sorted.sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));
            break;
        }
        // 'document-order' — preserve original array order
    }
    return sorted;
}

function groupCards(
    cards: ChangeCardData[],
    grouping: 'flat' | 'by-author' | 'by-type' | 'by-status',
): Map<string, ChangeCardData[]> {
    if (grouping === 'flat') {
        return new Map([['', cards]]);
    }
    const groups = new Map<string, ChangeCardData[]>();
    for (const card of cards) {
        const key = grouping === 'by-author' ? (card.author || '(unknown)')
                  : grouping === 'by-type'   ? card.type
                  : card.status;
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)!.push(card);
    }
    return groups;
}

// ── Provider ─────────────────────────────────────────────────────────────────

export class ReviewPanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    private webviewView: vscode.WebviewView | undefined;
    private disposables: vscode.Disposable[] = [];
    private refreshTimeout: ReturnType<typeof setTimeout> | null = null;
    private lastState: ReviewPanelState | null = null;

    private activeFilter: 'all' | 'proposed' | 'accepted' | 'rejected' | 'consumed' = 'all';
    private activeGrouping: 'flat' | 'by-author' | 'by-type' | 'by-status' = 'flat';
    private activeSorting: 'document-order' | 'date' | 'status' = 'document-order';

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
        // to the ChangeDown sidebar after viewing Explorer or another panel).
        this.disposables.push(
            webviewView.onDidChangeVisibility(() => {
                if (webviewView.visible) {
                    // Force full rebuild when panel becomes visible again
                    this.lastState = null;
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

    private handleMessage(msg: { command: string; value?: string; mode?: string; id?: string; filter?: string; grouping?: string; sorting?: string }): void {
        switch (msg.command) {
            case 'toggleTracking':
                vscode.commands.executeCommand('changedown.toggleTracking');
                this.scheduleRefresh();
                break;
            case 'setViewMode':
                vscode.commands.executeCommand('changedown.setViewMode', msg.mode ?? msg.value);
                this.scheduleRefresh();
                break;
            case 'prevChange':
                vscode.commands.executeCommand('changedown.previousChange');
                break;
            case 'nextChange':
                vscode.commands.executeCommand('changedown.nextChange');
                break;
            case 'acceptAll':
                vscode.commands.executeCommand('changedown.acceptAll');
                break;
            case 'rejectAll':
                vscode.commands.executeCommand('changedown.rejectAll');
                break;
            case 'revealChange':
                if (msg.value) {
                    vscode.commands.executeCommand('changedown.revealChange', msg.value);
                }
                break;
            case 'acceptChange':
                if (msg.value) {
                    vscode.commands.executeCommand('changedown.acceptChange', msg.value);
                }
                break;
            case 'rejectChange':
                if (msg.value) {
                    vscode.commands.executeCommand('changedown.rejectChange', msg.value);
                }
                break;
            case 'replyToChange':
                if (msg.id) {
                    vscode.commands.executeCommand('changedown.revealChange', msg.id)
                        .then(() => vscode.commands.executeCommand('changedown.addComment'));
                }
                break;
            case 'resolveChange':
                if (msg.id) {
                    vscode.commands.executeCommand('changedown.resolveByChangeId', msg.id);
                }
                break;
            case 'unresolveChange':
                if (msg.id) {
                    vscode.commands.executeCommand('changedown.unresolveByChangeId', msg.id);
                }
                break;
            case 'requestChanges':
                if (msg.id) {
                    vscode.commands.executeCommand('changedown.requestChanges', msg.id);
                }
                break;
            case 'amendChange':
                if (msg.id) {
                    vscode.commands.executeCommand('changedown.amendChange', msg.id);
                }
                break;
            case 'supersedeChange':
                if (msg.id) {
                    vscode.commands.executeCommand('changedown.supersedeChange', msg.id);
                }
                break;
            case 'openMarkdownPreview':
                vscode.commands.executeCommand('markdown.showPreviewToSide');
                break;
            case 'exportToDocx':
                vscode.commands.executeCommand('changedown.exportToDocx');
                break;
            case 'setFilter':
                if (msg.filter) {
                    this.activeFilter = msg.filter as typeof this.activeFilter;
                    this.refresh();
                }
                break;
            case 'setGrouping':
                if (msg.grouping) {
                    this.activeGrouping = msg.grouping as typeof this.activeGrouping;
                    this.refresh();
                }
                break;
            case 'setSorting':
                if (msg.sorting) {
                    this.activeSorting = msg.sorting as typeof this.activeSorting;
                    this.refresh();
                }
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

        const currentAuthor = resolveAuthorIdentity();
        const cards = buildCardData(changes, text, currentAuthor);

        return {
            trackingEnabled: this.ctx.trackingMode,
            viewMode: this.ctx.viewMode,
            changes: cards,
            hasActiveMarkdownEditor: hasActiveMarkdownEditor ?? false,
            activeFilter: this.activeFilter,
            activeGrouping: this.activeGrouping,
            activeSorting: this.activeSorting,
        };
    }

    private computeStateDiff(oldState: ReviewPanelState, newState: ReviewPanelState): StateDiff {
        const added: ChangeCardData[] = [];
        const removed: string[] = [];
        const updated: Array<{ card: ChangeCardData; html: string }> = [];

        // Apply filter/sort pipeline to get the cards that are actually rendered
        const oldRendered = sortCards(filterCards(oldState.changes, oldState.activeFilter), oldState.activeSorting);
        const newRendered = sortCards(filterCards(newState.changes, newState.activeFilter), newState.activeSorting);

        const oldMap = new Map(oldRendered.map(c => [c.id, c]));
        const newMap = new Map(newRendered.map(c => [c.id, c]));

        for (const [id, card] of newMap) {
            if (!oldMap.has(id)) {
                added.push(card);
            } else if (JSON.stringify(oldMap.get(id)) !== JSON.stringify(card)) {
                updated.push({ card, html: buildCardHtml(card) });
            }
        }
        for (const id of oldMap.keys()) {
            if (!newMap.has(id)) {
                removed.push(id);
            }
        }

        // Detect structural changes that require full rebuild
        const filterChanged = oldState.activeFilter !== newState.activeFilter;
        const groupingChanged = oldState.activeGrouping !== newState.activeGrouping;
        const sortingChanged = oldState.activeSorting !== newState.activeSorting;
        const editorChanged = oldState.hasActiveMarkdownEditor !== newState.hasActiveMarkdownEditor;

        // If filter/grouping/sorting/editor-state changed, force full rebuild
        if (filterChanged || groupingChanged || sortingChanged || editorChanged) {
            return {
                hasChanges: true,
                added: [],
                removed: [],
                updated: [],
                // Signal full rebuild by leaving added/removed/updated empty but hasChanges true
                // The caller checks for this via the trackingEnabled/viewMode fields being set
                // along with no card diffs — we use a different approach: force full rebuild
                trackingEnabled: newState.trackingEnabled !== oldState.trackingEnabled ? newState.trackingEnabled : undefined,
                viewMode: newState.viewMode !== oldState.viewMode ? newState.viewMode : undefined,
            };
        }

        return {
            hasChanges: added.length > 0 || removed.length > 0 || updated.length > 0
                || newState.trackingEnabled !== oldState.trackingEnabled
                || newState.viewMode !== oldState.viewMode,
            added,
            removed,
            updated,
            trackingEnabled: newState.trackingEnabled !== oldState.trackingEnabled ? newState.trackingEnabled : undefined,
            viewMode: newState.viewMode !== oldState.viewMode ? newState.viewMode : undefined,
        };
    }

    private updateContent(): void {
        if (!this.webviewView) return;
        const newState = this.buildState();

        if (this.lastState) {
            const diff = this.computeStateDiff(this.lastState, newState);
            if (!diff.hasChanges) {
                return; // Nothing changed, skip update
            }

            // If filter/grouping/sorting/editor changed, or this is a structural change,
            // fall through to full rebuild. Detect by: card diffs are empty but hasChanges is true
            // and it's not just a tracking/viewMode toggle.
            const hasCardDiffs = diff.added.length > 0 || diff.removed.length > 0 || diff.updated.length > 0;
            const hasMetaOnly = diff.trackingEnabled !== undefined || diff.viewMode !== undefined;

            if (hasCardDiffs || hasMetaOnly) {
                // Try incremental update
                const addedWithHtml = diff.added.map(card => ({
                    id: card.id,
                    html: buildCardHtml(card),
                }));
                this.webviewView.webview.postMessage({
                    type: 'incrementalUpdate',
                    diff: {
                        added: addedWithHtml,
                        removed: diff.removed,
                        updated: diff.updated.map(u => ({
                            id: u.card.id,
                            html: u.html,
                        })),
                        trackingEnabled: diff.trackingEnabled,
                        viewMode: diff.viewMode,
                    },
                });
                this.lastState = newState;
                return;
            }
            // else: structural change (filter/grouping/sorting changed) — full rebuild below
        }

        // Full rebuild (first render or structural change)
        const nonce = getNonce();
        this.webviewView.webview.html = generateReviewHtml(newState, nonce);
        this.lastState = newState;
    }

    /** Notify the webview of the currently active change (cursor is inside it). */
    public setActiveChangeId(id: string | null): void {
        if (this.webviewView?.visible) {
            this.webviewView.webview.postMessage({ type: 'activeChange', id: id ?? '' });
        }
    }
}

// ── Card HTML builder (module-level for reuse in incremental updates) ────────

/** Build HTML string for a single change card. */
export function buildCardHtml(c: ChangeCardData): string {
        // Build thread HTML for expanded view
        const threadRepliesHtml = c.discussionFull.length > 0
            ? c.discussionFull.map(d => `
                <div class="thread-reply">
                    <div class="thread-reply-author">@${escapeHtml(d.author)} \u00B7 ${escapeHtml(d.date)}${d.label ? `<span class="thread-reply-label">${escapeHtml(d.label)}</span>` : ''}</div>
                    <div class="thread-reply-text">${escapeHtml(d.text)}</div>
                </div>
            `).join('')
            : '';

        // Thread actions — only visible when expanded
        const threadActionsHtml = `
            <div class="thread-actions">
                <button class="thread-action-btn" data-lifecycle="replyToChange" data-id="${escapeHtml(c.id)}" title="Reply to this change">Reply</button>
                ${c.isResolved
                    ? `<button class="thread-action-btn" data-lifecycle="unresolveChange" data-id="${escapeHtml(c.id)}" title="Reopen discussion">Unresolve</button>`
                    : `<button class="thread-action-btn" data-lifecycle="resolveChange" data-id="${escapeHtml(c.id)}" title="Mark discussion as resolved">Resolve</button>`
                }
                ${c.isOwnChange
                    ? `<button class="thread-action-btn" data-lifecycle="amendChange" data-id="${escapeHtml(c.id)}" title="Amend this change">Amend</button>`
                    : (c.status === 'proposed'
                        ? `<button class="thread-action-btn" data-lifecycle="supersedeChange" data-id="${escapeHtml(c.id)}" title="Propose an alternative">Supersede</button>`
                        : '')
                }
            </div>
        `;

        const threadHtml = `
            <div class="card-thread">
                ${threadRepliesHtml}
                ${threadActionsHtml}
            </div>
        `;

        const consumedAttr = c.consumedBy ? ` data-consumed="${escapeHtml(c.consumedBy)}"` : '';
        const consumedBadgeHtml = c.consumedBy
            ? `<span class="consumed-badge">consumed by ${escapeHtml(c.consumedBy)}</span>`
            : '';

        return `
            <div class="change-card ${c.colorClass}" data-id="${escapeHtml(c.id)}" data-card-id="${escapeHtml(c.id)}"${consumedAttr} data-expanded="false" aria-expanded="false" tabindex="0" role="button"
                 title="${escapeHtml(c.text)}">
                <div class="card-header">
                    <span class="type-badge ${c.colorClass}">${escapeHtml(c.type)}</span>
                    <span class="status-badge ${c.status}">${escapeHtml(c.status)}</span>
                    ${c.hasAmendments ? '<span class="badge-indicator amended" title="Has amendments">\u270E</span>' : ''}
                    ${c.hasRequestChanges ? '<span class="badge-indicator changes-requested" title="Changes requested">\u26A0</span>' : ''}
                    ${c.isResolved ? '<span class="badge-indicator resolved" title="Resolved">\u2714</span>' : ''}
                    ${consumedBadgeHtml}
                </div>
                <div class="card-text">${escapeHtml(c.text)}</div>
                <div class="card-text-full">${escapeHtml(c.fullText)}</div>
                ${c.author ? `<div class="card-meta"><span class="card-author">${escapeHtml(c.author)}</span>${c.replyCount > 0 ? `<span class="card-replies">\uD83D\uDCAC ${c.replyCount}</span>` : ''}</div>` : (c.replyCount > 0 ? `<div class="card-meta"><span class="card-replies">\uD83D\uDCAC ${c.replyCount}</span></div>` : '')}
                ${c.consumedBy
                    ? `<div class="card-actions">
                           <button class="icon-btn" data-action="jumpToFootnote" data-id="${escapeHtml(c.consumedBy)}" title="Go to ${escapeHtml(c.consumedBy)}">&#x2192;</button>
                           <button class="icon-btn" data-action="compactChange" data-id="${escapeHtml(c.id)}" title="Compact">&#x2716;</button>
                       </div>`
                    : `<div class="card-actions">
                           <button class="icon-btn accept-btn" data-action="acceptChange" data-id="${escapeHtml(c.id)}" title="Accept">\u2713</button>
                           <button class="icon-btn reject-btn" data-action="rejectChange" data-id="${escapeHtml(c.id)}" title="Reject">\u2717</button>
                       </div>`}
                ${threadHtml}
            </div>
        `;
}

// ── HTML Generator ───────────────────────────────────────────────────────────

/** Exported for testing. */
export function generateReviewHtml(state: ReviewPanelState, nonce: string): string {
    const {
        trackingEnabled, viewMode, changes, hasActiveMarkdownEditor,
        activeFilter, activeGrouping, activeSorting,
    } = state;

    // Pipeline: filter -> sort -> group
    const filtered = filterCards(changes, activeFilter);
    const sorted = sortCards(filtered, activeSorting);
    const grouped = groupCards(sorted, activeGrouping);

    // Build summary from unfiltered changes
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

    // Build filter bar
    // Count changes by status
    const statusCounts: Record<string, number> = { all: changes.length, proposed: 0, accepted: 0, rejected: 0, consumed: 0 };
    for (const c of changes) {
        if (c.consumedBy) {
            statusCounts.consumed++;
        } else {
            const s = c.status.toLowerCase();
            if (s in statusCounts) { statusCounts[s]++; }
        }
    }

    const filterLabels: Array<{ value: string; label: string }> = [
        { value: 'all', label: `All (${statusCounts.all})` },
        { value: 'proposed', label: `Proposed (${statusCounts.proposed})` },
        { value: 'accepted', label: `Accepted (${statusCounts.accepted})` },
        { value: 'rejected', label: `Rejected (${statusCounts.rejected})` },
        { value: 'consumed', label: `Consumed (${statusCounts.consumed})` },
    ];
    const filterTooltips: Record<string, string> = {
        all: 'Show all changes',
        proposed: 'Show proposed changes',
        accepted: 'Show accepted changes',
        rejected: 'Show rejected changes',
        consumed: 'Show consumed changes',
    };
    const filterBtnsHtml = filterLabels.map(f =>
        `<button class="filter-btn${activeFilter === f.value ? ' active' : ''}" data-filter="${f.value}" title="${filterTooltips[f.value] ?? ''}">${f.label}</button>`
    ).join('');

    // Build grouping dropdown
    const groupingOptions = [
        { value: 'flat', label: 'No grouping' },
        { value: 'by-author', label: 'By Author' },
        { value: 'by-type', label: 'By Type' },
        { value: 'by-status', label: 'By Status' },
    ];
    const groupingSelectHtml = `<select class="control-select" id="groupingSelect">
        ${groupingOptions.map(o =>
            `<option value="${o.value}"${activeGrouping === o.value ? ' selected' : ''}>${o.label}</option>`
        ).join('')}
    </select>`;

    // Build sorting dropdown
    const sortingOptions = [
        { value: 'document-order', label: 'Document Order' },
        { value: 'date', label: 'Date' },
        { value: 'status', label: 'Status' },
    ];
    const sortingSelectHtml = `<select class="control-select" id="sortingSelect">
        ${sortingOptions.map(o =>
            `<option value="${o.value}"${activeSorting === o.value ? ' selected' : ''}>${o.label}</option>`
        ).join('')}
    </select>`;

    // Render grouped cards
    let cardsHtml: string;
    if (sorted.length === 0) {
        const noChangesAtAll = changes.length === 0;
        cardsHtml = `<div class="empty-changes">
            <p>${noChangesAtAll ? 'No changes in this document.' : 'No changes match the current filter.'}</p>
            ${noChangesAtAll && !trackingEnabled ? `<button class="btn btn-primary" id="emptyEnableTracking">Enable Tracking</button>` : ''}
        </div>`;
    } else {
        const parts: string[] = [];
        for (const [groupKey, groupItems] of grouped) {
            if (groupKey) {
                parts.push(`<div class="group-header">${escapeHtml(groupKey)}</div>`);
            }
            for (const c of groupItems) {
                parts.push(buildCardHtml(c));
            }
        }
        cardsHtml = parts.join('');
    }

    const noEditorOverlay = !hasActiveMarkdownEditor
        ? '<div class="overlay">Open a markdown file to see changes</div>'
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <style nonce="${nonce}">
        /* Base */
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

        /* Zone: Configure */
        .zone {
            padding: 5px 10px;
            border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, rgba(128,128,128,0.2)));
        }
        .zone-label {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 3px;
        }

        /* Tracking toggle */
        .toggle-btn {
            width: 100%; padding: 5px 10px; border: none; border-radius: 4px;
            font-size: 12px; font-weight: 600; cursor: pointer;
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

        /* View mode 2x2 grid */
        .vm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; margin-top: 5px; }
        .vm-btn {
            padding: 3px 4px; border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
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

        /* Zone: Navigate + Bulk Act */
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

        /* Zone: Changes */
        .collapse-icon {
            font-size: 10px;
            transition: transform 0.15s ease;
            display: inline-block;
            width: 12px;
        }
        .collapse-icon.open { transform: rotate(90deg); }
        .summary-controls-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 6px;
            margin-top: 2px;
        }
        .summary-text {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            min-width: 0;
        }
        .changes-scroll {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            padding: 0 10px 8px;
        }
        .changes-scroll.collapsed {
            display: none;
        }

        /* Filter bar */
        .filter-bar {
            display: flex;
            flex-wrap: wrap;
            gap: 3px;
            padding: 4px 0 2px;
        }
        .filter-btn {
            padding: 2px 7px;
            border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
            border-radius: 10px;
            background: var(--vscode-input-background);
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 10px;
            line-height: 16px;
            white-space: nowrap;
        }
        .filter-btn:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .filter-btn.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
            font-weight: 600;
        }
        .filter-bar.compact .filter-btn:not(.active) {
            display: none;
        }
        .filter-bar.compact .filter-btn.active {
            cursor: pointer;
        }

        /* Controls row (grouping + sorting) */
        .controls-row {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 0 2px;
        }
        .control-select {
            flex: 1;
            font-size: 10px;
            padding: 2px 4px;
            border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
            border-radius: 3px;
            background: var(--vscode-input-background);
            color: var(--vscode-foreground);
            cursor: pointer;
            min-width: 0;
        }

        /* Group header */
        .group-header {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--vscode-descriptionForeground);
            padding: 8px 0 4px;
            border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.15));
            margin-bottom: 4px;
        }

        /* Change card */
        .change-card {
            padding: 5px 7px;
            margin-bottom: 3px;
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
        .change-card.insertion { border-left-color: var(--vscode-gitDecoration-addedResourceForeground, #66BB6A); }
        .change-card.deletion  { border-left-color: var(--vscode-gitDecoration-deletedResourceForeground, #EF5350); }
        .change-card.substitution { border-left-color: var(--vscode-gitDecoration-modifiedResourceForeground, #64B5F6); }
        .change-card.highlight { border-left-color: var(--vscode-editorWarning-foreground, #FDD835); }
        .change-card.comment   { border-left-color: var(--vscode-gitDecoration-modifiedResourceForeground, #64B5F6); }
        .change-card.card-active {
            outline: 1px solid var(--vscode-focusBorder, #007fd4);
            outline-offset: -1px;
        }
        .change-card[data-consumed] {
            opacity: 0.6;
        }
        .consumed-badge {
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }

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
        .type-badge.insertion { color: var(--vscode-gitDecoration-addedResourceForeground, #66BB6A); }
        .type-badge.deletion  { color: var(--vscode-gitDecoration-deletedResourceForeground, #EF5350); }
        .type-badge.substitution { color: var(--vscode-gitDecoration-modifiedResourceForeground, #64B5F6); }
        .type-badge.highlight { color: var(--vscode-editorWarning-foreground, #FDD835); }
        .type-badge.comment   { color: var(--vscode-gitDecoration-modifiedResourceForeground, #64B5F6); }

        .status-badge {
            font-size: 9px;
            padding: 1px 4px;
            border-radius: 2px;
            background: rgba(128,128,128,0.1);
            color: var(--vscode-descriptionForeground);
        }
        .status-badge.accepted { color: var(--vscode-gitDecoration-addedResourceForeground, #66BB6A); }
        .status-badge.rejected { color: var(--vscode-gitDecoration-deletedResourceForeground, #EF5350); }

        .card-text {
            font-size: 12px;
            line-height: 1.4;
            word-break: break-word;
            color: var(--vscode-foreground);
        }
        .card-meta {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 2px;
        }
        .card-author {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
        }
        .card-replies {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
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
        .accept-btn:hover { color: var(--vscode-gitDecoration-addedResourceForeground, #66BB6A); }
        .reject-btn:hover { color: var(--vscode-gitDecoration-deletedResourceForeground, #EF5350); }

        /* Expanded card */
        .change-card[data-expanded="true"] .card-text-full {
            display: block;
        }
        .change-card[data-expanded="true"] .card-text {
            display: none;
        }
        .change-card[data-expanded="true"] .card-actions {
            display: flex;
        }
        .card-text-full {
            display: none;
            font-size: 12px;
            line-height: 1.5;
            word-break: break-word;
            color: var(--vscode-foreground);
            white-space: pre-wrap;
            margin: 4px 0;
        }

        /* Thread display in expanded cards */
        .card-thread {
            display: none;
            margin-top: 6px;
            padding-top: 6px;
            border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.15));
        }
        .change-card[data-expanded="true"] .card-thread {
            display: block;
        }
        .thread-reply {
            margin-bottom: 6px;
            font-size: 11px;
        }
        .thread-reply-author {
            color: var(--vscode-descriptionForeground);
            font-size: 10px;
            margin-bottom: 1px;
        }
        .thread-reply-text {
            color: var(--vscode-foreground);
            padding-left: 8px;
            word-break: break-word;
        }
        .thread-reply-label {
            font-size: 9px;
            padding: 0 3px;
            border-radius: 2px;
            background: rgba(128,128,128,0.12);
            color: var(--vscode-descriptionForeground);
            margin-left: 4px;
        }
        .thread-actions {
            display: flex;
            gap: 6px;
            margin-top: 6px;
            padding-top: 4px;
            border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.1));
        }
        .thread-action-btn {
            padding: 2px 8px;
            border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
            border-radius: 3px;
            background: var(--vscode-input-background);
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 10px;
        }
        .thread-action-btn:hover {
            background: var(--vscode-list-hoverBackground);
        }

        /* Card header badge indicators */
        .badge-indicator {
            font-size: 9px;
            padding: 1px 3px;
            border-radius: 2px;
            background: rgba(128,128,128,0.1);
        }
        .badge-indicator.resolved { color: var(--vscode-gitDecoration-addedResourceForeground, #66BB6A); }
        .badge-indicator.amended { color: var(--vscode-gitDecoration-modifiedResourceForeground, #64B5F6); }
        .badge-indicator.changes-requested { color: var(--vscode-editorWarning-foreground, #FDD835); }

        /* Empty state / overlay */
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

        /* Controls disclosure */
        .controls-disclosure { margin: 0; flex-shrink: 0; }
        .controls-toggle {
            display: flex;
            align-items: center;
            gap: 4px;
            cursor: pointer;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            user-select: none;
            padding: 2px 0;
        }
        .controls-toggle:hover { color: var(--vscode-foreground); }
        .controls-body.collapsed { display: none; }
        .controls-body { padding: 6px 0 0 16px; }
        .controls-row { display: flex; gap: 6px; }

        /* Export footer */
        .export-footer {
            margin-top: auto;
            padding: 6px 10px;
            border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, rgba(128,128,128,0.2)));
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }
        .utility-btn {
            flex: 1 1 auto;
            min-width: 0;
            padding: 4px 8px;
            border: 1px solid transparent;
            border-radius: 3px;
            background: var(--vscode-button-secondaryBackground, rgba(128,128,128,0.2));
            color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
            cursor: pointer;
            font-size: 11px;
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .utility-btn:hover {
            background: var(--vscode-button-hoverBackground, rgba(128,128,128,0.35));
        }
        .utility-btn:active {
            opacity: 0.7;
            transform: scale(0.98);
        }
        .preview-btn {
            border-color: var(--vscode-textLink-foreground, #3794ff);
        }

    </style>
</head>
<body>
    <div class="panel">
        ${noEditorOverlay}

        <!-- Zone 1: Configure -->
        <div class="zone">
            <button class="toggle-btn ${trackingEnabled ? 'toggle-on' : 'toggle-off'}" id="trackingToggle" title="Toggle change tracking on/off">
                <span class="toggle-dot">${trackingEnabled ? '\u25CF' : '\u25CB'}</span>
                Track Changes: ${trackingEnabled ? 'ON' : 'OFF'}
            </button>
            <div class="zone-label">Views</div>
            <div class="vm-grid">
                <button class="vm-btn ${viewMode === 'review' ? 'vm-active' : ''}" data-mode="review" title="Show all markup">All Markup</button>
                <button class="vm-btn ${viewMode === 'changes' ? 'vm-active' : ''}" data-mode="changes" title="Hide delimiters">Simple</button>
                <button class="vm-btn ${viewMode === 'settled' ? 'vm-active' : ''}" data-mode="settled" title="Show final document">Final</button>
                <button class="vm-btn ${viewMode === 'raw' ? 'vm-active' : ''}" data-mode="raw" title="Show original document">Original</button>
            </div>
        </div>

        <!-- Zone 2: Navigate + Bulk Actions -->
        <div class="zone">
            <div class="action-row">
                <button class="action-btn" id="prevBtn" title="Previous change">\u25C0 Prev</button>
                <button class="action-btn" id="nextBtn" title="Next change">Next \u25B6</button>
                <span class="spacer"></span>
                <button class="action-btn primary" id="acceptAllBtn" title="Accept all changes in document">Accept All</button>
                <button class="action-btn danger" id="rejectAllBtn" title="Reject all changes in document">Reject All</button>
            </div>
        </div>

        <!-- Zone 4: Changes -->
        <div class="zone" style="border-bottom: none; padding-bottom: 0;">
            <div class="zone-label" style="margin-bottom: 0;">Changes</div>
            <div class="summary-controls-row">
                <span class="summary-text">${escapeHtml(summaryText)}</span>
                <div class="controls-disclosure">
                    <div class="controls-toggle" id="controlsToggle" role="button" tabindex="0">
                        <span class="collapse-icon" id="controlsCollapseIcon">&#9658;</span>
                        Grouping &amp; Sort
                    </div>
                    <div class="controls-body collapsed" id="controlsBody">
                        <div class="controls-row">
                            ${groupingSelectHtml}
                            ${sortingSelectHtml}
                        </div>
                    </div>
                </div>
            </div>
            <!-- Filter bar -->
            <div class="filter-bar${activeFilter === 'all' ? ' compact' : ''}" id="filterBar">
                ${filterBtnsHtml}
            </div>
        </div>
        <div class="changes-scroll" id="changesList">
            ${cardsHtml}
        </div>

        <!-- Export footer -->
        <div class="export-footer">
            <button class="utility-btn preview-btn" id="previewBtn" title="Open Markdown Preview to the Side">
                Open Markdown Preview
            </button>
            <button class="utility-btn export-btn" id="exportDocxBtn" title="Export current document to Word (.docx)">
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

        // Filter buttons — compact mode toggle
        const filterBar = document.getElementById('filterBar');
        document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.getAttribute('data-filter');
                if (!filter) return;

                // If clicking the active "All" pill in compact mode, just expand
                if (filter === 'all' && btn.classList.contains('active') && filterBar?.classList.contains('compact')) {
                    filterBar.classList.remove('compact');
                    return;
                }
                // If clicking "All" while expanded and already active, collapse back
                if (filter === 'all' && btn.classList.contains('active') && !filterBar?.classList.contains('compact')) {
                    filterBar?.classList.add('compact');
                    return;
                }

                send('setFilter', { filter });
            });
        });

        // Controls disclosure toggle
        const controlsToggle = document.getElementById('controlsToggle');
        const controlsBody = document.getElementById('controlsBody');
        const controlsIcon = document.getElementById('controlsCollapseIcon');
        if (controlsToggle && controlsBody && controlsIcon) {
            controlsToggle.addEventListener('click', () => {
                const isCollapsed = controlsBody.classList.toggle('collapsed');
                controlsIcon.classList.toggle('open', !isCollapsed);
                controlsToggle.setAttribute('aria-expanded', String(!isCollapsed));
            });
            controlsToggle.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    controlsToggle.click();
                }
            });
        }

        // Grouping dropdown
        document.getElementById('groupingSelect')?.addEventListener('change', (e) => {
            const grouping = e.target.value;
            if (grouping) send('setGrouping', { grouping });
        });

        // Sorting dropdown
        document.getElementById('sortingSelect')?.addEventListener('change', (e) => {
            const sorting = e.target.value;
            if (sorting) send('setSorting', { sorting });
        });

        // Change cards: click to expand/collapse, action buttons for accept/reject
        document.querySelectorAll('.change-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.icon-btn')) return;
                if (e.target.closest('.thread-action-btn')) return;
                const id = card.getAttribute('data-id');
                const isExpanded = card.getAttribute('data-expanded') === 'true';
                if (isExpanded) {
                    // Collapse — don't scroll editor
                    card.setAttribute('data-expanded', 'false');
                    card.setAttribute('aria-expanded', 'false');
                } else {
                    // Expand + scroll editor
                    card.setAttribute('data-expanded', 'true');
                    card.setAttribute('aria-expanded', 'true');
                    if (id) send('revealChange', { value: id });
                }
            });
        });

        // Open Markdown Preview
        document.getElementById('previewBtn')?.addEventListener('click', () => {
            send('openMarkdownPreview');
        });

        // Export to DOCX
        document.getElementById('exportDocxBtn')?.addEventListener('click', () => {
            send('exportToDocx');
        });

        document.querySelectorAll('.icon-btn, .thread-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.getAttribute('data-action');
                const lifecycle = btn.getAttribute('data-lifecycle');
                const id = btn.getAttribute('data-id');
                if (action && id) {
                    vscode.postMessage({ command: action, value: id });
                } else if (lifecycle && id) {
                    vscode.postMessage({ command: lifecycle, id });
                }
            });
        });

        // ── Incremental update support ──────────────────────────────────

        /** Attach click/action listeners to a card element (or all cards within a container). */
        function attachCardListeners(container) {
            const cards = container.querySelectorAll ? container.querySelectorAll('.change-card') : [container];
            cards.forEach(card => {
                if (!card.classList.contains('change-card')) return;
                card.addEventListener('click', (e) => {
                    if (e.target.closest('.icon-btn')) return;
                    if (e.target.closest('.thread-action-btn')) return;
                    const id = card.getAttribute('data-id');
                    const isExpanded = card.getAttribute('data-expanded') === 'true';
                    if (isExpanded) {
                        // Collapse — don't scroll editor
                        card.setAttribute('data-expanded', 'false');
                        card.setAttribute('aria-expanded', 'false');
                    } else {
                        // Expand + scroll editor
                        card.setAttribute('data-expanded', 'true');
                        card.setAttribute('aria-expanded', 'true');
                        if (id) send('revealChange', { value: id });
                    }
                });
            });
            const btns = container.querySelectorAll ? container.querySelectorAll('.icon-btn, .thread-action-btn') : [];
            btns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = btn.getAttribute('data-action');
                    const lifecycle = btn.getAttribute('data-lifecycle');
                    const id = btn.getAttribute('data-id');
                    if (action && id) {
                        vscode.postMessage({ command: action, value: id });
                    } else if (lifecycle && id) {
                        vscode.postMessage({ command: lifecycle, id });
                    }
                });
            });
        }

        /** Handle incremental updates from the extension host. */
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'activeChange') {
                // Remove previous active highlight
                document.querySelectorAll('.change-card.card-active').forEach(el => {
                    el.classList.remove('card-active');
                });
                // Add active highlight to matching card
                if (message.id) {
                    const card = document.querySelector('[data-card-id="' + CSS.escape(message.id) + '"]');
                    if (card) {
                        card.classList.add('card-active');
                        card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }
                }
            } else if (message.type === 'incrementalUpdate') {
                const { added, removed, updated } = message.diff;

                // Remove cards
                for (const entry of (removed || [])) {
                    const el = document.querySelector('[data-card-id="' + CSS.escape(entry) + '"]');
                    if (el) el.remove();
                }

                // Update cards in-place (preserves scroll position)
                for (const entry of (updated || [])) {
                    const el = document.querySelector('[data-card-id="' + CSS.escape(entry.id) + '"]');
                    if (el) {
                        // Preserve expand state across incremental updates
                        const wasExpanded = el.getAttribute('data-expanded');
                        const temp = document.createElement('div');
                        temp.innerHTML = entry.html.trim();
                        const newEl = temp.firstElementChild;
                        if (newEl) {
                            if (wasExpanded) {
                                newEl.setAttribute('data-expanded', wasExpanded);
                                newEl.setAttribute('aria-expanded', wasExpanded);
                            }
                            el.replaceWith(newEl);
                            attachCardListeners(newEl);
                        }
                    }
                }

                // Add new cards at end of changes list
                for (const entry of (added || [])) {
                    const container = document.getElementById('changesList');
                    if (container) {
                        const temp = document.createElement('div');
                        temp.innerHTML = entry.html.trim();
                        const newEl = temp.firstElementChild;
                        if (newEl) {
                            container.appendChild(newEl);
                            attachCardListeners(newEl);
                        }
                    }
                }

                // Update view mode buttons if viewMode changed
                if (message.diff.viewMode) {
                    document.querySelectorAll('.vm-btn').forEach(btn => {
                        const mode = btn.getAttribute('data-mode');
                        if (mode === message.diff.viewMode) {
                            btn.classList.add('vm-active');
                        } else {
                            btn.classList.remove('vm-active');
                        }
                    });
                }

                // Update tracking toggle if trackingEnabled changed
                if (message.diff.trackingEnabled !== undefined) {
                    const btn = document.getElementById('trackingToggle');
                    if (btn) {
                        btn.classList.remove('toggle-on', 'toggle-off');
                        btn.classList.add(message.diff.trackingEnabled ? 'toggle-on' : 'toggle-off');
                        const dot = btn.querySelector('.toggle-dot');
                        if (dot) dot.textContent = message.diff.trackingEnabled ? '\u25CF' : '\u25CB';
                        const textNodes = Array.from(btn.childNodes).filter(n => n.nodeType === 3);
                        const last = textNodes[textNodes.length - 1];
                        if (last) last.textContent = ' Track Changes: ' + (message.diff.trackingEnabled ? 'ON' : 'OFF');
                    }
                }
            }
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
