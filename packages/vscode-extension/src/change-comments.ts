import * as vscode from 'vscode';
import { ChangeNode, ChangeType, ChangeStatus } from '@changetracks/core';
import type { ExtensionController } from './controller';
import { coreRangeToVscode, offsetToPosition, positionToOffset } from './converters';
import { typeLabel } from './visual-semantics';

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

  /**
   * Defense-in-depth flag: true when a comment thread is expanded (peek widget
   * likely visible). Controller checks this as secondary guard against
   * keystroke leaks from comment input. Cleared on next selection event.
   */
  public isCommentReplyActive: boolean = false;

  constructor(
    private controller: ExtensionController,
    private getDocument: () => vscode.TextDocument | undefined
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

    // Apply comment peek setting when it changes
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('changetracks.commentsExpandedByDefault')) {
          this.refreshThreads();
        }
      })
    );

    // When cursor moves into a change that has a comment thread, expand that thread so the comment opens by default.
    // isCommentReplyActive is cleared inside expandThreadForChangeAtCursor when cursor leaves a change region,
    // and in thread disposal paths — NOT on every selection event (which races with keystroke processing).
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection(() => {
        this.expandThreadForChangeAtCursor();
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
    if (!change || change.level < 2) {
      // Cursor is outside any footnoted change — no comment widget should be active
      this.isCommentReplyActive = false;
      return;
    }

    const thread = this.threads.get(change.id);
    if (thread && thread.collapsibleState !== vscode.CommentThreadCollapsibleState.Expanded) {
      thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
      this.isCommentReplyActive = true;
    }
  }

  private getCommentsExpandedByDefault(): boolean {
    return vscode.workspace.getConfiguration('changetracks').get<boolean>('commentsExpandedByDefault', false);
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
  private contentRangeToPeekRange(text: string, contentRange: { start: number; end: number }): vscode.Range {
    const endPos = offsetToPosition(text, contentRange.end);
    const startOfLastLine = new vscode.Position(endPos.line, 0);
    return new vscode.Range(startOfLastLine, endPos);
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

    const changes = this.controller.getChangesForDocument(doc);
    const text = doc.getText();

    // Track which threads are still alive
    const activeIds = new Set<string>();

    for (const change of changes) {
      // Only create threads for footnoted changes (Level 2: ct-N id). Level 1 has inline metadata but no footnote/thread.
      if (change.level < 2) continue;

      activeIds.add(change.id);
      const range = this.contentRangeToPeekRange(text, change.contentRange);

      const existing = this.threads.get(change.id);
      const defaultCollapsibleState = this.getCommentsExpandedByDefault()
        ? vscode.CommentThreadCollapsibleState.Expanded
        : vscode.CommentThreadCollapsibleState.Collapsed;

      // Don't use CommentThreadState.Resolved: VS Code hides inline peeks for
      // Resolved threads, preventing users from seeing the "accepted"/"rejected"
      // status transition. Status is communicated via the text label in the
      // comment body instead ("insertion · accepted", "deletion · rejected", etc).

      if (existing) {
        // Preserve expansion so that replying does not auto-close the thread
        const wasExpanded = existing.collapsibleState === vscode.CommentThreadCollapsibleState.Expanded;
        existing.range = range;
        existing.comments = this.buildComments(change);
        existing.state = vscode.CommentThreadState.Unresolved;
        if (wasExpanded) {
          existing.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
        }
      } else {
        // Create new thread
        const thread = this.commentController.createCommentThread(doc.uri, range, this.buildComments(change));
        thread.contextValue = 'changetracksThread';
        thread.label = `[^${change.id}]`;
        thread.canReply = true;
        thread.state = vscode.CommentThreadState.Unresolved;
        thread.collapsibleState = defaultCollapsibleState;
        this.threads.set(change.id, thread);
      }
    }

    // Dispose threads for changes that no longer exist in the document
    for (const [id, thread] of this.threads) {
      if (!activeIds.has(id)) {
        thread.dispose();
        this.threads.delete(id);
        // Thread gone — clear flag so tracking mode stops suppressing keystrokes
        this.isCommentReplyActive = false;
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
    const summary = meta?.comment
      ? `**${tLabel}** · ${statusLabel}\n\n${meta.comment}`
      : `**${tLabel}** · ${statusLabel}`;

    comments.push({
      author: {
        name: meta?.author ?? 'unknown',
      },
      body: new vscode.MarkdownString(summary),
      mode: vscode.CommentMode.Preview,
      timestamp: meta?.date ? new Date(meta.date) : undefined,
    });

    // Discussion entries from footnote
    if (meta?.discussion) {
      for (const entry of meta.discussion) {
        const label = entry.label ? `**${entry.label}:** ` : '';
        comments.push({
          author: { name: entry.author },
          body: new vscode.MarkdownString(`${label}${entry.text}`),
          mode: vscode.CommentMode.Preview,
          timestamp: entry.timestamp?.sortable
            ? new Date(entry.timestamp.sortable)
            : entry.date ? new Date(entry.date) : undefined,
        });
      }
    }

    return comments;
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
    this.isCommentReplyActive = false;
    this.disposables.forEach(d => d.dispose());
  }
}
