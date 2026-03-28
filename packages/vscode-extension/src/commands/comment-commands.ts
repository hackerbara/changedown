import * as vscode from 'vscode';
import { scanMaxCnId, generateFootnoteDefinition } from '@changedown/core';
import { findReplyInsertionPoint, formatReply } from '../footnote-writer';
import { offsetToPosition } from '../converters';
import { resolveAuthorIdentity } from '../author-identity';
import type { ExtensionController } from '../controller';
export interface CommentCommandsContext {
    getChangeIdForThread(thread: vscode.CommentThread): string | undefined;
}

export function registerCommentCommands(
    context: vscode.ExtensionContext,
    controller: ExtensionController,
    changeComments: CommentCommandsContext
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('changedown.acceptChangeFromThread', async (thread: vscode.CommentThread) => {
            const changeId = changeComments.getChangeIdForThread(thread);
            if (changeId) await controller.acceptChangeAtCursor(changeId);
        }),
        vscode.commands.registerCommand('changedown.rejectChangeFromThread', async (thread: vscode.CommentThread) => {
            const changeId = changeComments.getChangeIdForThread(thread);
            if (changeId) await controller.rejectChangeAtCursor(changeId);
        }),
        vscode.commands.registerCommand('changedown.createComment', async (reply: vscode.CommentReply) => {
            const thread = reply.thread;
            if (!thread.range || !reply.text.trim()) {
                thread.dispose();
                return;
            }
            const config = vscode.workspace.getConfiguration('changedown');
            const format = config.get<'inline' | 'footnote'>('commentInsertFormat', 'footnote');
            const includeAuthor = config.get<boolean>('commentInsertAuthor', true);
            const author = includeAuthor ? resolveAuthorIdentity() : undefined;

            const doc = await vscode.workspace.openTextDocument(thread.uri);
            const text = doc.getText();
            const rangeText = doc.getText(thread.range);
            const commentBody = reply.text.trim();

            const wsEdit = new vscode.WorkspaceEdit();
            if (format === 'footnote') {
                const date = new Date().toISOString().slice(0, 10);
                const maxId = scanMaxCnId(text);
                const newId = `cn-${maxId + 1}`;
                const inlinePart = `{==${rangeText}==}{>> ${commentBody} <<}[^${newId}]`;
                const footnoteDef = generateFootnoteDefinition(newId, 'comment', author, date);
                const firstLine = author ? formatReply(author, commentBody) : '\n    ' + commentBody.replace(/\n/g, '\n    ');
                const footnoteBlock = footnoteDef + firstLine;

                const rangeStart = doc.offsetAt(thread.range.start);
                const rangeEnd = doc.offsetAt(thread.range.end);
                const simulatedText = text.slice(0, rangeStart) + inlinePart + text.slice(rangeEnd);
                const endPos = offsetToPosition(simulatedText, simulatedText.length);

                wsEdit.replace(thread.uri, thread.range, inlinePart);
                wsEdit.insert(thread.uri, endPos, footnoteBlock);
            } else {
                const body = includeAuthor && author ? `@${author}: ${commentBody}` : commentBody;
                const newText = `{==${rangeText}==}{>> ${body} <<}`;
                wsEdit.replace(thread.uri, thread.range, newText);
            }
            await controller.runWithTrackedEditGuard(() => vscode.workspace.applyEdit(wsEdit));
            thread.dispose();
        }),
        vscode.commands.registerCommand('changedown.resolveThread', async (thread: vscode.CommentThread) => {
            const changeId = changeComments.getChangeIdForThread(thread);
            if (!changeId) return;
            await controller.sendLifecycleRequest('changedown/resolveThread', { changeId });
        }),
        vscode.commands.registerCommand('changedown.unresolveThread', async (thread: vscode.CommentThread) => {
            const changeId = changeComments.getChangeIdForThread(thread);
            if (!changeId) return;
            await controller.sendLifecycleRequest('changedown/unresolveThread', { changeId });
        }),
        vscode.commands.registerCommand('changedown.replyToThread', async (reply: vscode.CommentReply) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;

            const text = editor.document.getText();
            const author = resolveAuthorIdentity();
            const changeId = changeComments.getChangeIdForThread(reply.thread);

            if (changeId) {
                const insertOffset = findReplyInsertionPoint(text, changeId);
                if (insertOffset === null) return;
                const replyText = formatReply(author, reply.text);
                const pos = editor.document.positionAt(insertOffset);
                await controller.runWithTrackedEditGuard(() =>
                    editor.edit(editBuilder => {
                        editBuilder.insert(pos, replyText);
                    })
                );
            } else {
                const changes = controller.getChangesForDocument(editor.document);
                const date = new Date().toISOString().slice(0, 10);
                const threadRange = reply.thread.range;
                if (!threadRange) return;
                const threadStart = editor.document.offsetAt(threadRange.start);
                const threadEnd = editor.document.offsetAt(threadRange.end);
                const change = changes.find(c =>
                    c.contentRange.start >= threadStart && c.contentRange.end <= threadEnd + 5
                );
                if (!change) return;

                const maxId = scanMaxCnId(text);
                const newId = `cn-${maxId + 1}`;
                const typeLabel = change.type.toLowerCase();
                const closingOffset = change.range.end;

                const footnoteRef = `[^${newId}]`;
                const footnoteDef = `\n\n[^${newId}]: @${author} | ${date} | ${typeLabel} | proposed`;
                const replyLine = `\n    @${author} ${date}: ${reply.text}`;

                const wsEdit = new vscode.WorkspaceEdit();
                const refPos = editor.document.positionAt(closingOffset);
                const endPos = editor.document.positionAt(text.length);

                wsEdit.insert(editor.document.uri, refPos, footnoteRef);
                wsEdit.insert(editor.document.uri, endPos, footnoteDef + replyLine);

                await controller.runWithTrackedEditGuard(() => vscode.workspace.applyEdit(wsEdit));
            }
        })
    );
}
