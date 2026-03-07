/**
 * Hover provider for ChangeTracks changes.
 * Shows comment/reason tooltip when hovering over any change that has metadata.comment.
 * This guarantees hover works regardless of decoration or LSP hover behavior.
 */

import * as vscode from 'vscode';
import { ChangeNode, ChangeType } from '@changetracks/core';
import { positionToOffset } from './converters';
import type { ExtensionController } from './controller';

export function registerHoverProvider(
    context: vscode.ExtensionContext,
    controller: ExtensionController
): void {
    const selector: vscode.DocumentSelector = [
        { language: 'markdown' },
        { scheme: 'file', pattern: '**/*' } // sidecar-annotated code files
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
                const isTracked = document.languageId === 'markdown'
                    && /<!--\s*ctrcks\.com\/v1:\s*tracked\s*-->/.test(text);
                const offset = positionToOffset(text, position);
                const changes = controller.getChangesForDocument(document);
                const change = changes.find(
                    (c) => offset >= c.range.start && offset < c.range.end
                );
                if (!change) {
                    // No change at position: show add-comment discoverability (tracked files only)
                    if (isTracked) {
                        const hint = new vscode.MarkdownString();
                        hint.appendMarkdown('**ChangeTracks:** Select text, then right-click → *Add Comment* (or **Alt+Cmd+/**) to leave a comment.');
                        return new vscode.Hover(hint);
                    }
                    return null;
                }
                // Level 1: show inline metadata (author, date, status) in hover
                if (change.inlineMetadata) {
                    const md = new vscode.MarkdownString();
                    if (change.inlineMetadata.author) md.appendMarkdown(`**Author:** ${change.inlineMetadata.author}\n\n`);
                    if (change.inlineMetadata.date) md.appendMarkdown(`**Date:** ${change.inlineMetadata.date}\n\n`);
                    if (change.inlineMetadata.status) md.appendMarkdown(`**Status:** ${change.inlineMetadata.status}\n\n`);
                    if (change.inlineMetadata.freeText) md.appendMarkdown(`**Note:** ${change.inlineMetadata.freeText}\n\n`);
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
                        if (author) md.appendMarkdown(`**Author:** ${author}\n\n`);
                        if (date) md.appendMarkdown(`**Date:** ${date}\n\n`);
                        if (status) md.appendMarkdown(`**Status:** ${status}\n\n`);
                        const first = change.metadata.discussion[0];
                        md.appendMarkdown(`${first.text}`);
                        if (change.metadata.discussion.length > 1) {
                            md.appendMarkdown(`\n\n*+${change.metadata.discussion.length - 1} more replies*`);
                        }
                        return new vscode.Hover(md);
                    }
                    // No discussion either: show add-comment hint (tracked files only)
                    if (isTracked) {
                        const hint = new vscode.MarkdownString();
                        hint.appendMarkdown('**ChangeTracks:** Right-click → *Add Comment* to add a comment here, or **Alt+Cmd+/**.');
                        return new vscode.Hover(hint);
                    }
                    return null;
                }
                const commentText = change.metadata.comment;
                const label =
                    change.type === ChangeType.Comment || change.type === ChangeType.Highlight
                        ? 'Comment'
                        : 'Reason';
                const markdown = new vscode.MarkdownString();
                markdown.appendMarkdown(`**${label}:** ${commentText}`);
                return new vscode.Hover(markdown);
            }
        }
    );

    context.subscriptions.push(provider);
}
