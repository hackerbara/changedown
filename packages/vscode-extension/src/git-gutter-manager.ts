import * as vscode from 'vscode';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { getGitRepository } from './git-integration';
import type { Repository } from './git-integration';

const execFile = promisify(execFileCb);

/** Valid values for the changetracks.gutterStrategy config setting. */
export const GUTTER_STRATEGY = {
  AUTO: 'auto',
  ASSUME_UNCHANGED: 'assume-unchanged',
  PROPOSED_API: 'proposed-api',
  OFF: 'off',
} as const;
export type GutterStrategy = typeof GUTTER_STRATEGY[keyof typeof GUTTER_STRATEGY];

/**
 * Strategy A: Silence Git's QuickDiff for markdown files with CriticMarkup
 * by setting `git update-index --assume-unchanged` on those files.
 *
 * When Git thinks a file hasn't changed, it contributes zero gutter decorations,
 * leaving only ChangeTracks' QuickDiffProvider decorations visible.
 *
 * ⚠️ Trade-off: flagged files are also invisible to git status, git add .,
 * git stash, and git diff. Flags are cleared when change count drops to 0
 * and on extension deactivation.
 *
 * Flags are:
 * - SET when a markdown file gains CriticMarkup changes
 * - CLEARED when all changes are settled (count drops to 0)
 * - RE-APPLIED after git operations that change HEAD
 */
export class GitGutterManager implements vscode.Disposable {
  /** URIs currently flagged as assume-unchanged */
  private flaggedFiles = new Set<string>();
  private disposables: vscode.Disposable[] = [];
  private enabled = true;

  /** Debounce for syncFlags */
  private syncDebounce: ReturnType<typeof setTimeout> | null = null;
  private pendingFilesWithChanges: Set<string> | null = null;

  /** Prevent overlapping git exec calls */
  private busy = false;

  /** Track HEAD commit per-repo to avoid redundant reapplyFlags on every git status poll */
  private lastHeadByRepo = new Map<string, string | undefined>();

  /** Whether we've shown the one-time warning notification */
  private warningShown = false;

  constructor(
    private outputChannel: vscode.OutputChannel
  ) {}

  /**
   * Start managing flags. Call after extension activation.
   * Subscribes to git state changes for flag recovery.
   */
  start(): void {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) return;

    // Subscribe to state changes for each workspace folder's git repo
    for (const folder of folders) {
      const repo = getGitRepository(folder.uri);
      if (!repo) continue;

      const repoKey = repo.rootUri.toString();
      // Cache initial HEAD per repo
      this.lastHeadByRepo.set(repoKey, repo.state.HEAD?.commit);

      // Re-apply flags ONLY when HEAD actually changes (not on every 3s git status poll)
      this.disposables.push(
        repo.state.onDidChange(() => {
          const currentHead = repo.state.HEAD?.commit;
          if (currentHead !== this.lastHeadByRepo.get(repoKey)) {
            this.lastHeadByRepo.set(repoKey, currentHead);
            this.reapplyFlags();
          }
        })
      );

      // Also re-apply after explicit checkout (belt + suspenders)
      if (repo.onDidCheckout) {
        this.disposables.push(
          repo.onDidCheckout(() => this.reapplyFlags())
        );
      }
    }
  }

  /**
   * Called by ScmHybridIndex when the set of files with changes updates.
   * Debounced at 500ms to batch git exec calls.
   * @param filesWithChanges - URI strings of markdown files that currently have CriticMarkup changes
   */
  syncFlags(filesWithChanges: Set<string>): void {
    if (!this.enabled) return;
    this.pendingFilesWithChanges = filesWithChanges;
    if (this.syncDebounce) return;
    this.syncDebounce = setTimeout(() => {
      this.syncDebounce = null;
      const pending = this.pendingFilesWithChanges;
      this.pendingFilesWithChanges = null;
      if (pending) this.doSyncFlags(pending);
    }, 500);
  }

  private async doSyncFlags(filesWithChanges: Set<string>): Promise<void> {
    if (this.busy) {
      // Re-queue so the latest state is processed after current operation finishes
      this.pendingFilesWithChanges = filesWithChanges;
      return;
    }
    this.busy = true;
    try {
      await this.doSyncFlagsInner(filesWithChanges);
    } finally {
      this.busy = false;
      // Process any queued update that arrived while we were busy
      const requeued = this.pendingFilesWithChanges;
      this.pendingFilesWithChanges = null;
      if (requeued) this.doSyncFlags(requeued);
    }
  }

  private async doSyncFlagsInner(filesWithChanges: Set<string>): Promise<void> {
    // URIs that need the flag SET (have changes, not yet flagged)
    const toFlagUris: string[] = [];
    for (const uri of filesWithChanges) {
      if (!this.flaggedFiles.has(uri)) toFlagUris.push(uri);
    }

    // URIs that need the flag CLEARED (no longer have changes, still flagged)
    const toUnflagUris: string[] = [];
    for (const uri of this.flaggedFiles) {
      if (!filesWithChanges.has(uri)) toUnflagUris.push(uri);
    }

    if (toFlagUris.length === 0 && toUnflagUris.length === 0) return;

    // Show one-time warning on first flag
    if (toFlagUris.length > 0 && !this.warningShown) {
      this.warningShown = true;
      vscode.window.showInformationMessage(
        'ChangeTracks is managing gutter indicators for markdown files. ' +
        'Flagged files are hidden from git status/add until changes are settled. ' +
        'Disable via changetracks.gutterStrategy setting.',
        'Got it',
        'Disable'
      ).then(choice => {
        if (choice === 'Disable') {
          vscode.workspace.getConfiguration('changetracks')
            .update('gutterStrategy', GUTTER_STRATEGY.OFF, vscode.ConfigurationTarget.Workspace);
        }
      });
    }

    // Batch per repo: set flags
    if (toFlagUris.length > 0) {
      const byRepo = this.groupByRepo(toFlagUris);
      if (byRepo.size === 0) {
        this.outputChannel.appendLine(`[gutter] groupByRepo returned empty for ${toFlagUris.length} URIs — git extension may not be active yet`);
        // Retry after a delay to give the git extension time to activate
        setTimeout(() => this.syncFlags(filesWithChanges), 3000);
        return;
      }
      for (const [repo, entries] of byRepo) {
        try {
          await this.gitExec(repo,['update-index', '--assume-unchanged', ...entries.map(e => e.relPath)]);
          for (const e of entries) this.flaggedFiles.add(e.uri);
        } catch (batchErr: any) {
          this.outputChannel.appendLine(`[gutter] batch assume-unchanged failed: ${batchErr.message}`);
          // Batch failed — try per-file
          for (const e of entries) {
            try {
              await this.gitExec(repo,['update-index', '--assume-unchanged', e.relPath]);
              this.flaggedFiles.add(e.uri);
            } catch (err: any) {
              this.outputChannel.appendLine(`[gutter] assume-unchanged failed for ${e.relPath}: ${err.message}`);
            }
          }
        }
      }
    }

    // Batch per repo: clear flags
    if (toUnflagUris.length > 0) {
      const byRepo = this.groupByRepo(toUnflagUris);
      for (const [repo, entries] of byRepo) {
        try {
          await this.gitExec(repo,['update-index', '--no-assume-unchanged', ...entries.map(e => e.relPath)]);
        } catch {
          // Best-effort — files may have been deleted
        }
        for (const e of entries) this.flaggedFiles.delete(e.uri);
      }
    }

    this.outputChannel.appendLine(
      `[gutter] synced flags (+${toFlagUris.length} -${toUnflagUris.length}, total=${this.flaggedFiles.size})`
    );
  }

  /**
   * Re-apply assume-unchanged flags to all currently-tracked files.
   * Called after git operations that change HEAD (checkout, reset, pull).
   */
  private async reapplyFlags(): Promise<void> {
    if (!this.enabled || this.flaggedFiles.size === 0) return;
    if (this.busy) return;
    this.busy = true;
    try {
      const byRepo = this.groupByRepo([...this.flaggedFiles]);
      for (const [repo, entries] of byRepo) {
        try {
          await this.gitExec(repo,['update-index', '--assume-unchanged', ...entries.map(e => e.relPath)]);
        } catch {
          // Batch failed — try per-file
          for (const e of entries) {
            try {
              await this.gitExec(repo,['update-index', '--assume-unchanged', e.relPath]);
            } catch {
              // Skip — file removed or not tracked
            }
          }
        }
      }

      this.outputChannel.appendLine(`[gutter] reapplied flags to ${this.flaggedFiles.size} files after HEAD change`);
    } finally {
      this.busy = false;
    }
  }

  /**
   * Clear ALL assume-unchanged flags. Called on extension deactivation
   * to leave the git index clean.
   */
  async clearAllFlags(): Promise<void> {
    if (this.flaggedFiles.size === 0) return;

    const byRepo = this.groupByRepo([...this.flaggedFiles]);
    for (const [repo, entries] of byRepo) {
      try {
        await this.gitExec(repo,['update-index', '--no-assume-unchanged', ...entries.map(e => e.relPath)]);
      } catch {
        // Best-effort cleanup
      }
    }

    this.flaggedFiles.clear();
    this.outputChannel.appendLine('[gutter] cleared all flags on deactivation');
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clearAllFlags();
    }
  }

  setWarningShown(shown: boolean): void {
    this.warningShown = shown;
  }

  wasWarningShown(): boolean {
    return this.warningShown;
  }

  handleFileRenamed(oldUri: string, _newUri: string): void {
    if (this.flaggedFiles.has(oldUri)) {
      this.flaggedFiles.delete(oldUri);
      // New URI will be picked up by next syncFlags cycle
    }
  }

  /** Run a git command in the repo's working directory via child_process. */
  private gitExec(repo: Repository, args: string[]): Promise<{ stdout: string; stderr: string }> {
    return execFile('git', args, { cwd: repo.rootUri.fsPath });
  }

  /** Group URI strings by their git repo, resolving each to a relative path. */
  private groupByRepo(uris: string[]): Map<Repository, Array<{ uri: string; relPath: string }>> {
    // Safe: vscode.git API returns the same Repository instance per root
    const byRepo = new Map<Repository, Array<{ uri: string; relPath: string }>>();
    for (const uri of uris) {
      const resolved = this.resolveFileContext(uri);
      if (!resolved) continue;
      let entries = byRepo.get(resolved.repo);
      if (!entries) {
        entries = [];
        byRepo.set(resolved.repo, entries);
      }
      entries.push({ uri, relPath: resolved.relPath });
    }
    return byRepo;
  }

  /**
   * Resolve a URI string to its workspace folder, git repo, and relative path.
   * Handles multi-root workspaces by finding the correct folder for each file.
   */
  private resolveFileContext(uriStr: string): { relPath: string; repo: Repository } | null {
    try {
      const uri = vscode.Uri.parse(uriStr);
      const folder = vscode.workspace.getWorkspaceFolder(uri);
      if (!folder) return null;
      const repo = getGitRepository(uri);
      if (!repo) return null;
      const rootPath = repo.rootUri.fsPath;
      const filePath = uri.fsPath;
      if (!filePath.startsWith(rootPath)) return null;
      const relPath = filePath.slice(rootPath.length + 1); // +1 for separator
      return { relPath, repo };
    } catch {
      return null;
    }
  }

  dispose(): void {
    // Note: do NOT call clearAllFlags() here — it's async and dispose() is sync.
    // The explicit await in deactivate() handles cleanup.
    if (this.syncDebounce) {
      clearTimeout(this.syncDebounce);
      this.syncDebounce = null;
    }
    this.disposables.forEach(d => d.dispose());
  }
}
