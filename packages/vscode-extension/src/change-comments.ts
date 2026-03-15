import * as vscode from 'vscode';
import { ChangeNode, ChangeStatus } from '@changetracks/core';
import type { ExtensionController } from './controller';
import { coreRangeToVscode, positionToOffset } from './converters';
import { typeLabel, typeLabelCapitalized } from './visual-semantics';

const REFRESH_THREADS_DEBOUNCE_MS = 100;

/**
 * Maps footnoted ChangeNodes to VS Code CommentThreads. Provides:
 * - Diamond gutter icons for changes with [^ct-N] footnotes
 * - "+" hover icon on Level 0 changes (via CommentingRangeProvider)
 * - Threaded discussions with author attribution
 * - Accept/Reject action buttons on threads
 */
export class ChangeComments implements vscode.Disposable {
  private commentController: vscode.CommentController;
  private threads = new Map<string, vscode.CommentThread>(); // changeId -> thread
  private disposables: vscode.Disposable[] = [];
  private refreshThreadsTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private controller: ExtensionController,
    private getDocument: () => vscode.TextDocument | undefined,
    private getViewMode?: () => string | undefined
  ) {
    this.commentController = vscode.comments.createCommentController(
      'changetracks',
      'ChangeTracks Changes'
    );

    // "+" icon: on every line in markdown (native add-comment); on Level 0 change lines only for other docs
    this.commentController.commentingRangeProvider = {
      provideCommentingRanges: (document: vscode.TextDocument) => {
        if (document.languageId === 'markdown') {
          return this.getAllLineRanges(document);
        }
        return this.getLevel0Ranges(document);
      }
    };

    this.disposables.push(this.commentController);

    // Refresh threads when changes update (debounced to avoid renderer CPU spikes)
    this.disposables.push(
      controller.onDidChangeChanges(() => this.scheduleRefreshThreads())
    );

    // Refresh when active editor changes (immediate so threads show when switching tabs)
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.refreshThreads())
    );

    // When user CLICKS into a change that has a comment thread, expand it.
    // Only fires on Mouse selection changes — keyboard navigation (arrow keys,
    // Home/End, find-next) does not trigger expansion, preventing peek flash.
    // Gated by clickToShowComments setting (default true).
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.kind === vscode.TextEditorSelectionChangeKind.Mouse && this.getClickToShowComments()) {
          this.expandThreadForChangeAtCursor();
        }
      })
    );
  }

  /**
   * If the cursor is inside a footnoted change (ct-*), expand its comment thread so the peek opens.
   */
  private expandThreadForChangeAtCursor(): void {
    const doc = this.getDocument();
    const editor = vscode.window.activeTextEditor;
    if (!doc || !editor || editor.document !== doc) return;

    const text = doc.getText();
    const cursorOffset = positionToOffset(text, editor.selection.active);
    const changes = this.controller.getChangesForDocument(doc);
    const change = changes.find(
      (c) => cursorOffset >= c.contentRange.start && cursorOffset < c.contentRange.end
    );
    if (!change || change.level < 1) {
      // Cursor outside any change — collapse all open threads
      for (const thread of this.threads.values()) {
        if (thread.collapsibleState === vscode.CommentThreadCollapsibleState.Expanded) {
          thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed;
        }
      }
      return;
    }

    // Collapse all other threads, expand the target
    for (const [id, thread] of this.threads) {
      if (id === change.id) {
        if (thread.collapsibleState !== vscode.CommentThreadCollapsibleState.Expanded) {
          thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
        }
      } else if (thread.collapsibleState === vscode.CommentThreadCollapsibleState.Expanded) {
        thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed;
      }
    }
  }

  /**
   * Live check: is any comment thread currently expanded at the cursor position?
   * Used by controller guards to decide whether keystrokes belong to the comment
   * input or the document editor.
   *
   * This replaces the stale `isCommentReplyActive` boolean flag, which drifted
   * because it was cleared on cursor-move rather than on widget close.
   *
   * Known limitation: VS Code does not guarantee collapsibleState reflects actual
   * UI state after user-initiated close (Escape/click outside). This live check
   * is still a significant improvement — the boolean flag drifted in more scenarios.
   */
  public isAnyThreadExpandedAtCursor(): boolean {
    const editor = vscode.window.activeTextEditor;
    const doc = this.getDocument();
    if (!editor || !doc || editor.document !== doc) return false;

    const text = doc.getText();
    const cursorOffset = positionToOffset(text, editor.selection.active);
    const changes = this.controller.getChangesForDocument(doc);
    const change = changes.find(
      (c) => cursorOffset >= c.contentRange.start && cursorOffset < c.contentRange.end
    );
    if (!change || change.level < 1) return false;

    const thread = this.threads.get(change.id);
    return thread?.collapsibleState === vscode.CommentThreadCollapsibleState.Expanded;
  }

  /**
   * Expand the comment thread for a given changeId. Used by review panel
   * "click card → navigate AND open peek widget" feature.
   */
  public expandThreadForChangeId(changeId: string): void {
    const thread = this.threads.get(changeId);
    if (thread) {
      thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
    }
  }

  private commentFingerprint(comments: vscode.Comment[]): string {
    return comments.map(c => {
      const body = typeof c.body === 'string' ? c.body : (c.body as vscode.MarkdownString).value;
      return `${(c.author as any).name}|${body}`;
    }).join('\n');
  }

  private getClickToShowComments(): boolean {
    return vscode.workspace.getConfiguration('changetracks').get<boolean>('clickToShowComments', true);
  }

  private scheduleRefreshThreads(): void {
    if (this.refreshThreadsTimeout) {
      clearTimeout(this.refreshThreadsTimeout);
      this.refreshThreadsTimeout = null;
    }
    this.refreshThreadsTimeout = setTimeout(() => {
      this.refreshThreadsTimeout = null;
      this.refreshThreads();
    }, REFRESH_THREADS_DEBOUNCE_MS);
  }

  /**
   * Returns a single range spanning the entire document so the "+" comment icon
   * appears on hover for any line. Returning one range instead of per-line ranges
   * prevents VS Code from merging adjacent ranges into multi-line highlight blocks.
   */
  private getAllLineRanges(document: vscode.TextDocument): vscode.Range[] {
    if (document.lineCount === 0) return [];
    const lastLine = document.lineCount - 1;
    return [new vscode.Range(0, 0, lastLine, document.lineAt(lastLine).text.length)];
  }

  /**
   * Returns ranges of Level 0 changes (CriticMarkup without [^ct-N] footnote).
   * Used for non-markdown (e.g. sidecar) where we only allow commenting on existing changes.
   */
  private getLevel0Ranges(document: vscode.TextDocument): vscode.Range[] {
    const changes = this.controller.getChangesForDocument(document);
    const text = document.getText();
    return changes
      .filter(c => c.level === 0)
      .map(c => coreRangeToVscode(text, c.contentRange));
  }

  /**
   * Range for the comment thread so the peek appears below the last line of the change,
   * not in the middle of multi-line insertions/deletions/substitutions.
   */
  private contentRangeToPeekRange(document: vscode.TextDocument, contentRange: { start: number; end: number }): vscode.Range {
    const endPos = document.positionAt(contentRange.end);
    const lineEnd = document.lineAt(endPos.line).range.end;
    return new vscode.Range(lineEnd, lineEnd);
  }

  /** Get the change ID associated with a CommentThread. */
  getChangeIdForThread(thread: vscode.CommentThread): string | undefined {
    for (const [id, t] of this.threads) {
      if (t === thread) return id;
    }
    return undefined;
  }

  /**
   * Dispose all comment threads associated with a given document URI.
   * Called when a document is closed to prevent stale threads.
   */
  disposeThreadsForUri(uri: vscode.Uri): void {
    for (const [id, thread] of this.threads) {
      if (thread.uri.toString() === uri.toString()) {
        thread.dispose();
        this.threads.delete(id);
      }
    }
  }

  /**
   * Sync CommentThreads to the current ChangeNode[] state.
   */
  refreshThreads(): void {
    const doc = this.getDocument();
    if (!doc) return;

    // Hide all threads in Final/Original clean preview modes
    const viewMode = this.getViewMode?.();
    if (viewMode === 'settled' || viewMode === 'raw') {
      // Dispose all threads for clean preview
      for (const [id, thread] of this.threads) {
        thread.dispose();
        this.threads.delete(id);
      }
      return;
    }

    const changes = this.controller.getChangesForDocument(doc);

    // Track which threads are still alive
    const activeIds = new Set<string>();

    for (const change of changes) {
      // Create threads for all L1/L2 changes. L0 (bare markup, no metadata) gets no thread.
      if (change.level < 1) continue;

      activeIds.add(change.id);
      const range = this.contentRangeToPeekRange(doc, change.contentRange);

      const existing = this.threads.get(change.id);

      // Compute thread state from resolution metadata: threads with an explicit
      // "resolved" resolution marker use CommentThreadState.Resolved (VS Code
      // dims them and collapses inline peeks); all others stay Unresolved.
      const isResolved = change.metadata?.resolution?.type === 'resolved';
      const threadState = isResolved
        ? vscode.CommentThreadState.Resolved
        : vscode.CommentThreadState.Unresolved;

      if (existing) {
        // Guard ALL property assignments — each one triggers VS Code's internal
        // $updateCommentThread which rebuilds comment widgets and leaks listeners
        const rangeChanged = !existing.range?.isEqual(range);
        const stateChanged = existing.state !== threadState;
        const newComments = this.buildComments(change);
        const fingerprint = this.commentFingerprint(newComments);
        const existingFingerprint = (existing as any)._ctFingerprint as string | undefined;
        const commentsChanged = fingerprint !== existingFingerprint;

        if (rangeChanged || commentsChanged || stateChanged) {
          const wasExpanded = existing.collapsibleState === vscode.CommentThreadCollapsibleState.Expanded;
          if (rangeChanged) existing.range = range;
          if (commentsChanged) {
            existing.comments = newComments;
            (existing as any)._ctFingerprint = fingerprint;
          }
          if (stateChanged) existing.state = threadState;
          if (wasExpanded) {
            existing.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
          }
        }
      } else {
        // Create new thread
        const newComments = this.buildComments(change);
        const thread = this.commentController.createCommentThread(doc.uri, range, newComments);
        thread.contextValue = 'changetracksThread';
        const author = change.metadata?.author ?? change.inlineMetadata?.author ?? 'unknown';
        thread.label = `${typeLabelCapitalized(change.type)} by ${author}`;
        thread.canReply = true;
        thread.state = threadState;
        thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed;
        (thread as any)._ctFingerprint = this.commentFingerprint(newComments);
        this.threads.set(change.id, thread);
      }
    }

    // Dispose threads for changes that no longer exist in the document
    for (const [id, thread] of this.threads) {
      if (!activeIds.has(id)) {
        thread.dispose();
        this.threads.delete(id);
      }
    }
  }

  /**
   * Build Comment[] from a ChangeNode's footnote metadata.
   */
  private buildComments(change: ChangeNode): vscode.Comment[] {
    const comments: vscode.Comment[] = [];
    const meta = change.metadata;

    // First comment: change summary from footnote header
    const statusLabel = change.status === ChangeStatus.Accepted ? 'accepted'
      : change.status === ChangeStatus.Rejected ? 'rejected' : 'proposed';
    const tLabel = typeLabel(change.type);
    const body = new vscode.MarkdownString(`**${tLabel}** · ${statusLabel}`);
    if (meta?.comment) {
      body.appendMarkdown('\n\n');
      body.appendText(meta.comment);
    }

    comments.push({
      author: {
        name: meta?.author ?? change.inlineMetadata?.author ?? 'unknown',
      },
      body,
      mode: vscode.CommentMode.Preview,
      timestamp: meta?.date ? new Date(meta.date) : undefined,
    });

    // Discussion entries from footnote
    if (meta?.discussion) {
      for (const entry of meta.discussion) {
        const entryBody = new vscode.MarkdownString();
        if (entry.label) { entryBody.appendMarkdown('**'); entryBody.appendText(entry.label); entryBody.appendMarkdown(':** '); }
        entryBody.appendText(entry.text);
        comments.push({
          author: { name: entry.author },
          body: entryBody,
          mode: vscode.CommentMode.Preview,
          timestamp: entry.timestamp?.sortable
            ? new Date(entry.timestamp.sortable)
            : entry.date ? new Date(entry.date) : undefined,
        });
      }
    }

    // Approval entries from footnote
    if (meta?.approvals) {
      for (const approval of meta.approvals) {
        const approvalBody = new vscode.MarkdownString();
        approvalBody.appendText('Approved');
        if (approval.reason) {
          approvalBody.appendText(`: ${approval.reason}`);
        }
        comments.push({
          author: { name: approval.author },
          body: approvalBody,
          mode: vscode.CommentMode.Preview,
          timestamp: approval.timestamp?.sortable
            ? new Date(approval.timestamp.sortable)
            : approval.date ? new Date(approval.date) : undefined,
        });
      }
    }

    // Rejection entries from footnote
    if (meta?.rejections) {
      for (const rejection of meta.rejections) {
        const rejectionBody = new vscode.MarkdownString();
        rejectionBody.appendText('Rejected');
        if (rejection.reason) {
          rejectionBody.appendText(`: ${rejection.reason}`);
        }
        comments.push({
          author: { name: rejection.author },
          body: rejectionBody,
          mode: vscode.CommentMode.Preview,
          timestamp: rejection.timestamp?.sortable
            ? new Date(rejection.timestamp.sortable)
            : rejection.date ? new Date(rejection.date) : undefined,
        });
      }
    }

    return comments;
  }

  /**
   * Return serializable metadata for all active comment threads.
   * Used by the _testGetCommentThreads bridge command.
   */
  getAllThreadData(): Array<{ changeId: string; state: string; commentCount: number; label: string }> {
    const result: Array<{ changeId: string; state: string; commentCount: number; label: string }> = [];
    for (const [changeId, thread] of this.threads) {
      result.push({
        changeId,
        state: thread.state === vscode.CommentThreadState.Resolved ? 'resolved' : 'unresolved',
        commentCount: thread.comments.length,
        label: thread.label ?? '',
      });
    }
    return result;
  }

  dispose(): void {
    if (this.refreshThreadsTimeout) {
      clearTimeout(this.refreshThreadsTimeout);
      this.refreshThreadsTimeout = null;
    }
    for (const thread of this.threads.values()) {
      thread.dispose();
    }
    this.threads.clear();
    this.disposables.forEach(d => d.dispose());
  }
}
