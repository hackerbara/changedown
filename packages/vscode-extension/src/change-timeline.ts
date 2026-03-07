import * as vscode from 'vscode';
import { ChangeNode, ChangeType, ChangeStatus } from '@changetracks/core';
import type { ExtensionController } from './controller';
import { typeLabelCapitalized, iconForType } from './visual-semantics';

/**
 * Provides timeline entries for ChangeTracks changes in the Explorer.
 * Each footnoted change produces a "proposed" event, and discussion
 * entries produce additional events.
 *
 * NOTE: The Timeline API is a proposed (not yet stable) VS Code API.
 * Type definitions are vendored in vscode.proposed.timeline.d.ts.
 * Registration requires `enabledApiProposals: ["timeline"]` in package.json.
 */
export class ChangeTimelineProvider implements vscode.TimelineProvider {
  readonly id = 'changetracksTimeline';
  readonly label = 'ChangeTracks Changes';

  private _onDidChange = new vscode.EventEmitter<vscode.TimelineChangeEvent | undefined>();
  readonly onDidChange = this._onDidChange.event;

  private disposables: vscode.Disposable[] = [];

  constructor(private controller: ExtensionController) {
    this.disposables.push(
      controller.onDidChangeChanges(() => {
        this._onDidChange.fire(undefined);
      })
    );
  }

  async provideTimeline(
    uri: vscode.Uri,
    _options: vscode.TimelineOptions,
    _token: vscode.CancellationToken
  ): Promise<vscode.Timeline> {
    const doc = await vscode.workspace.openTextDocument(uri);
    const changes = this.controller.getChangesForDocument(doc);

    const items: vscode.TimelineItem[] = [];

    for (const change of changes) {
      if (change.level < 2) continue;
      const meta = change.metadata;
      if (!meta?.date) continue;

      const timestamp = new Date(meta.date).getTime();
      const tLabel = typeLabelCapitalized(change.type);
      const statusLabel = this.statusLabel(change.status);
      const author = meta.author ?? 'unknown';

      // Main change event
      const mainItem = new vscode.TimelineItem(`${tLabel} ${statusLabel}`, timestamp);
      mainItem.description = author;
      mainItem.iconPath = iconForType(change.type);
      mainItem.command = {
        command: 'changetracks.revealChange',
        title: 'Go to change',
        arguments: [change.id],
      };
      items.push(mainItem);

      // Discussion entries as separate timeline items
      if (meta.discussion) {
        for (const entry of meta.discussion) {
          const entryTimestamp = entry.date ? new Date(entry.date).getTime() : timestamp + 1;
          const replyItem = new vscode.TimelineItem(`Reply on [^${change.id}]`, entryTimestamp);
          replyItem.description = entry.author;
          replyItem.iconPath = new vscode.ThemeIcon('comment-discussion');
          replyItem.command = {
            command: 'changetracks.revealChange',
            title: 'Go to change',
            arguments: [change.id],
          };
          items.push(replyItem);
        }
      }
    }

    // Sort chronologically (newest first)
    items.sort((a, b) => b.timestamp - a.timestamp);

    return { items };
  }

  private statusLabel(status: ChangeStatus): string {
    switch (status) {
      case ChangeStatus.Proposed: return 'proposed';
      case ChangeStatus.Accepted: return 'accepted';
      case ChangeStatus.Rejected: return 'rejected';
    }
  }

  dispose(): void {
    this._onDidChange.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
