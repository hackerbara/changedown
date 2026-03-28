/**
 * Hover provider for ChangeDown changes.
 * Shows comment/reason tooltip when hovering over any change that has metadata.comment.
 * This guarantees hover works regardless of decoration or LSP hover behavior.
 */

import * as vscode from 'vscode';
import { ChangeNode, ChangeType } from '@changedown/core';
import { positionToOffset } from './converters';
import type { ExtensionController } from './controller';

export function registerHoverProvider(
    context: vscode.ExtensionContext,
    controller: ExtensionController
): void {
    const selector: vscode.DocumentSelector = [
        { language: 'markdown' },
    ];

    const provider = vscode.languages.registerHoverProvider(
        selector,
        {
            provideHover(
                document: vscode.TextDocument,
                position: vscode.Position,
                _token: vscode.CancellationToken
            ): vscode.ProviderResult<vscode.Hover> {
                const text = document.getText();
                const offset = positionToOffset(text, position);
                const changes = controller.getChangesForDocument(document);
                const change = changes.find(
                    (c) => (c.range.start === c.range.end)
                        ? offset === c.range.start  // zero-width: exact match (L3 deletions)
                        : offset >= c.range.start && offset < c.range.end
                );
                if (!change) {
                    // No change at position — no hover hint.
                    // Add Comment is discoverable via right-click menu and Alt+Cmd+/.
                    return null;
                }
                // Level 1: show inline metadata (author, date, status) in hover
                if (change.inlineMetadata) {
                    const md = new vscode.MarkdownString();
                    if (change.inlineMetadata.author) { md.appendMarkdown('**Author:** '); md.appendText(change.inlineMetadata.author); md.appendMarkdown('\n\n'); }
                    if (change.inlineMetadata.date) { md.appendMarkdown('**Date:** '); md.appendText(change.inlineMetadata.date); md.appendMarkdown('\n\n'); }
                    if (change.inlineMetadata.status) { md.appendMarkdown('**Status:** '); md.appendText(change.inlineMetadata.status); md.appendMarkdown('\n\n'); }
                    if (change.inlineMetadata.freeText) { md.appendMarkdown('**Note:** '); md.appendText(change.inlineMetadata.freeText); md.appendMarkdown('\n\n'); }
                    const content = md.value.trim();
                    if (content) return new vscode.Hover(md);
                }
                if (!change.metadata?.comment?.trim()) {
                    // Try discussion entries as fallback
                    if (change.metadata?.discussion?.length) {
                        const md = new vscode.MarkdownString();
                        const author = change.metadata?.author ?? change.inlineMetadata?.author;
                        const date = change.metadata?.date ?? change.inlineMetadata?.date;
                        const status = change.metadata?.status ?? change.inlineMetadata?.status ?? change.status;
                        if (author) { md.appendMarkdown('**Author:** '); md.appendText(author); md.appendMarkdown('\n\n'); }
                        if (date) { md.appendMarkdown('**Date:** '); md.appendText(date); md.appendMarkdown('\n\n'); }
                        if (status) { md.appendMarkdown('**Status:** '); md.appendText(status); md.appendMarkdown('\n\n'); }
                        const first = change.metadata.discussion[0];
                        md.appendText(first.text);
                        if (change.metadata.discussion.length > 1) {
                            md.appendMarkdown(`\n\n*+${change.metadata.discussion.length - 1} more replies*`);
                        }
                        return new vscode.Hover(md);
                    }
                    // No comment or discussion — no hover hint.
                    return null;
                }
                const commentText = change.metadata.comment;
                const label =
                    change.type === ChangeType.Comment || change.type === ChangeType.Highlight
                        ? 'Comment'
                        : 'Reason';
                const markdown = new vscode.MarkdownString();
                markdown.appendMarkdown(`**${label}:** `);
                markdown.appendText(commentText);
                return new vscode.Hover(markdown);
            }
        }
    );

    context.subscriptions.push(provider);
}
