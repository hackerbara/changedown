import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import type { ExtensionController } from '../controller';
import type { LanguageClient } from 'vscode-languageclient/node';
import { getCachedDecorationData } from '../lsp-client';

function testDocPath(): string {
    const id = process.env.CHANGETRACKS_TEST_INSTANCE_ID;
    const suffix = id ? `-${id}` : '';
    return path.join(os.tmpdir(), `changetracks-test-doc${suffix}.json`);
}

export function registerTestCommands(
    context: vscode.ExtensionContext,
    controller: ExtensionController,
    getClient: () => LanguageClient | undefined
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
                'commentsExpandedByDefault',
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
            const editor = vscode.window.activeTextEditor;
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
                // Temporarily suppress tracking during reset
                (controller as any).isApplyingTrackedEdit = true;
                try {
                    const fullRange = new vscode.Range(
                        editor.document.positionAt(0),
                        editor.document.positionAt(editor.document.getText().length)
                    );
                    await editor.edit(eb => eb.replace(fullRange, input.content));
                    // Move cursor to start
                    editor.selection = new vscode.Selection(0, 0, 0, 0);
                } finally {
                    (controller as any).isApplyingTrackedEdit = false;
                }
                fs.writeFileSync(statePath, JSON.stringify({ ok: true, timestamp: Date.now() }));
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
                    fs.writeFileSync(statePath, JSON.stringify({ ready: true, changeCount: cached.length, uri, timestamp: Date.now() }));
                    return;
                }
                await new Promise(r => setTimeout(r, pollInterval));
            }
            fs.writeFileSync(statePath, JSON.stringify({ ready: false, timeout: true, uri, timestamp: Date.now() }));
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
        })
    );
}
