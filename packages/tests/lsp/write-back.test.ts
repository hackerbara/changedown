import { describe, it, expect, vi } from 'vitest';
import { createServer } from '@changetracks/lsp-server/internals';
import type { InitializeParams } from '@changetracks/lsp-server/internals';

function createMockConnection() {
  const handlers: Record<string, Function> = {};
  const notifications: Array<{ method: string; params: any }> = [];
  return {
    onInitialize: (handler: any) => { handlers.initialize = handler; },
    onInitialized: (handler: any) => { handlers.initialized = handler; },
    onShutdown: (handler: any) => { handlers.shutdown = handler; },
    onExit: (handler: any) => { handlers.exit = handler; },
    onDidOpenTextDocument: (handler: any) => { handlers.didOpen = handler; },
    onDidChangeTextDocument: (handler: any) => { handlers.didChange = handler; },
    onDidCloseTextDocument: (handler: any) => { handlers.didClose = handler; },
    onWillSaveTextDocument: (handler: any) => { handlers.willSave = handler; },
    onWillSaveTextDocumentWaitUntil: (handler: any) => { handlers.willSaveWaitUntil = handler; },
    onDidSaveTextDocument: (handler: any) => { handlers.didSave = handler; },
    onHover: (handler: any) => { handlers.hover = handler; },
    onCodeLens: (handler: any) => { handlers.codeLens = handler; },
    onCodeAction: (handler: any) => { handlers.codeAction = handler; },
    onDocumentLinks: (handler: any) => { handlers.documentLinks = handler; },
    onRequest: (method: string, handler: any) => { handlers[`request:${method}`] = handler; },
    onNotification: (method: string, handler: any) => { handlers[`notification:${method}`] = handler; },
    sendDiagnostics: (params: any) => { notifications.push({ method: 'textDocument/publishDiagnostics', params }); },
    sendNotification: (method: string, params: any) => { notifications.push({ method, params }); },
    console: { error: () => {}, warn: vi.fn(), info: () => {}, log: () => {} },
    workspace: { applyEdit: vi.fn().mockResolvedValue({ applied: true }) },
    languages: { semanticTokens: { on: (handler: any) => { handlers.semanticTokens = handler; } } },
    listen: () => {},
    _handlers: handlers,
    _notifications: notifications,
  } as any;
}

/**
 * Create a server, run handleInitialize (inits hashline), and return
 * a helper that opens documents through the full LSP lifecycle
 * (populating TextDocuments so write-back can read lineCount).
 */
async function createInitializedServer(conn: ReturnType<typeof createMockConnection>) {
  const server = createServer(conn as any);
  await server.handleInitialize({ capabilities: {} } as InitializeParams);
  return {
    server,
    /** Open a document through the TextDocuments listener (populates this.documents). */
    async openDocument(uri: string, text: string, languageId = 'markdown') {
      // Fire the didOpen handler registered by TextDocuments.listen(connection).
      // This adds the document to the internal map AND fires documents.onDidOpen,
      // which triggers handleDocumentOpen through the real lifecycle.
      await conn._handlers.didOpen({
        textDocument: { uri, languageId, version: 1, text },
      });
    },
  };
}

describe('write-back mechanism', () => {
  it('concept: resolvedText !== text triggers write-back', () => {
    const inputText = 'body\n\n[^ct-1]: ... 5:old ...';
    const resolvedText = 'body\n\n[^ct-1]: ... 5:new ...';
    expect(inputText).not.toBe(resolvedText);
    const inputBody = inputText.split('\n\n')[0];
    const resolvedBody = resolvedText.split('\n\n')[0];
    expect(inputBody).toBe(resolvedBody);
  });

  it('concept: re-entrance guard prevents double write-back', () => {
    const pending = new Set<string>();
    const uri = 'file:///test.md';
    pending.add(uri);
    expect(pending.has(uri)).toBe(true);
    pending.delete(uri);
    expect(pending.has(uri)).toBe(false);
  });
});

describe('write-back LSP integration', () => {
  it('stale hash triggers write-back via workspace.applyEdit', async () => {
    const conn = createMockConnection();
    const { openDocument } = await createInitializedServer(conn);

    // ct-1 has wrong hash ff — replay resolves it → resolvedText is defined → write-back fires
    const l3 = [
      'The very very sleepy dog.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:ff The {++very ++}very lazy dog.',
      '',
      '[^ct-2]: @bob | 2026-03-21 | sub | proposed',
      '    1:ee The very very {~~lazy~>sleepy~~} dog.',
    ].join('\n');

    await openDocument('file:///test.md', l3);

    // Allow the async applyEdit promise chain to resolve
    await vi.waitFor(() => {
      expect(conn.workspace.applyEdit).toHaveBeenCalled();
    });

    const editCall = conn.workspace.applyEdit.mock.calls[0][0];
    const edits = editCall.changes['file:///test.md'];
    expect(edits).toHaveLength(1);

    // Write-back replaces only the footnote section (body line 0, blank line 1, footnotes start at line 2)
    const edit = edits[0];
    expect(edit.range.start.line).toBe(2);
    // The newText should contain updated anchors (not the original stale hashes)
    expect(edit.newText).toContain('[^ct-1]:');
    expect(edit.newText).toContain('[^ct-2]:');
  });

  it('write-back edit replaces only footnote section, preserving body', async () => {
    const conn = createMockConnection();
    const { openDocument } = await createInitializedServer(conn);

    // Document with single body line and stale hashes
    const l3 = [
      'The very very sleepy dog.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:ff The {++very ++}very lazy dog.',
      '',
      '[^ct-2]: @bob | 2026-03-21 | sub | proposed',
      '    1:ee The very very {~~lazy~>sleepy~~} dog.',
    ].join('\n');

    await openDocument('file:///test.md', l3);

    await vi.waitFor(() => {
      expect(conn.workspace.applyEdit).toHaveBeenCalled();
    });

    // Verify the edit range: starts at footnote section (line 2), not body
    const editCall = conn.workspace.applyEdit.mock.calls[0][0];
    const edits = editCall.changes['file:///test.md'];
    const edit = edits[0];
    // Body is line 0 ("The very very sleepy dog.") and line 1 (blank)
    // Footnotes start at line 2
    expect(edit.range.start.line).toBe(2);
    expect(edit.range.start.character).toBe(0);
    // End should be the last line of the document
    expect(edit.range.end.line).toBeGreaterThanOrEqual(6);
    // The replacement text should contain both footnotes with updated hashes
    expect(edit.newText).toContain('[^ct-1]:');
    expect(edit.newText).toContain('[^ct-2]:');
    // The replacement text should NOT contain body content
    expect(edit.newText).not.toContain('The very very sleepy dog.');
  });

  it('fresh hashes do not trigger write-back', async () => {
    const conn = createMockConnection();
    const { openDocument } = await createInitializedServer(conn);

    // All hashes correct — resolvedText is undefined, no write-back
    const l3 = [
      'Hello world.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:7b {++Hello ++}',
    ].join('\n');

    await openDocument('file:///test.md', l3);

    // Give async chains time to settle
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(conn.workspace.applyEdit).not.toHaveBeenCalled();
  });

  it('no body-mismatch warning when hashes are fresh', async () => {
    const conn = createMockConnection();
    const { openDocument } = await createInitializedServer(conn);

    const l3 = [
      'Hello world.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:7b {++Hello ++}',
    ].join('\n');

    await openDocument('file:///test.md', l3);
    await new Promise(resolve => setTimeout(resolve, 50));

    // No write-back, no body-mismatch warning
    expect(conn.workspace.applyEdit).not.toHaveBeenCalled();
    const warnCalls = conn.console.warn.mock.calls.map((c: any[]) => c[0]);
    const bodyMismatchWarns = warnCalls.filter((msg: string) => msg.includes('[write-back] Body mismatch'));
    expect(bodyMismatchWarns).toHaveLength(0);
  });
});
