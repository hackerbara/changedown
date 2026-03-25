/**
 * @fast tier step definitions for LSP-LF — Lifecycle LSP custom requests.
 *
 * Tests LSP custom request handlers in-process (no VS Code launch).
 * Creates a mock Connection, instantiates ChangetracksServer,
 * populates textCache via handleDocumentOpen, and calls handlers directly.
 */

import { Given, When, Then, Before } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import { createServer } from '@changetracks/lsp-server/internals';
import type { ChangetracksServer } from '@changetracks/lsp-server/internals';
import { ensureL2 } from '@changetracks/core';
import type { ChangeTracksWorld } from './world';

// ── Extend World with LSP test state ────────────────────────────────

declare module './world' {
    interface ChangeTracksWorld {
        lspServer?: ChangetracksServer;
        lspResult?: any;
        lspConfigResult?: any;
    }
}

// ── Lifecycle ────────────────────────────────────────────────────────

Before({ tags: '@fast and @LSP-LF' }, function (this: ChangeTracksWorld) {
    this.lspServer = undefined;
    this.lspResult = undefined;
    this.lspConfigResult = undefined;
});

// ── Fixtures ─────────────────────────────────────────────────────────

const L2_INSERTION_DOC = `Hello world.

{++added text++}[^ct-1]

More text.

[^ct-1]: @alice | 2026-03-01 | ins | proposed
    @alice 2026-03-01: Initial insertion
`;

const L2_SUBSTITUTION_DOC = `Hello world.

{~~old text~>new text~~}[^ct-1]

More text.

[^ct-1]: @alice | 2026-03-01 | sub | proposed
    @alice 2026-03-01: Initial substitution
`;

const ACCEPTED_DOC = `Hello world.

{++accepted text++}[^ct-1]

More text.

[^ct-1]: @alice | 2026-03-01 | ins | accepted
    @alice 2026-03-01: Initial insertion
    approved: @bob 2026-03-02 "Looks good"
`;

const RESOLVED_DOC = `Hello world.

{++added text++}[^ct-1]

More text.

[^ct-1]: @alice | 2026-03-01 | ins | proposed
    @alice 2026-03-01: Initial insertion
    resolved: @bob 2026-03-02
`;

const L0_INSERTION_DOC = `Hello {++world++} today.
`;

const URI = 'file:///test.md';

// ── Mock Connection ──────────────────────────────────────────────────

function createMockConnection(): any {
    const handlers: any = {};
    const notifications: any[] = [];
    return {
        onInitialize: (h: any) => { handlers.initialize = h; },
        onInitialized: (h: any) => { handlers.initialized = h; },
        onShutdown: (h: any) => { handlers.shutdown = h; },
        onExit: (h: any) => { handlers.exit = h; },
        onDidOpenTextDocument: (h: any) => { handlers.didOpen = h; },
        onDidChangeTextDocument: (h: any) => { handlers.didChange = h; },
        onDidCloseTextDocument: (h: any) => { handlers.didClose = h; },
        onWillSaveTextDocument: (h: any) => { handlers.willSave = h; },
        onWillSaveTextDocumentWaitUntil: (h: any) => { handlers.willSaveWaitUntil = h; },
        onDidSaveTextDocument: (h: any) => { handlers.didSave = h; },
        onHover: (h: any) => { handlers.hover = h; },
        onCodeLens: (h: any) => { handlers.codeLens = h; },
        onCodeAction: (h: any) => { handlers.codeAction = h; },
        onDocumentLinks: (h: any) => { handlers.documentLinks = h; },
        onRequest: (method: string, h: any) => { handlers[`request:${method}`] = h; },
        onNotification: (method: string, h: any) => { handlers[`notification:${method}`] = h; },
        sendDiagnostics: () => {},
        sendNotification: (method: string, params: any) => { notifications.push({ method, params }); },
        sendRequest: () => Promise.resolve(undefined),
        workspace: { applyEdit: () => Promise.resolve({ applied: false }) },
        languages: { semanticTokens: { on: () => {} } },
        listen: () => {},
        console: { error: () => {}, warn: () => {}, log: () => {}, info: () => {} },
    };
}

function setupServer(): ChangetracksServer {
    const conn = createMockConnection();
    return createServer(conn);
}

async function openDoc(server: ChangetracksServer, text: string): Promise<void> {
    await server.handleDocumentOpen(URI, text, 'markdown');
}

// ── Step definitions ─────────────────────────────────────────────────

Given('an LSP server instance with a test document', function (this: ChangeTracksWorld) {
    this.lspServer = setupServer();
});

Given('the test document contains a proposed ct-1 insertion', async function (this: ChangeTracksWorld) {
    assert.ok(this.lspServer, 'LSP server not initialized');
    await openDoc(this.lspServer, L2_INSERTION_DOC);
});

Given('the test document contains a proposed ct-1 insertion with existing discussion', async function (this: ChangeTracksWorld) {
    assert.ok(this.lspServer, 'LSP server not initialized');
    await openDoc(this.lspServer, L2_INSERTION_DOC);
});

Given('the test document contains a proposed ct-1 insertion by {string}', async function (this: ChangeTracksWorld, _author: string) {
    assert.ok(this.lspServer, 'LSP server not initialized');
    await openDoc(this.lspServer, L2_INSERTION_DOC);
});

Given('the test document contains a proposed ct-1 substitution by {string}', async function (this: ChangeTracksWorld, _author: string) {
    assert.ok(this.lspServer, 'LSP server not initialized');
    await openDoc(this.lspServer, L2_SUBSTITUTION_DOC);
});

Given('the test document contains an accepted ct-1 insertion', async function (this: ChangeTracksWorld) {
    assert.ok(this.lspServer, 'LSP server not initialized');
    await openDoc(this.lspServer, ACCEPTED_DOC);
});

Given('the test document contains a resolved ct-1', async function (this: ChangeTracksWorld) {
    assert.ok(this.lspServer, 'LSP server not initialized');
    await openDoc(this.lspServer, RESOLVED_DOC);
});

Given('the test document contains an L0 insertion with no footnote', async function (this: ChangeTracksWorld) {
    assert.ok(this.lspServer, 'LSP server not initialized');
    await openDoc(this.lspServer, L0_INSERTION_DOC);
});

// ── When: send requests ──────────────────────────────────────────────

When('I send changetracks\\/reviewChange with changeId {string}, decision {string}, author {string}', function (
    this: ChangeTracksWorld,
    changeId: string,
    decision: string,
    author: string,
) {
    assert.ok(this.lspServer, 'LSP server not initialized');
    this.lspResult = this.lspServer.handleReviewChange({
        uri: URI,
        changeId,
        decision: decision as any,
        author: author.replace(/^@/, ''),
    });
});

When('I send changetracks\\/reviewChange with changeId {string}, decision {string}, reason {string}, author {string}', function (
    this: ChangeTracksWorld,
    changeId: string,
    decision: string,
    reason: string,
    author: string,
) {
    assert.ok(this.lspServer, 'LSP server not initialized');
    this.lspResult = this.lspServer.handleReviewChange({
        uri: URI,
        changeId,
        decision: decision as any,
        reason,
        author: author.replace(/^@/, ''),
    });
});

When('I send changetracks\\/replyToThread with changeId {string}, text {string}, author {string}', function (
    this: ChangeTracksWorld,
    changeId: string,
    text: string,
    author: string,
) {
    assert.ok(this.lspServer, 'LSP server not initialized');
    this.lspResult = this.lspServer.handleReplyToThread({
        uri: URI,
        changeId,
        text,
        author: author.replace(/^@/, ''),
    });
});

When('I promote the L0 change at offset {int} then reply with text {string}, author {string}', async function (
    this: ChangeTracksWorld,
    offset: number,
    text: string,
    author: string,
) {
    assert.ok(this.lspServer, 'LSP server not initialized');
    // Step 1: Promote L0 to L2 via ensureL2
    const docText = (this.lspServer as any).getDocumentText(URI);
    assert.ok(docText, 'Document not found');
    const promoted = ensureL2(docText, offset, { author: author.replace(/^@/, ''), type: 'ins' });
    assert.ok(promoted.promoted, 'Expected L0-to-L2 promotion');
    assert.ok(promoted.changeId, 'Expected a changeId from ensureL2');

    // Step 2: Update the server's document with the promoted text
    await openDoc(this.lspServer, promoted.text);

    // Step 3: Reply to the now-L2 change
    this.lspResult = this.lspServer.handleReplyToThread({
        uri: URI,
        changeId: promoted.changeId,
        text,
        author: author.replace(/^@/, ''),
    });
});

When('I send changetracks\\/amendChange with changeId {string}, newText {string}, reason {string}, author {string}', async function (
    this: ChangeTracksWorld,
    changeId: string,
    newText: string,
    reason: string,
    author: string,
) {
    assert.ok(this.lspServer, 'LSP server not initialized');
    this.lspResult = await this.lspServer.handleAmendChange({
        uri: URI,
        changeId,
        newText,
        reason,
        author: author.replace(/^@/, ''),
    });
});

When('I send changetracks\\/amendChange with changeId {string}, newText {string}, author {string}', async function (
    this: ChangeTracksWorld,
    changeId: string,
    newText: string,
    author: string,
) {
    assert.ok(this.lspServer, 'LSP server not initialized');
    this.lspResult = await this.lspServer.handleAmendChange({
        uri: URI,
        changeId,
        newText,
        author: author.replace(/^@/, ''),
    });
});

When('I send changetracks\\/supersedeChange with changeId {string}, newText {string}, oldText {string}, reason {string}, author {string}', async function (
    this: ChangeTracksWorld,
    changeId: string,
    newText: string,
    oldText: string,
    reason: string,
    author: string,
) {
    assert.ok(this.lspServer, 'LSP server not initialized');
    this.lspResult = await this.lspServer.handleSupersedeChange({
        uri: URI,
        changeId,
        newText,
        oldText,
        reason,
        author: author.replace(/^@/, ''),
    });
});

When('I send changetracks\\/resolveThread with changeId {string}, author {string}', function (
    this: ChangeTracksWorld,
    changeId: string,
    author: string,
) {
    assert.ok(this.lspServer, 'LSP server not initialized');
    this.lspResult = this.lspServer.handleResolveThread({
        uri: URI,
        changeId,
        author: author.replace(/^@/, ''),
    });
});

When('I send changetracks\\/unresolveThread with changeId {string}', function (
    this: ChangeTracksWorld,
    changeId: string,
) {
    assert.ok(this.lspServer, 'LSP server not initialized');
    this.lspResult = this.lspServer.handleUnresolveThread({
        uri: URI,
        changeId,
    });
});

When('I send changetracks\\/compactChange with changeId {string}, fully true', function (
    this: ChangeTracksWorld,
    changeId: string,
) {
    assert.ok(this.lspServer, 'LSP server not initialized');
    this.lspResult = this.lspServer.handleCompactChange({
        uri: URI,
        changeId,
        fully: true,
    });
});

When('I send changetracks\\/compactChange with changeId {string}', function (
    this: ChangeTracksWorld,
    changeId: string,
) {
    assert.ok(this.lspServer, 'LSP server not initialized');
    this.lspResult = this.lspServer.handleCompactChange({
        uri: URI,
        changeId,
    });
});

When('I send changetracks\\/getProjectConfig', function (this: ChangeTracksWorld) {
    assert.ok(this.lspServer, 'LSP server not initialized');
    this.lspConfigResult = this.lspServer.handleGetProjectConfig();
});

// ── Then: assertions ─────────────────────────────────────────────────

Then('the response contains an edit', function (this: ChangeTracksWorld) {
    assert.ok(this.lspResult, 'No LSP result');
    assert.ok('edit' in this.lspResult, `Expected response to contain edit, got: ${JSON.stringify(this.lspResult)}`);
});

Then('the response contains an error', function (this: ChangeTracksWorld) {
    assert.ok(this.lspResult, 'No LSP result');
    assert.ok('error' in this.lspResult, `Expected response to contain error, got: ${JSON.stringify(this.lspResult)}`);
});

Then('the response contains an edit and a new change ID', function (this: ChangeTracksWorld) {
    assert.ok(this.lspResult, 'No LSP result');
    assert.ok('edit' in this.lspResult, `Expected response to contain edit`);
    assert.ok('newChangeId' in this.lspResult, `Expected response to contain newChangeId`);
    assert.ok(
        (this.lspResult as any).newChangeId.startsWith('ct-'),
        `Expected newChangeId to start with "ct-", got "${(this.lspResult as any).newChangeId}"`
    );
});

Then('the edit text contains {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.lspResult, 'No LSP result');
    assert.ok('edit' in this.lspResult, 'Response does not contain edit');
    const editText = (this.lspResult as any).edit.newText;
    assert.ok(
        editText.includes(expected),
        `Edit text does not contain "${expected}".\nEdit text:\n${editText.substring(0, 500)}`
    );
});

Then('the edit text does not contain {string}', function (this: ChangeTracksWorld, unexpected: string) {
    assert.ok(this.lspResult, 'No LSP result');
    assert.ok('edit' in this.lspResult, 'Response does not contain edit');
    const editText = (this.lspResult as any).edit.newText;
    assert.ok(
        !editText.includes(unexpected),
        `Edit text should NOT contain "${unexpected}" but it does`
    );
});

Then('the edit adds {string} with reason {string}', function (this: ChangeTracksWorld, keyword: string, reason: string) {
    assert.ok(this.lspResult, 'No LSP result');
    assert.ok('edit' in this.lspResult, 'Response does not contain edit');
    const editText = (this.lspResult as any).edit.newText;
    assert.ok(
        editText.includes(keyword),
        `Edit text does not contain "${keyword}".\nEdit text:\n${editText.substring(0, 500)}`
    );
    assert.ok(
        editText.includes(reason),
        `Edit text does not contain reason "${reason}".\nEdit text:\n${editText.substring(0, 500)}`
    );
});

Then('the edit does NOT change ct-1 footnote status from {string}', function (this: ChangeTracksWorld, expectedStatus: string) {
    assert.ok(this.lspResult, 'No LSP result');
    assert.ok('edit' in this.lspResult, 'Response does not contain edit');
    const editText = (this.lspResult as any).edit.newText;
    assert.ok(
        editText.includes(`| ${expectedStatus}`),
        `Edit text should still contain "| ${expectedStatus}" but it does not.\nEdit text:\n${editText.substring(0, 500)}`
    );
});

Then('the edit text contains a footnote reference', function (this: ChangeTracksWorld) {
    assert.ok(this.lspResult, 'No LSP result');
    assert.ok('edit' in this.lspResult, 'Response does not contain edit');
    const editText = (this.lspResult as any).edit.newText;
    assert.ok(
        /\[\^ct-\d+\]/.test(editText),
        `Edit text does not contain a footnote reference ([^ct-N]).\nEdit text:\n${editText.substring(0, 500)}`
    );
});

Then('the edit text contains a footnote block', function (this: ChangeTracksWorld) {
    assert.ok(this.lspResult, 'No LSP result');
    assert.ok('edit' in this.lspResult, 'Response does not contain edit');
    const editText = (this.lspResult as any).edit.newText;
    assert.ok(
        /\[\^ct-\d+\]:/.test(editText),
        `Edit text does not contain a footnote block ([^ct-N]:).\nEdit text:\n${editText.substring(0, 500)}`
    );
});

Then('the error message contains {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.lspResult, 'No LSP result');
    assert.ok('error' in this.lspResult, 'Response does not contain error');
    const errorMsg = (this.lspResult as any).error;
    assert.ok(
        errorMsg.includes(expected),
        `Error message "${errorMsg}" does not contain "${expected}"`
    );
});

Then('the config response contains reasonRequired.agent = true', function (this: ChangeTracksWorld) {
    assert.ok(this.lspConfigResult, 'No config result');
    assert.strictEqual(this.lspConfigResult.reasonRequired.agent, true);
});

Then('the config response contains reasonRequired.human = false', function (this: ChangeTracksWorld) {
    assert.ok(this.lspConfigResult, 'No config result');
    assert.strictEqual(this.lspConfigResult.reasonRequired.human, false);
});
