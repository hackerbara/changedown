/**
 * @integration tier step definitions for git annotation tests (GIT1).
 *
 * These tests require real git repositories and the VS Code Extension Host.
 * They test getPreviousVersion(), annotateFromGit(), auto-annotate behavior,
 * SCM integration, and code file annotation support.
 *
 * Guard: the entire registration block is skipped when running outside
 * VS Code (e.g. `npm run test:features:fast`), because `vscode` won't
 * resolve to the real API. This prevents import failures in plain Node.js.
 */

// NOTE: The require('vscode') calls in this file are at module level (test runner
// process), NOT inside page.evaluate() (renderer process). They are NOT affected
// by VS Code's renderer sandboxing. The isVscodeAvailable guard correctly detects
// @fast vs @slow tier.
// Guard: skip registration when 'vscode' is the mock (no Extension Host)
const isVscodeAvailable = (() => {
    try {
        const mod = require('vscode');
        // The mock has no 'workspace' with a real getConfiguration.
        // Check for Extension Host indicators.
        return typeof mod.workspace?.getConfiguration === 'function'
            && typeof mod.extensions?.getExtension === 'function';
    } catch {
        return false;
    }
})();

if (isVscodeAvailable) {
    // Lazy-require everything inside the guard so that top-level imports
    // don't blow up when running in plain Node.js.
    const { Given, When, Then, Before, After } = require('@cucumber/cucumber');
    const assert = require('assert').strict;
    const vscode = require('vscode');
    const path = require('path');
    const fs = require('fs');
    const os = require('os');
    const { spawn } = require('child_process');
    const { getPreviousVersion } = require('changetracks-vscode/internals');
    const { annotateFromGit } = require('changetracks-vscode/internals');
    const { ExtensionController } = require('changetracks-vscode/internals');

    // ── Extend World with git annotation test state ─────────────────

    // NOTE: Module augmentation cannot be done inside a guard block.
    // We declare the fields we use on `this` dynamically.

    // ── Helpers ──────────────────────────────────────────────────────

    async function execGit(cwd: string, ...args: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const proc = spawn('git', args, { cwd });
            let stderr = '';
            proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
            proc.on('close', (code: number) => {
                if (code !== 0) reject(new Error(`Git command failed: ${stderr}`));
                else resolve();
            });
        });
    }

    async function waitForGitExtension(): Promise<void> {
        const maxAttempts = 10;
        const delayMs = 500;
        for (let i = 0; i < maxAttempts; i++) {
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (gitExtension?.isActive) return;
            await new Promise((resolve: any) => setTimeout(resolve, delayMs));
        }
        throw new Error('Git extension not available after waiting');
    }

    async function createTestRepo(world: any, repoName: string): Promise<string> {
        const repoPath = path.join(os.tmpdir(), `changetracks-test-${repoName}-${Date.now()}`);
        if (fs.existsSync(repoPath)) {
            fs.rmSync(repoPath, { recursive: true, force: true });
        }
        fs.mkdirSync(repoPath, { recursive: true });
        await execGit(repoPath, 'init');
        await execGit(repoPath, 'config', 'user.name', 'Test User');
        await execGit(repoPath, 'config', 'user.email', 'test@example.com');
        world.gitRepoPath = repoPath;
        return repoPath;
    }

    async function openFileInEditor(world: any, filePath: string): Promise<any> {
        const uri = vscode.Uri.file(filePath);
        world.gitFileUri = uri;
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);
        world.gitEditor = editor;
        return editor;
    }

    // ── Lifecycle ────────────────────────────────────────────────────

    Before({ tags: '@integration and @GIT1' }, function (this: any) {
        this.gitRepoPath = undefined;
        this.gitFilePath = undefined;
        this.gitFileUri = undefined;
        this.previousVersionResult = undefined;
        this.annotateResult = undefined;
        this.gitEditor = undefined;
        this.gitController = undefined;
        this.initialDocContent = undefined;
        this.initialCursorLine = undefined;
        this.initialCursorChar = undefined;
    });

    After({ tags: '@integration and @GIT1' }, async function (this: any) {
        if (this.gitRepoPath && fs.existsSync(this.gitRepoPath)) {
            fs.rmSync(this.gitRepoPath, { recursive: true, force: true });
        }
        if (this.gitController) {
            this.gitController.dispose();
            this.gitController = undefined;
        }
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    // ── Given steps: git repo setup ──────────────────────────────────

    Given('a git repo with file {string} committed as {string}', { timeout: 15000 }, async function (
        this: any, filename: string, content: string
    ) {
        const repoPath = await createTestRepo(this, 'git-annotation');
        const filePath = path.join(repoPath, filename);
        const unescaped = content.replace(/\\n/g, '\n');
        fs.writeFileSync(filePath, unescaped);
        await execGit(repoPath, 'add', filename);
        await execGit(repoPath, 'commit', '-m', 'Initial commit');
        this.gitFilePath = filePath;
        this.gitFileUri = vscode.Uri.file(filePath);
        await waitForGitExtension();
        await openFileInEditor(this, filePath);
        await new Promise((resolve: any) => setTimeout(resolve, 2000));
    });

    Given('a second commit with content {string}', { timeout: 10000 }, async function (
        this: any, content: string
    ) {
        assert.ok(this.gitFilePath, 'No git file path');
        assert.ok(this.gitRepoPath, 'No git repo path');
        const unescaped = content.replace(/\\n/g, '\n');
        fs.writeFileSync(this.gitFilePath, unescaped);
        const filename = path.basename(this.gitFilePath);
        await execGit(this.gitRepoPath, 'add', filename);
        await execGit(this.gitRepoPath, 'commit', '-m', 'Second commit');
    });

    Given('a third commit with content {string}', { timeout: 10000 }, async function (
        this: any, content: string
    ) {
        assert.ok(this.gitFilePath, 'No git file path');
        assert.ok(this.gitRepoPath, 'No git repo path');
        const unescaped = content.replace(/\\n/g, '\n');
        fs.writeFileSync(this.gitFilePath, unescaped);
        const filename = path.basename(this.gitFilePath);
        await execGit(this.gitRepoPath, 'add', filename);
        await execGit(this.gitRepoPath, 'commit', '-m', 'Third commit');
    });

    Given('a git repo with Python file {string} containing sidecar block', { timeout: 15000 }, async function (
        this: any, filename: string
    ) {
        const repoPath = await createTestRepo(this, 'py-sidecar');
        const filePath = path.join(repoPath, filename);
        fs.writeFileSync(filePath, 'print("hello")\n\n# -- ChangeTracks ---\n# [^ct-1]: ins\n');
        await execGit(repoPath, 'add', filename);
        await execGit(repoPath, 'commit', '-m', 'Add Python file');
        this.gitFilePath = filePath;
        await waitForGitExtension();
        await openFileInEditor(this, filePath);
        await new Promise((resolve: any) => setTimeout(resolve, 2000));
    });

    Given('a git repo with markdown file {string} containing CriticMarkup', { timeout: 15000 }, async function (
        this: any, filename: string
    ) {
        const repoPath = await createTestRepo(this, 'md-critic');
        const filePath = path.join(repoPath, filename);
        fs.writeFileSync(filePath, 'Hello {++world++}\n');
        await execGit(repoPath, 'add', filename);
        await execGit(repoPath, 'commit', '-m', 'Add annotated markdown');
        this.gitFilePath = filePath;
        await waitForGitExtension();
        await openFileInEditor(this, filePath);
        await new Promise((resolve: any) => setTimeout(resolve, 2000));
    });

    Given('a file outside any git repo', { timeout: 5000 }, async function (this: any) {
        const nonGitPath = path.join(os.tmpdir(), `changetracks-test-non-git-${Date.now()}`);
        fs.mkdirSync(nonGitPath, { recursive: true });
        const filePath = path.join(nonGitPath, 'file.md');
        fs.writeFileSync(filePath, 'Content\n');
        this.gitFilePath = filePath;
        this.gitFileUri = vscode.Uri.file(filePath);
        this.gitRepoPath = nonGitPath;
        await openFileInEditor(this, filePath);
    });

    Given('an untitled document with content {string}', { timeout: 5000 }, async function (
        this: any, content: string
    ) {
        const unescaped = content.replace(/\\n/g, '\n');
        const doc = await vscode.workspace.openTextDocument({ content: unescaped });
        this.gitEditor = await vscode.window.showTextDocument(doc);
        this.initialDocContent = unescaped;
    });

    Given('persistAnnotations config is true', { timeout: 5000 }, async function (this: any) {
        const config = vscode.workspace.getConfiguration('changetracks');
        const shouldPersist = config.get('persistAnnotations', true);
        assert.strictEqual(shouldPersist, true, 'persistAnnotations should default to true');
    });

    Given('annotateOnOpen config is {word}', { timeout: 5000 }, async function (
        this: any, value: string
    ) {
        const config = vscode.workspace.getConfiguration('changetracks');
        await config.update('annotateOnOpen', value === 'true', vscode.ConfigurationTarget.Global);
    });

    Given('the fixture file {string} is open in the editor', { timeout: 10000 }, async function (
        this: any, filename: string
    ) {
        // __dirname at runtime: out/features/steps/ (compiled from packages/tests/vscode/)
        // Fixtures live in the source tree: packages/tests/vscode/fixtures/
        const packageRoot = path.resolve(__dirname, '../../..');
        const fixturePath = path.join(packageRoot, 'fixtures', filename);
        const uri = vscode.Uri.file(fixturePath);
        const doc = await vscode.workspace.openTextDocument(uri);
        this.gitEditor = await vscode.window.showTextDocument(doc);
        this.gitFileUri = uri;

        const extension = vscode.extensions.getExtension('hackerbara.changetracks-vscode')
            ?? vscode.extensions.all.find((ext: any) => ext.id.endsWith('.changetracks-vscode'));
        if (extension) {
            const context = {
                subscriptions: [],
                extensionPath: extension.extensionPath,
                extensionUri: extension.extensionUri,
                environmentVariableCollection: {} as any,
                storageUri: undefined,
                storagePath: undefined,
                globalStorageUri: vscode.Uri.file(path.join(extension.extensionPath, '.vscode-test', 'global-storage')),
                globalStoragePath: path.join(extension.extensionPath, '.vscode-test', 'global-storage'),
                logUri: vscode.Uri.file(path.join(extension.extensionPath, '.vscode-test', 'logs')),
                logPath: path.join(extension.extensionPath, '.vscode-test', 'logs'),
                extensionMode: vscode.ExtensionMode.Test,
                asAbsolutePath: (relativePath: string) => path.join(extension.extensionPath, relativePath),
                globalState: { get: () => undefined, update: async () => {}, keys: () => [], setKeysForSync: () => {} } as any,
                workspaceState: { get: () => undefined, update: async () => {}, keys: () => [] } as any,
                secrets: {} as any,
                extension,
                languageModelAccessInformation: {} as any,
            };
            this.gitController = new ExtensionController(context);
        }
        this.initialDocContent = doc.getText();
    });

    // ── When steps: file modifications ───────────────────────────────

    When('I modify the file to {string}', { timeout: 5000 }, async function (
        this: any, content: string
    ) {
        assert.ok(this.gitFilePath, 'No git file path');
        const unescaped = content.replace(/\\n/g, '\n');
        fs.writeFileSync(this.gitFilePath, unescaped);
    });

    When('I create a new untracked file {string} with content {string}', { timeout: 5000 }, async function (
        this: any, filename: string, content: string
    ) {
        assert.ok(this.gitRepoPath, 'No git repo path');
        const filePath = path.join(this.gitRepoPath, filename);
        const unescaped = content.replace(/\\n/g, '\n');
        fs.writeFileSync(filePath, unescaped);
        this.gitFilePath = filePath;
        this.gitFileUri = vscode.Uri.file(filePath);
    });

    When('I get the previous version', { timeout: 5000 }, async function (this: any) {
        assert.ok(this.gitFileUri, 'No git file URI');
        this.previousVersionResult = await getPreviousVersion(this.gitFileUri);
    });

    When('I get the previous version of {string}', { timeout: 5000 }, async function (
        this: any, filename: string
    ) {
        assert.ok(this.gitRepoPath, 'No git repo path');
        const filePath = path.join(this.gitRepoPath, filename);
        const uri = vscode.Uri.file(filePath);
        this.previousVersionResult = await getPreviousVersion(uri);
    });

    When('I run annotateFromGit on the editor', { timeout: 10000 }, async function (this: any) {
        assert.ok(this.gitEditor, 'No editor available');
        if (this.gitEditor.document.uri.scheme === 'file') {
            await vscode.commands.executeCommand('workbench.action.files.revert');
            await new Promise((resolve: any) => setTimeout(resolve, 500));
        }
        this.annotateResult = await annotateFromGit(this.gitEditor);
    });

    When('I open the file in the editor', { timeout: 10000 }, async function (this: any) {
        assert.ok(this.gitFilePath, 'No git file path');
        await openFileInEditor(this, this.gitFilePath);
        await new Promise((resolve: any) => setTimeout(resolve, 1000));
    });

    When('I wait for potential auto-annotation', { timeout: 5000 }, async function () {
        await new Promise((resolve: any) => setTimeout(resolve, 1000));
    });

    When('I position cursor at line {int} character {int}', { timeout: 5000 }, async function (
        this: any, line: number, char: number
    ) {
        assert.ok(this.gitEditor, 'No editor available');
        this.initialCursorLine = this.gitEditor.selection.active.line;
        this.initialCursorChar = this.gitEditor.selection.active.character;
        this.gitEditor.selection = new vscode.Selection(line, char, line, char);
    });

    When('I run acceptChangeAtCursor', { timeout: 5000 }, async function (this: any) {
        assert.ok(this.gitController, 'No ExtensionController');
        this.initialDocContent = this.gitEditor?.document.getText();
        await this.gitController.acceptChangeAtCursor();
    });

    When('I run nextChange', { timeout: 5000 }, async function (this: any) {
        assert.ok(this.gitController, 'No ExtensionController');
        this.initialCursorLine = this.gitEditor?.selection.active.line;
        this.initialCursorChar = this.gitEditor?.selection.active.character;
        await this.gitController.nextChange();
    });

    // ── Then steps: previous version assertions ──────────────────────

    Then('the previous version old text is {string}', function (this: any, expected: string) {
        assert.ok(this.previousVersionResult, 'Previous version result is undefined');
        const unescaped = expected.replace(/\\n/g, '\n');
        assert.strictEqual(this.previousVersionResult.oldText, unescaped);
    });

    Then('the previous version author is {string}', function (this: any, expected: string) {
        assert.ok(this.previousVersionResult, 'Previous version result is undefined');
        assert.strictEqual(this.previousVersionResult.author, expected);
    });

    Then('the previous version has a date', function (this: any) {
        assert.ok(this.previousVersionResult, 'Previous version result is undefined');
        assert.ok(this.previousVersionResult.date, 'Should return commit date');
    });

    Then('the previous version is undefined', function (this: any) {
        assert.strictEqual(this.previousVersionResult, undefined, 'Should return undefined');
    });

    // ── Then steps: annotateFromGit assertions ───────────────────────

    Then('annotateFromGit returns {word}', function (this: any, expected: string) {
        assert.strictEqual(this.annotateResult, expected === 'true');
    });

    Then('the document contains CriticMarkup annotations', function (this: any) {
        assert.ok(this.gitEditor, 'No editor available');
        const content = this.gitEditor.document.getText();
        assert.ok(
            content.includes('{++') || content.includes('{--') || content.includes('{~~'),
            'Document should contain CriticMarkup annotations'
        );
    });

    Then('the document does not contain CriticMarkup annotations', function (this: any) {
        assert.ok(this.gitEditor, 'No editor available');
        const content = this.gitEditor.document.getText();
        assert.ok(!content.includes('{++'), 'Should not contain insertions');
        assert.ok(!content.includes('{--'), 'Should not contain deletions');
    });

    Then('the document does not contain sidecar block', function (this: any) {
        assert.ok(this.gitEditor, 'No editor available');
        const content = this.gitEditor.document.getText();
        assert.ok(!content.includes('-- ChangeTracks'), 'Should not contain sidecar block');
    });

    Then('the document contains sidecar block {string}', function (this: any, expected: string) {
        assert.ok(this.gitEditor, 'No editor available');
        const content = this.gitEditor.document.getText();
        assert.ok(content.includes(expected), `Document should contain "${expected}"`);
    });

    Then('the git document contains {string}', function (this: any, expected: string) {
        assert.ok(this.gitEditor, 'No editor available');
        const content = this.gitEditor.document.getText();
        assert.ok(content.includes(expected), `Document should contain "${expected}"`);
    });

    Then('the document is not dirty', function (this: any) {
        assert.ok(this.gitEditor, 'No editor available');
        assert.strictEqual(this.gitEditor.document.isDirty, false, 'Document should be saved');
    });

    Then('the document content is unchanged', function (this: any) {
        assert.ok(this.gitEditor, 'No editor available');
        assert.ok(this.initialDocContent !== undefined, 'No initial content recorded');
        const content = this.gitEditor.document.getText();
        assert.strictEqual(content, this.initialDocContent, 'Document content should not have changed');
    });

    Then('the document content is {string}', function (this: any, expected: string) {
        assert.ok(this.gitEditor, 'No editor available');
        const unescaped = expected.replace(/\\n/g, '\n');
        assert.strictEqual(this.gitEditor.document.getText(), unescaped);
    });

    Then('the document text changed', function (this: any) {
        assert.ok(this.gitEditor, 'No editor available');
        const newText = this.gitEditor.document.getText();
        assert.notStrictEqual(newText, this.initialDocContent, 'Text should have changed after accepting');
    });

    Then('the cursor position changed', function (this: any) {
        assert.ok(this.gitEditor, 'No editor available');
        const currentLine = this.gitEditor.selection.active.line;
        const currentChar = this.gitEditor.selection.active.character;
        assert.ok(
            currentLine !== this.initialCursorLine || currentChar !== this.initialCursorChar,
            'Cursor should have moved'
        );
    });

    // ── Then steps: SCM integration assertions ──────────────────────

    Then('the scmIntegrationMode config value is one of {string}', function (
        this: any, validValues: string
    ) {
        const config = vscode.workspace.getConfiguration('changetracks');
        const mode = config.get('scmIntegrationMode', 'scm-first');
        const valid = validValues.split(',');
        assert.ok(valid.includes(mode), `scmIntegrationMode "${mode}" should be one of ${validValues}`);
    });

    Then('the command {string} is registered', async function (this: any, commandId: string) {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes(commandId), `Command "${commandId}" should be registered`);
    });
}
