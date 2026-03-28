import * as vscode from 'vscode';
import { computeSettledText } from '@changedown/core';
import { getPreviousVersion } from './git-integration';

export const RESOLVED_SCHEME = 'changedown-resolved';
export const GIT_ORIGINAL_SCHEME = 'changedown-git-original';

/**
 * Serves the "settled state" of a document — accepted changes absorbed,
 * rejected/proposed changes erased, all markup stripped. Used as the
 * "original" side for diff comparisons.
 */
export class ResolvedContentProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  /**
   * Signal that the resolved content for a URI has changed (e.g., after
   * accepting/rejecting a change). VS Code will re-request the content.
   */
  notifyChange(uri: vscode.Uri): void {
    this._onDidChange.fire(uri);
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    // Decode the real file URI from query parameter
    const realUri = vscode.Uri.parse(JSON.parse(uri.query).uri);
    const doc = await vscode.workspace.openTextDocument(realUri);
    return computeSettledText(doc.getText());
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}

/**
 * Serves git HEAD content for non-markdown files. Used as the "original"
 * side for QuickDiff when ChangeDown proxies git's gutter indicators.
 */
export class GitOriginalContentProvider implements vscode.TextDocumentContentProvider {
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const realUri = vscode.Uri.parse(JSON.parse(uri.query).uri);
    const prev = await getPreviousVersion(realUri);
    return prev?.oldText ?? '';
  }

  dispose(): void { /* nothing to clean up */ }
}

/**
 * Construct a changedown-resolved:// URI for a given document URI.
 * The real URI is encoded in the query string.
 */
export function toResolvedUri(docUri: vscode.Uri): vscode.Uri {
  return vscode.Uri.parse(
    `${RESOLVED_SCHEME}:${docUri.path}?${JSON.stringify({ uri: docUri.toString() })}`
  );
}

/**
 * Construct a changedown-git-original:// URI for a given document URI.
 * Used for non-markdown files to proxy git's QuickDiff content.
 */
export function toGitOriginalUri(docUri: vscode.Uri): vscode.Uri {
  return vscode.Uri.parse(
    `${GIT_ORIGINAL_SCHEME}:${docUri.path}?${JSON.stringify({ uri: docUri.toString() })}`
  );
}
