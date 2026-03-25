import * as vscode from 'vscode';
import { getScmIntegrationMode } from './scm-integration-mode';
import { toResolvedUri, toGitOriginalUri } from './resolved-content-provider';
import { ScmHybridIndex } from './scm-hybrid-index';
import type { ExtensionController } from './controller';
import { recordScmIntegrationEvent } from './scm-integration-mode';
import { GitGutterManager, GUTTER_STRATEGY } from './git-gutter-manager';
import type { GutterStrategy } from './git-gutter-manager';

const SYNC_FROM_OPEN_DEBOUNCE_MS = 300;

/**
 * Registers ChangeTracks as a Source Control provider with a QuickDiffProvider,
 * resource group for files with pending changes, and count badge.
 */
export class ChangetracksSCM implements vscode.Disposable {
  private sourceControl: vscode.SourceControl;
  private resourceGroup: vscode.SourceControlResourceGroup | undefined;
  private index: ScmHybridIndex | undefined;
  private disposables: vscode.Disposable[] = [];
  private syncFromOpenTimeout: ReturnType<typeof setTimeout> | null = null;
  private usingProposedQuickDiff = false;

  constructor(
    context: vscode.ExtensionContext,
    getController: () => ExtensionController | null,
    private gutterManager?: GitGutterManager,
    private gutterStrategy: GutterStrategy = GUTTER_STRATEGY.AUTO
  ) {
    this.sourceControl = vscode.scm.createSourceControl(
      'changetracks',
      'ChangeTracks'
    );
    const quickDiff: vscode.QuickDiffProvider = {
      provideOriginalResource(uri: vscode.Uri): vscode.Uri | undefined {
        if (uri.scheme !== 'file') return undefined;
        // Markdown files: use settled text (strips CriticMarkup, shows real changes)
        if (uri.path.toLowerCase().endsWith('.md')) return toResolvedUri(uri);
        // All other files: proxy git HEAD content so non-markdown gutter works normally
        return toGitOriginalUri(uri);
      }
    };

    if (typeof vscode.window.registerQuickDiffProvider === 'function') {
      try {
        const disposable = vscode.window.registerQuickDiffProvider(
          { language: 'markdown' },
          quickDiff,
          'changetracks',
          'ChangeTracks',
          vscode.workspace.workspaceFolders?.[0]?.uri
        );
        this.disposables.push(disposable);
        this.usingProposedQuickDiff = true;
        console.debug('[changetracks] scm_integration: using proposed registerQuickDiffProvider (language-scoped)');
      } catch (err: any) {
        console.debug(`[changetracks] scm_integration: proposed API failed, falling back: ${err.message}`);
        if (this.gutterStrategy !== GUTTER_STRATEGY.PROPOSED_API) {
          this.sourceControl.quickDiffProvider = quickDiff;
        }
      }
    } else if (this.gutterStrategy !== GUTTER_STRATEGY.PROPOSED_API) {
      this.sourceControl.quickDiffProvider = quickDiff;
    }

    this.disposables.push(this.sourceControl);

    const mode = getScmIntegrationMode();
    if (mode === 'legacy' || mode === 'hybrid') {
      this.checkGutterPreference(context);
    }

    // Resource group and index only when SCM list is enabled (scm-first or hybrid)
    if (mode !== 'legacy') {
      this.resourceGroup = this.sourceControl.createResourceGroup('changes', 'Changes');
      this.resourceGroup.hideWhenEmpty = true;
      this.disposables.push(this.resourceGroup);

      this.index = new ScmHybridIndex(getController, getScmIntegrationMode);
      this.disposables.push(this.index);

      this.disposables.push(
        this.index.onDidChange(() => this.applyResourceStates())
      );

      if (this.gutterManager) {
        this.disposables.push(
          this.index.onDidChange(() => this.syncGutterFlags())
        );
      }

      // Event path: controller change (debounced — sync only affected docs when uris provided)
      const controller = getController();
      if (controller) {
        this.disposables.push(
          controller.onDidChangeChanges((uris) => this.scheduleSyncFromOpenDocuments(getController, uris))
        );
      }
      this.disposables.push(
        vscode.workspace.onDidOpenTextDocument(doc => {
          this.index?.updateFromDocument(doc);
        }),
        vscode.workspace.onDidCloseTextDocument(doc => {
          if (doc.uri.scheme === 'file' && doc.languageId === 'markdown') {
            this.index?.removeUri(doc.uri.toString());
          }
        }),
        vscode.workspace.onDidSaveTextDocument(doc => {
          this.index?.updateFromDocument(doc);
        })
      );

      this.syncFromOpenDocuments(getController);
      // One scan at activation to discover .md files with changes (closed files we haven't seen yet).
      this.index.runScan();

      // Native file watcher: update index when .md files change on disk (no polling).
      const mdWatcher = vscode.workspace.createFileSystemWatcher('**/*.md');
      this.disposables.push(mdWatcher);
      mdWatcher.onDidChange(uri => this.index?.updateFromUri(uri));
      mdWatcher.onDidCreate(uri => this.index?.updateFromUri(uri));
      mdWatcher.onDidDelete(uri => {
        if (uri.scheme === 'file') this.index?.removeUri(uri.toString());
      });
    }
  }

  private pendingSyncUris: vscode.Uri[] | null = null;

  private scheduleSyncFromOpenDocuments(getController: () => ExtensionController | null, uris?: vscode.Uri[]): void {
    if (uris?.length) {
      this.pendingSyncUris = this.pendingSyncUris ? [...this.pendingSyncUris, ...uris] : [...uris];
    }
    if (this.syncFromOpenTimeout) {
      clearTimeout(this.syncFromOpenTimeout);
      this.syncFromOpenTimeout = null;
    }
    this.syncFromOpenTimeout = setTimeout(() => {
      this.syncFromOpenTimeout = null;
      const urisToSync = this.pendingSyncUris;
      this.pendingSyncUris = null;
      this.syncFromOpenDocuments(getController, urisToSync ?? undefined);
    }, SYNC_FROM_OPEN_DEBOUNCE_MS);
  }

  private syncFromOpenDocuments(getController: () => ExtensionController | null, uris?: vscode.Uri[]): void {
    if (!this.index) return;
    const docs = uris?.length
      ? uris
          .map(u => vscode.workspace.textDocuments.find(d => d.uri.toString() === u.toString()))
          .filter((d): d is vscode.TextDocument => !!d && d.uri.scheme === 'file' && d.languageId === 'markdown')
      : vscode.workspace.textDocuments.filter(d => d.uri.scheme === 'file' && d.languageId === 'markdown');
    for (const doc of docs) {
      this.index.updateFromDocument(doc);
    }
  }

  private applyResourceStates(): void {
    if (!this.resourceGroup || !this.index) return;
    const uris = this.index.getResourceUris();
    this.resourceGroup.resourceStates = uris.map(uriStr => {
      const resourceUri = vscode.Uri.parse(uriStr);
      const label = vscode.workspace.asRelativePath(resourceUri, false);
      return {
        resourceUri,
        label,
        command: {
          title: 'Open diff',
          command: 'changetracks.openDiffForResource',
          arguments: [resourceUri]
        }
      };
    });
    this.sourceControl.count = this.index.getFileCount();
    console.debug('[changetracks] scm_integration: resource_states_applied', { count: uris.length });
  }

  private checkGutterPreference(context: vscode.ExtensionContext): void {
    const config = vscode.workspace.getConfiguration('changetracks');
    const preferGutter = config.get<boolean>('preferGutter', false);

    if (!preferGutter) return;

    const prompted = context.workspaceState.get<boolean>('changetracks.gutterPrompted', false);
    if (prompted) return;

    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (!gitExtension) return;

    context.workspaceState.update('changetracks.gutterPrompted', true);

    vscode.window.showInformationMessage(
      'ChangeTracks can show change indicators in the gutter. Disable Git\'s SCM for this workspace to use ChangeTracks\'s gutter instead.',
      'Disable Git SCM',
      'Not now'
    ).then(choice => {
      if (choice === 'Disable Git SCM') {
        vscode.workspace.getConfiguration('git').update('enabled', false, vscode.ConfigurationTarget.Workspace);
      }
    });
  }

  isUsingProposedQuickDiff(): boolean {
    return this.usingProposedQuickDiff;
  }

  private syncGutterFlags(): void {
    if (!this.gutterManager || !this.index) return;
    const uris = new Set(this.index.getResourceUris());
    this.gutterManager.syncFlags(uris);
  }

  /** For diagnostics command: report index file count and last scan time. */
  getIndexStatus(): { fileCount: number; lastScanTs: number } | undefined {
    return this.index?.getStatus();
  }

  dispose(): void {
    if (this.syncFromOpenTimeout) {
      clearTimeout(this.syncFromOpenTimeout);
      this.syncFromOpenTimeout = null;
    }
    this.disposables.forEach(d => d.dispose());
  }
}

/**
 * Opens diff (settled ↔ current) for a resource. Used when user clicks a file in SCM list.
 */
export async function openDiffForResource(resourceUri: vscode.Uri): Promise<void> {
  recordScmIntegrationEvent('diff_opened', 'scm');
  const resolvedUri = toResolvedUri(resourceUri);
  const title = `${resourceUri.path.split('/').pop()}: Settled ↔ Current`;
  await vscode.commands.executeCommand('vscode.diff', resolvedUri, resourceUri, title);
  console.debug('[changetracks] scm_integration: diff_opened_from_scm');
}
