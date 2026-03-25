import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import type { ExtensionController } from '../controller';
import type { LanguageClient } from 'vscode-languageclient/node';
import type { ChangeComments } from '../change-comments';
import { ChangeType } from '@changetracks/core';
import { getCachedDecorationData, invalidateDecorationCache } from '../lsp-client';
import { typeLabel } from '../visual-semantics';

function testDocPath(): string {
    const id = process.env.CHANGETRACKS_TEST_INSTANCE_ID;
    const suffix = id ? `-${id}` : '';
    return path.join(os.tmpdir(), `changetracks-test-doc${suffix}.json`);
}

export function registerTestCommands(
    context: vscode.ExtensionContext,
    controller: ExtensionController,
    getClient: () => LanguageClient | undefined,
    changeComments?: ChangeComments
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('changetracks._testReadConfig', () => {
            const config = vscode.workspace.getConfiguration('changetracks');
            const allKeys: Record<string, unknown> = {};
            const keys = [
                'trackingMode', 'defaultViewMode', 'decorationStyle',
                'author', 'preferGutter', 'commentInsertAuthor', 'confirmBulkThreshold',
                'editBoundary.pauseThresholdMs',
                'editBoundary.breakOnNewline',
                'clickToShowComments',
                'preview.showOriginalOnHover', 'preview.showMetadataInHover',
                'preview.autoExpandComments', 'preview.showStatusBarSummary',
                'preview.diffHighlightStyle', 'showWalkthroughOnStartup',
                'scmIntegrationMode',
            ];
            for (const key of keys) {
                allKeys[key] = config.get(key);
            }
            const statePath = path.join(os.tmpdir(), 'changetracks-test-config.json');
            fs.writeFileSync(statePath, JSON.stringify({ ...allKeys, timestamp: Date.now() }));
        }),
        vscode.commands.registerCommand('changetracks._testExtensionState', async () => {
            const ext = vscode.extensions.getExtension('hackerbara.changetracks-vscode');
            const state: Record<string, unknown> = {
                found: !!ext,
                active: ext?.isActive ?? false,
                hasApi: ext?.exports != null,
                hasExtendMarkdownIt: typeof ext?.exports?.extendMarkdownIt === 'function',
                hasDeactivate: typeof (ext?.exports as any)?.deactivate === 'function',
                commandCount: 0,
                timestamp: Date.now(),
            };
            const cmds = await vscode.commands.getCommands(true);
            const scCmds = cmds.filter((c: string) => c.startsWith('changetracks.'));
            state.commandCount = scCmds.length;
            state.commands = scCmds.sort();
            const statePath = path.join(os.tmpdir(), 'changetracks-test-ext-state.json');
            fs.writeFileSync(statePath, JSON.stringify(state));
        }),
        vscode.commands.registerCommand('changetracks._testLspClient', () => {
            const client = getClient();
            const state: Record<string, unknown> = {
                clientExists: !!client,
                clientRunning: client?.isRunning?.() ?? false,
                documentSelector: null as unknown,
                timestamp: Date.now(),
            };
            try {
                const opts = (client as any)?.clientOptions;
                if (opts?.documentSelector) {
                    state.documentSelector = opts.documentSelector;
                }
            } catch {
                // Ignore
            }
            const statePath = path.join(os.tmpdir(), 'changetracks-test-lsp-state.json');
            fs.writeFileSync(statePath, JSON.stringify(state));
        }),
        vscode.commands.registerCommand('changetracks._testQueryPanelState', () => {
            const editor = vscode.window.activeTextEditor
                ?? vscode.window.visibleTextEditors.find(e => e.document.languageId === 'markdown');
            const doc = editor?.document.languageId === 'markdown' ? editor.document : undefined;
            const changes = doc ? controller.getChangesForDocument(doc) : [];
            const state = {
                trackingEnabled: controller.trackingMode,
                viewMode: controller.viewMode,
                changeCount: changes.length,
                changeTypes: changes.map(c => c.type),
                hasActiveMarkdownEditor: !!doc,
                timestamp: Date.now(),
            };
            const tmpPath = path.join(os.tmpdir(), 'changetracks-test-state.json');
            fs.writeFileSync(tmpPath, JSON.stringify(state), 'utf8');
            return state;
        }),
        vscode.commands.registerCommand('changetracks._testGetDocumentText', () => {
            const editor = vscode.window.activeTextEditor;
            const text = editor?.document.getText() ?? '';
            const uri = editor?.document.uri.toString() ?? '';
            fs.writeFileSync(testDocPath(), JSON.stringify({ text, uri, timestamp: Date.now() }));
            return { text, uri };
        }),
        vscode.commands.registerCommand('changetracks._testGetCursorPosition', () => {
            const editor = vscode.window.activeTextEditor;
            const line = editor?.selection?.active?.line ?? -1;
            const statePath = path.join(os.tmpdir(), 'changetracks-test-cursor.json');
            fs.writeFileSync(statePath, JSON.stringify({ line: line + 1, timestamp: Date.now() }));
            return { line: line + 1 };
        }),
        vscode.commands.registerCommand('changetracks._testResetDocument', async () => {
            const inputPath = path.join(os.tmpdir(), 'changetracks-test-reset-input.json');
            const statePath = path.join(os.tmpdir(), 'changetracks-test-reset.json');
            try {
                const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    fs.writeFileSync(statePath, JSON.stringify({ ok: false, error: 'no active editor', timestamp: Date.now() }));
                    return;
                }
                // Full state reset BEFORE editor.edit() — critical ordering.
                // editor.edit() fires onDidChangeTextEditorSelection synchronously
                // during execution, which triggers cursor-move flush in the controller.
                // If there's a stale pending edit from a previous scenario, that flush
                // would crystallize it into the freshly-reset document. So we must:
                // 1. Disable tracking (prevents cursor-move flush guard)
                // 2. Abandon pending edits (nothing left to flush)
                // 3. Clear unconfirmed edits (prevents selection-confirmation gate)
                // 4. Set isApplyingTrackedEdit (prevents text change handler)
                // THEN call editor.edit().
                const uri = editor.document.uri.toString();

                // Steps 1–4: Reset all transient controller state atomically
                controller.resetForTest();

                // Step 5: Suppress tracking handler during edit
                let editSuccess = false;
                controller.isApplyingTrackedEdit = true;
                try {
                    const fullRange = new vscode.Range(
                        editor.document.positionAt(0),
                        editor.document.positionAt(editor.document.getText().length)
                    );
                    editSuccess = await editor.edit(eb => eb.replace(fullRange, input.content));

                    // Set tracking state and reset shadow/ID counter
                    const isTracked = input.content.includes('ctrcks.com/v1: tracked');
                    controller.setStateForTest(uri, {
                        tracking: isTracked,
                        shadow: input.content,
                        nextScId: 1,
                    });

                    // Move cursor (safe — pending edits already cleared)
                    editor.selection = new vscode.Selection(0, 0, 0, 0);

                    // Invalidate decoration cache
                    invalidateDecorationCache(uri);
                } finally {
                    controller.isApplyingTrackedEdit = false;
                }
                fs.writeFileSync(statePath, JSON.stringify({
                    ok: true,
                    editSuccess,
                    timestamp: Date.now(),
                }));
            } catch (err: any) {
                fs.writeFileSync(statePath, JSON.stringify({ ok: false, error: err.message, timestamp: Date.now() }));
            }
        }),
        vscode.commands.registerCommand('changetracks._testPasteClipboard', async () => {
            const inputPath = path.join(os.tmpdir(), 'changetracks-test-paste-input.json');
            try {
                const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
                await vscode.env.clipboard.writeText(input.text);
            } catch (err: any) {
                const statePath = path.join(os.tmpdir(), 'changetracks-test-paste-result.json');
                fs.writeFileSync(statePath, JSON.stringify({ ok: false, error: err.message, timestamp: Date.now() }));
            }
        }),
        vscode.commands.registerCommand('changetracks._testUpdateSetting', async () => {
            const inputPath = path.join(os.tmpdir(), 'changetracks-test-update-setting-input.json');
            const statePath = path.join(os.tmpdir(), 'changetracks-test-update-setting.json');
            try {
                const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
                await vscode.workspace.getConfiguration('changetracks').update(input.key, input.value, vscode.ConfigurationTarget.Global);
                fs.writeFileSync(statePath, JSON.stringify({ ok: true, key: input.key, value: input.value, timestamp: Date.now() }));
            } catch (err: any) {
                fs.writeFileSync(statePath, JSON.stringify({ ok: false, error: err.message, timestamp: Date.now() }));
            }
        }),
        // Section 11: waitForChanges — polls cache until LSP has sent data or timeout
        vscode.commands.registerCommand('changetracks._testWaitForChanges', async () => {
            const editor = vscode.window.activeTextEditor;
            const uri = editor?.document.uri.toString();
            const statePath = path.join(os.tmpdir(), 'changetracks-test-wait-changes.json');
            if (!uri) {
                fs.writeFileSync(statePath, JSON.stringify({ ready: false, error: 'no active editor', timestamp: Date.now() }));
                return;
            }
            const timeout = 10000;
            const pollInterval = 100;
            const start = Date.now();
            while (Date.now() - start < timeout) {
                const cached = getCachedDecorationData(uri);
                if (cached !== undefined) {
                    fs.writeFileSync(statePath, JSON.stringify({ ready: true, changeCount: cached.changes.length, uri, timestamp: Date.now() }));
                    return;
                }
                await new Promise(r => setTimeout(r, pollInterval));
            }
            fs.writeFileSync(statePath, JSON.stringify({ ready: false, timeout: true, uri, timestamp: Date.now() }));
        }),
        vscode.commands.registerCommand('changetracks._testPositionCursor', async () => {
            const inputPath = path.join(os.tmpdir(), 'changetracks-test-position-cursor-input.json');
            const statePath = path.join(os.tmpdir(), 'changetracks-test-position-cursor.json');
            try {
                const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    fs.writeFileSync(statePath, JSON.stringify({ ok: false, error: 'no active editor', timestamp: Date.now() }));
                    return;
                }

                let pos: vscode.Position;

                if (input.location === 'end') {
                    // Position at end of document
                    const lastLine = editor.document.lineCount - 1;
                    const lastCol = editor.document.lineAt(lastLine).text.length;
                    pos = new vscode.Position(lastLine, lastCol);
                } else if (input.location === 'start') {
                    // Position at start of document
                    pos = new vscode.Position(0, 0);
                } else if (typeof input.line === 'number' && typeof input.character === 'number') {
                    // Position at explicit line/character (0-based)
                    pos = new vscode.Position(input.line, input.character);
                } else if (input.target) {
                    // Original text-search mode
                    const text = editor.document.getText();
                    const idx = text.indexOf(input.target);
                    if (idx < 0) {
                        fs.writeFileSync(statePath, JSON.stringify({ ok: false, error: 'target not found', target: input.target, textLen: text.length, timestamp: Date.now() }));
                        return;
                    }
                    const offset = input.position === 'before' ? idx : idx + input.target.length;
                    pos = editor.document.positionAt(offset);
                } else {
                    fs.writeFileSync(statePath, JSON.stringify({ ok: false, error: 'no target, location, or line/character specified', timestamp: Date.now() }));
                    return;
                }

                editor.selection = new vscode.Selection(pos, pos);
                editor.revealRange(new vscode.Range(pos, pos));
                fs.writeFileSync(statePath, JSON.stringify({ ok: true, line: pos.line + 1, col: pos.character + 1, timestamp: Date.now() }));
            } catch (err: any) {
                fs.writeFileSync(statePath, JSON.stringify({ ok: false, error: err.message, timestamp: Date.now() }));
            }
        }),
        vscode.commands.registerCommand('changetracks._testSelectText', async () => {
            const inputPath = path.join(os.tmpdir(), 'changetracks-test-select-text-input.json');
            const statePath = path.join(os.tmpdir(), 'changetracks-test-select-text.json');
            try {
                const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    fs.writeFileSync(statePath, JSON.stringify({ ok: false, error: 'no active editor', timestamp: Date.now() }));
                    return;
                }
                const text = editor.document.getText();
                const idx = text.indexOf(input.target);
                if (idx < 0) {
                    fs.writeFileSync(statePath, JSON.stringify({ ok: false, error: 'target not found', target: input.target, timestamp: Date.now() }));
                    return;
                }
                const startPos = editor.document.positionAt(idx);
                const endPos = editor.document.positionAt(idx + input.target.length);
                editor.selection = new vscode.Selection(startPos, endPos);
                editor.revealRange(new vscode.Range(startPos, endPos));
                fs.writeFileSync(statePath, JSON.stringify({ ok: true, timestamp: Date.now() }));
            } catch (err: any) {
                fs.writeFileSync(statePath, JSON.stringify({ ok: false, error: err.message, timestamp: Date.now() }));
            }
        }),
        vscode.commands.registerCommand('changetracks._testSelectAndReplace', async () => {
            const inputPath = path.join(os.tmpdir(), 'changetracks-test-select-replace-input.json');
            const statePath = path.join(os.tmpdir(), 'changetracks-test-select-replace.json');
            try {
                const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    fs.writeFileSync(statePath, JSON.stringify({ ok: false, error: 'no active editor', timestamp: Date.now() }));
                    return;
                }

                let startPos: vscode.Position;
                let endPos: vscode.Position;

                if (typeof input.startLine === 'number' && typeof input.startCharacter === 'number') {
                    // Line/character mode (0-based)
                    startPos = new vscode.Position(input.startLine, input.startCharacter);
                    endPos = new vscode.Position(input.endLine, input.endCharacter);
                } else if (input.target) {
                    // Text-search mode
                    const text = editor.document.getText();
                    const idx = text.indexOf(input.target);
                    if (idx < 0) {
                        fs.writeFileSync(statePath, JSON.stringify({ ok: false, error: 'target not found', target: input.target, timestamp: Date.now() }));
                        return;
                    }
                    startPos = editor.document.positionAt(idx);
                    endPos = editor.document.positionAt(idx + input.target.length);
                } else {
                    fs.writeFileSync(statePath, JSON.stringify({ ok: false, error: 'no target or line/character specified', timestamp: Date.now() }));
                    return;
                }

                if (typeof input.replacement === 'string') {
                    // Replace mode: select and replace atomically via editor.edit
                    const range = new vscode.Range(startPos, endPos);
                    await editor.edit(builder => {
                        builder.replace(range, input.replacement);
                    });
                } else {
                    // Select-only mode: set selection for subsequent keyboard typing
                    editor.selection = new vscode.Selection(startPos, endPos);
                    editor.revealRange(new vscode.Range(startPos, endPos));
                }
                fs.writeFileSync(statePath, JSON.stringify({ ok: true, timestamp: Date.now() }));
            } catch (err: any) {
                fs.writeFileSync(statePath, JSON.stringify({ ok: false, error: err.message, timestamp: Date.now() }));
            }
        }),
        vscode.commands.registerCommand('changetracks._testExecuteCommand', async () => {
            const inputPath = path.join(os.tmpdir(), 'changetracks-test-exec-input.json');
            const statePath = path.join(os.tmpdir(), 'changetracks-test-exec.json');
            try {
                const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
                const commandId = input.command as string;
                const args = input.args as unknown[] | undefined;
                if (!commandId) {
                    fs.writeFileSync(statePath, JSON.stringify({ ok: false, error: 'no command specified', timestamp: Date.now() }));
                    return;
                }
                await vscode.commands.executeCommand(commandId, ...(args ?? []));
                fs.writeFileSync(statePath, JSON.stringify({ ok: true, command: commandId, timestamp: Date.now() }));
            } catch (err: any) {
                fs.writeFileSync(statePath, JSON.stringify({ ok: false, error: err.message, timestamp: Date.now() }));
            }
        }),
        // Task 0A: Get comment thread metadata
        vscode.commands.registerCommand('changetracks._testGetCommentThreads', () => {
            const statePath = path.join(os.tmpdir(), 'changetracks-test-comment-threads.json');
            try {
                const threads = changeComments?.getAllThreadData?.() ?? [];
                fs.writeFileSync(statePath, JSON.stringify({
                    threads,
                    count: threads.length,
                    timestamp: Date.now(),
                }));
            } catch (err: any) {
                fs.writeFileSync(statePath, JSON.stringify({ threads: [], count: 0, error: err.message, timestamp: Date.now() }));
            }
        }),
        // Task 0B: Get CodeLens items
        vscode.commands.registerCommand('changetracks._testGetCodeLensItems', async () => {
            const statePath = path.join(os.tmpdir(), 'changetracks-test-codelens.json');
            try {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    fs.writeFileSync(statePath, JSON.stringify({ items: [], count: 0, error: 'no active editor', timestamp: Date.now() }));
                    return;
                }
                const uri = editor.document.uri;
                const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
                    'vscode.executeCodeLensProvider', uri
                );
                fs.writeFileSync(statePath, JSON.stringify({
                    items: (lenses ?? []).map(l => ({
                        line: l.range.start.line + 1,
                        title: l.command?.title ?? '',
                        command: l.command?.command ?? '',
                    })),
                    count: lenses?.length ?? 0,
                    timestamp: Date.now(),
                }));
            } catch (err: any) {
                fs.writeFileSync(statePath, JSON.stringify({ items: [], count: 0, error: err.message, timestamp: Date.now() }));
            }
        }),
        // Task 0C: Get review panel card data
        vscode.commands.registerCommand('changetracks._testGetReviewPanelCards', () => {
            const statePath = path.join(os.tmpdir(), 'changetracks-test-review-panel-cards.json');
            try {
                const editor = vscode.window.activeTextEditor;
                const doc = editor?.document.languageId === 'markdown' ? editor.document : undefined;
                if (!doc) {
                    fs.writeFileSync(statePath, JSON.stringify({ cards: [], count: 0, error: 'no active markdown editor', timestamp: Date.now() }));
                    return;
                }
                const changes = controller.getChangesForDocument(doc);
                const text = doc.getText();
                const MAX_PREVIEW = 60;
                const cards = changes.map(c => {
                    let preview: string;
                    switch (c.type) {
                        case ChangeType.Substitution:
                            preview = [c.originalText ?? '', c.modifiedText ?? ''].filter(Boolean).join(' \u2192 ');
                            break;
                        case ChangeType.Insertion:
                            preview = c.modifiedText ?? '';
                            break;
                        case ChangeType.Deletion:
                            preview = c.originalText ?? '';
                            break;
                        case ChangeType.Comment:
                            preview = c.metadata?.comment ?? c.originalText ?? '';
                            break;
                        case ChangeType.Highlight:
                            preview = c.originalText ?? '';
                            break;
                        default:
                            preview = text.slice(c.contentRange.start, c.contentRange.end).replace(/\s+/g, ' ').trim();
                    }
                    preview = preview.replace(/\s+/g, ' ').trim();
                    if (preview.length > MAX_PREVIEW) {
                        preview = preview.slice(0, MAX_PREVIEW).trim() + '\u2026';
                    }
                    if (!preview) preview = '(empty)';
                    return {
                        changeId: c.id,
                        type: typeLabel(c.type),
                        status: (c.metadata?.status ?? c.inlineMetadata?.status ?? c.status ?? 'proposed').toLowerCase(),
                        author: c.metadata?.author ?? c.inlineMetadata?.author ?? '',
                        textPreview: preview,
                        replyCount: c.metadata?.discussion?.length ?? 0,
                    };
                });
                fs.writeFileSync(statePath, JSON.stringify({
                    cards,
                    count: cards.length,
                    timestamp: Date.now(),
                }));
            } catch (err: any) {
                fs.writeFileSync(statePath, JSON.stringify({ cards: [], count: 0, error: err.message, timestamp: Date.now() }));
            }
        })
    );
}
