import * as vscode from 'vscode';

const DEBOUNCE_MS = 200;
const MIN_SCAN_INTERVAL_MS = 10_000;
/** Max .md files to process per scan; avoids opening/reading thousands and keeps renderer idle. */
const MAX_FILES_PER_SCAN = 1000;

export interface IndexEntry {
  count: number;
  ts: number;
}

/**
 * Hybrid index: event-driven updates from open documents plus background
 * workspace scan for unopened files. Emits when the set of URIs or counts change.
 */
export class ScmHybridIndex implements vscode.Disposable {
  private readonly index = new Map<string, IndexEntry>();
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private refreshDebounce: ReturnType<typeof setTimeout> | null = null;
  private lastScanTs = 0;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private getController: () => { getChangesForDocument(doc: vscode.TextDocument): { length: number }; onDidChangeChanges: vscode.Event<vscode.Uri[]> } | null,
    private getMode: () => 'scm-first' | 'hybrid' | 'legacy'
  ) {
    this.disposables.push(this._onDidChange);
  }

  /** Event path: update from an open document (controller change or doc open/save). */
  updateFromDocument(doc: vscode.TextDocument): void {
    if (doc.uri.scheme !== 'file' || doc.languageId !== 'markdown') return;
    const controller = this.getController();
    const count = controller ? controller.getChangesForDocument(doc).length : 0;
    const uri = doc.uri.toString();
    const prev = this.index.get(uri);
    if (count === 0) {
      if (prev !== undefined) {
        this.index.delete(uri);
        this.scheduleRefresh();
      }
      return;
    }
    const ts = Date.now();
    if (prev?.count !== count) {
      this.index.set(uri, { count, ts });
      this.scheduleRefresh();
    }
  }

  /** Event path: document closed — remove from index (scan will re-add if still has changes). */
  removeUri(uri: string): void {
    if (this.index.delete(uri)) {
      this.scheduleRefresh();
    }
  }

  /**
   * Update index for a single file (e.g. from FileSystemWatcher). Prefer open document if available.
   */
  async updateFromUri(uri: vscode.Uri): Promise<void> {
    if (uri.scheme !== 'file' || !uri.path.toLowerCase().endsWith('.md')) return;
    const uriStr = uri.toString();
    const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uriStr);
    let count: number;
    if (doc) {
      const controller = this.getController();
      count = controller ? controller.getChangesForDocument(doc).length : 0;
    } else {
      // Phase 2: No local parse. Unopened files: no decoration data from LSP → treat as 0.
      count = 0;
    }
    const prev = this.index.get(uriStr);
    if (count === 0) {
      if (prev !== undefined) {
        this.index.delete(uriStr);
        this.scheduleRefresh();
      }
      return;
    }
    const ts = Date.now();
    if (prev?.count !== count) {
      this.index.set(uriStr, { count, ts });
      this.scheduleRefresh();
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshDebounce) return;
    this.refreshDebounce = setTimeout(() => {
      this.refreshDebounce = null;
      this._onDidChange.fire();
    }, DEBOUNCE_MS);
  }

  /** Scan path: find all .md files and parse to get pending change counts. */
  async runScan(): Promise<void> {
    const now = Date.now();
    if (now - this.lastScanTs < MIN_SCAN_INTERVAL_MS) return;
    this.lastScanTs = now;
    console.debug('[changedown] scm_integration: scan_start');

    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
      console.debug('[changedown] scm_integration: scan_complete (no workspace)');
      return;
    }

    const controller = this.getController();
    const files = await vscode.workspace.findFiles('**/*.md', undefined, MAX_FILES_PER_SCAN);
    let changed = false;

    for (const u of files) {
      const uriStr = u.toString();
      const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uriStr);
      let count: number;
      if (doc) {
        count = controller ? controller.getChangesForDocument(doc).length : 0;
      } else {
        // Phase 2: No local parse. Unopened files: no decoration data from LSP → treat as 0.
        count = 0;
      }
      const prev = this.index.get(uriStr);
      if (count === 0) {
        if (prev !== undefined) {
          this.index.delete(uriStr);
          changed = true;
        }
      } else {
        const ts = Date.now();
        if (prev?.count !== count) {
          this.index.set(uriStr, { count, ts });
          changed = true;
        }
      }
    }

    if (changed) this._onDidChange.fire();
    console.debug('[changedown] scm_integration: scan_complete');
  }

  getFileCount(): number {
    return this.index.size;
  }

  getResourceUris(): string[] {
    return Array.from(this.index.keys());
  }

  /** For diagnostics: file count and last scan time. */
  getStatus(): { fileCount: number; lastScanTs: number } {
    return { fileCount: this.index.size, lastScanTs: this.lastScanTs };
  }

  dispose(): void {
    if (this.refreshDebounce) {
      clearTimeout(this.refreshDebounce);
      this.refreshDebounce = null;
    }
    this.disposables.forEach(d => d.dispose());
  }
}
