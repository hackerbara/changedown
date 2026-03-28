import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChangedownServer } from '@changedown/lsp-server/internals';
import type { Connection } from '@changedown/lsp-server/internals';
import { initHashline } from '@changedown/core';

/**
 * Create a mock connection with workspace.applyEdit support.
 * Extends the server.test.ts pattern with the workspace object
 * needed for LSP-driven promotion.
 */
function createMockConnection(applyEditResult = { applied: true }): Connection & {
  _handlers: Record<string, Function>;
  _notifications: Array<{ method: string; params: any }>;
} {
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
    onFoldingRanges: (handler: any) => { handlers.foldingRanges = handler; },
    onCodeAction: (handler: any) => { handlers.codeAction = handler; },
    onDocumentLinks: (handler: any) => { handlers.documentLinks = handler; },
    onRequest: (method: string, handler: any) => { handlers[`request:${method}`] = handler; },
    onNotification: (method: string, handler: any) => { handlers[`notification:${method}`] = handler; },
    sendDiagnostics: (params: any) => { notifications.push({ method: 'textDocument/publishDiagnostics', params }); },
    sendNotification: (method: string, params: any) => {
      notifications.push({ method, params });
    },
    console: {
      error: (_msg: string) => { /* suppress in tests */ },
      warn: (_msg: string) => {},
      info: (_msg: string) => {},
      log: (_msg: string) => {},
    },
    workspace: {
      applyEdit: vi.fn().mockResolvedValue(applyEditResult),
    },
    languages: {
      semanticTokens: {
        on: (handler: any) => { handlers.semanticTokens = handler; }
      }
    },
    listen: () => {},
    _handlers: handlers,
    _notifications: notifications,
  } as any;
}

// L2 document with an inline insertion and a footnote.
// The body contains a CriticMarkup insertion so workspace.parse() returns changes,
// triggering the promotion path in handleDocumentOpen.
const L2_WITH_CHANGES = `<!-- changedown.com/v1: tracked -->
# Test Document

This is {++an insertion++}[^cn-1] in the text.

[^cn-1]: @user | 2026-03-16 | ins | proposed
`;

// Plain markdown with no CriticMarkup — should NOT be promoted
const PLAIN_MARKDOWN = `# Plain Document

Just regular text with no changes.
`;

describe('LSP L3 Promotion', () => {
  let server: ChangedownServer;
  let mockConnection: ReturnType<typeof createMockConnection>;

  beforeEach(async () => {
    await initHashline();
    mockConnection = createMockConnection();
    server = new ChangedownServer(mockConnection as any);
  });

  it('promotes L2 document to L3 on didOpen', async () => {
    const uri = 'file:///test-promote.md';

    await server.handleDocumentOpen(uri, L2_WITH_CHANGES, 'markdown');

    // workspace/applyEdit should have been called
    expect(mockConnection.workspace.applyEdit).toHaveBeenCalledTimes(1);
    const editCall = (mockConnection.workspace.applyEdit as any).mock.calls[0][0];
    expect(editCall.label).toBe('Promote to L3');

    // The new text should be L3 format (footnote-native: no inline delimiters in body)
    const newText = editCall.edit.changes[uri][0].newText;
    expect(newText).toContain('[^cn-1]');

    // decorationData should have been sent BEFORE applyEdit
    const decorationNotifications = mockConnection._notifications.filter(
      n => n.method === 'changedown/decorationData' && n.params.uri === uri
    );
    expect(decorationNotifications.length).toBeGreaterThanOrEqual(1);
    expect(decorationNotifications[0].params.changes.length).toBeGreaterThan(0);

    // promotionStarting should have been sent
    const startNotifications = mockConnection._notifications.filter(
      n => n.method === 'changedown/promotionStarting'
    );
    expect(startNotifications.length).toBe(1);
    expect(startNotifications[0].params.uri).toBe(uri);

    // promotionComplete should have been sent
    const completeNotifications = mockConnection._notifications.filter(
      n => n.method === 'changedown/promotionComplete'
    );
    expect(completeNotifications.length).toBe(1);
  });

  it('skips promotion for L3 documents', async () => {
    const uri = 'file:///test-l3.md';
    // Create an L3 document: clean body (no inline CriticMarkup), footnote with LINE:HASH edit-op line
    const l3Text = `# Test Document

This is an insertion[^cn-1] in the text.

[^cn-1]: @user | 2026-03-16 | ins | proposed
    1:abc123 {++an insertion++}
`;

    await server.handleDocumentOpen(uri, l3Text, 'markdown');

    // workspace/applyEdit should NOT have been called
    expect(mockConnection.workspace.applyEdit).not.toHaveBeenCalled();

    // decorationData should still be sent (from normal L3 parse)
    const decorationNotifications = mockConnection._notifications.filter(
      n => n.method === 'changedown/decorationData' && n.params.uri === uri
    );
    expect(decorationNotifications.length).toBe(1);
  });

  it('skips promotion for L2 documents without changes', async () => {
    const uri = 'file:///test-plain.md';

    await server.handleDocumentOpen(uri, PLAIN_MARKDOWN, 'markdown');

    // workspace/applyEdit should NOT have been called
    expect(mockConnection.workspace.applyEdit).not.toHaveBeenCalled();
  });

  it('handles applyEdit rejection gracefully', async () => {
    // Create a connection where applyEdit returns { applied: false }
    const rejectConnection = createMockConnection({ applied: false });
    const rejectServer = new ChangedownServer(rejectConnection as any);
    const uri = 'file:///test-reject.md';

    await rejectServer.handleDocumentOpen(uri, L2_WITH_CHANGES, 'markdown');

    // applyEdit was called but rejected
    expect(rejectConnection.workspace.applyEdit).toHaveBeenCalledTimes(1);

    // Should have sent L2 fallback decorationData (two sends: first L3 attempt, then L2 fallback)
    const decorationNotifications = rejectConnection._notifications.filter(
      n => n.method === 'changedown/decorationData' && n.params.uri === uri
    );
    expect(decorationNotifications.length).toBe(2);
    // The second (fallback) should still have changes (from L2 parse)
    expect(decorationNotifications[1].params.changes.length).toBeGreaterThan(0);
  });

  it('skips re-parse on promotion echo didChange', async () => {
    const uri = 'file:///test-echo.md';

    // First: open with L2 → promotion happens
    await server.handleDocumentOpen(uri, L2_WITH_CHANGES, 'markdown');
    const notificationCountAfterOpen = mockConnection._notifications.length;

    // Simulate the promotion echo: didChange arrives with L3 text
    const l3Text = (mockConnection.workspace.applyEdit as any).mock.calls[0][0]
      .edit.changes[uri][0].newText;
    await server.handleDocumentChange(uri, l3Text, 'markdown');

    // No additional decorationData should have been sent (echo was suppressed)
    const decorationNotificationsAfterEcho = mockConnection._notifications
      .slice(notificationCountAfterOpen)
      .filter(n => n.method === 'changedown/decorationData');
    expect(decorationNotificationsAfterEcho.length).toBe(0);
  });

  it('does not re-promote during batchEdit', async () => {
    const uri = 'file:///test-batch.md';

    // Trigger the batchEditStart handler registered in setupHandlers
    const batchStartHandler = (mockConnection as any)._handlers['notification:changedown/batchEditStart'];
    batchStartHandler({ uri });

    // Send didChange with L2 text during batch
    await server.handleDocumentChange(uri, L2_WITH_CHANGES, 'markdown');

    // workspace/applyEdit should NOT have been called (batch suppresses re-promotion)
    expect(mockConnection.workspace.applyEdit).not.toHaveBeenCalled();

    // Send batchEditEnd
    const batchEndHandler = (mockConnection as any)._handlers['notification:changedown/batchEditEnd'];
    batchEndHandler({ uri });
  });
});
