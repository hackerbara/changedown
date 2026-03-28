import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { loadCliInit } from '../cli-init';

export function registerSetupCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('changedown.setupProject', async () => {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showWarningMessage('Open a folder first to set up ChangeDown.');
                return;
            }

            const workspaceRoot = workspaceFolder.uri.fsPath;
            const configDir = path.join(workspaceRoot, '.changedown');
            const configPath = path.join(configDir, 'config.toml');

            if (fs.existsSync(configPath)) {
                vscode.window.showInformationMessage('ChangeDown is already configured in this project.');
                return;
            }

            const cli = await loadCliInit();
            const author = cli.resolveIdentity(workspaceRoot);
            const configToml = cli.generateDefaultConfig({ author });

            fs.mkdirSync(configDir, { recursive: true });
            fs.writeFileSync(configPath, configToml, 'utf8');

            const bundledExamples = path.join(context.extensionPath, 'media', 'examples');
            const targetExamples = path.join(workspaceRoot, 'examples');
            if (fs.existsSync(bundledExamples)) {
                fs.mkdirSync(targetExamples, { recursive: true });
                for (const file of fs.readdirSync(bundledExamples)) {
                    const dest = path.join(targetExamples, file);
                    if (!fs.existsSync(dest)) {
                        fs.copyFileSync(path.join(bundledExamples, file), dest);
                    }
                }
            } else {
                await cli.copyExamples(workspaceRoot);
            }

            if (cli.hasGitignore(workspaceRoot)) {
                cli.ensureGitignoreEntries(workspaceRoot);
            } else {
                cli.createGitignore(workspaceRoot);
            }

            await vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
            vscode.window.showInformationMessage('ChangeDown initialized! Continue the walkthrough to explore.');
        }),
        vscode.commands.registerCommand('changedown.openDemo', async () => {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showWarningMessage('Open a folder first.');
                return;
            }
            const demoPath = path.join(workspaceFolder.uri.fsPath, 'examples', 'getting-started.md');
            if (fs.existsSync(demoPath)) {
                await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(demoPath), vscode.ViewColumn.Beside);
            } else {
                const bundled = path.join(context.extensionPath, 'media', 'examples', 'getting-started.md');
                if (fs.existsSync(bundled)) {
                    fs.mkdirSync(path.dirname(demoPath), { recursive: true });
                    fs.copyFileSync(bundled, demoPath);
                    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(demoPath), vscode.ViewColumn.Beside);
                } else {
                    vscode.window.showWarningMessage('Demo file not found. Run "Set Up This Project" first.');
                    return;
                }
            }
            await vscode.commands.executeCommand('changedownReview.focus');
        }),
        vscode.commands.registerCommand('changedown.revealSettingsPanel', async () => {
            await vscode.commands.executeCommand('changedownSettings.focus');
        }),
        vscode.commands.registerCommand('changedown.openExample', async () => {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showWarningMessage('Open a folder first.');
                return;
            }
            const examplePath = path.join(workspaceFolder.uri.fsPath, 'examples', 'api-caching-deliberation.md');
            if (!fs.existsSync(examplePath)) {
                const bundled = path.join(context.extensionPath, 'media', 'examples', 'api-caching-deliberation.md');
                if (fs.existsSync(bundled)) {
                    fs.mkdirSync(path.dirname(examplePath), { recursive: true });
                    fs.copyFileSync(bundled, examplePath);
                }
            }
            if (fs.existsSync(examplePath)) {
                const doc = await vscode.workspace.openTextDocument(examplePath);
                await vscode.window.showTextDocument(doc, {
                    viewColumn: vscode.ViewColumn.Beside,
                    preview: false,
                });
            } else {
                vscode.window.showWarningMessage('Example file not found. Run "Set Up This Project" first.');
            }
        }),
        vscode.commands.registerCommand('changedown.setupAgents', async () => {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) return;

            const cli = await loadCliInit();
            const agents = cli.detectAgents();
            const detected = agents.filter(a => a.detected);

            if (detected.length === 0) {
                vscode.window.showInformationMessage(
                    'No AI coding agents detected. Install Claude Code, Cursor, or OpenCode to use agent features.'
                );
                return;
            }

            const results = await cli.configureAgents(workspaceRoot, agents);
            vscode.window.showInformationMessage(`Configured: ${results.join('; ')}`);
        })
    );
}
