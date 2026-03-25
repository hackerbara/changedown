/**
 * l3-review-settlement.test.ts
 *
 * Verifies that code actions for L3 (footnote-native) documents produce
 * Command objects that route through changetracks.acceptChange /
 * changetracks.rejectChange, rather than raw TextEdits.
 *
 * This is the regression guard for Task 7: code-actions Path B elimination.
 */

import { describe, it, expect, vi } from 'vitest';
import { createServer, CodeActionKind } from '@changetracks/lsp-server/internals';
import { initHashline } from '@changetracks/core';

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
    console: { error: () => {}, warn: () => {}, info: () => {}, log: () => {} },
    workspace: { applyEdit: vi.fn().mockResolvedValue({ applied: true }) },
    languages: { semanticTokens: { on: (handler: any) => { handlers.semanticTokens = handler; } } },
    listen: () => {},
    _handlers: handlers,
    _notifications: notifications,
  } as any;
}

describe('code-actions route through commands (not raw TextEdits)', () => {
  it('L2 inline: code action for accept produces a command, not raw TextEdits', async () => {
    const conn = createMockConnection();
    const server = createServer(conn as any);

    const l2 = [
      '<!-- ctrcks.com/v1: tracked -->',
      'Hello {++beautiful ++}world',
    ].join('\n');

    await server.handleDocumentOpen('file:///test-l2.md', l2, 'markdown');

    // Collect diagnostics published during open
    const diagnostics = conn._notifications
      .filter((n: any) => n.method === 'textDocument/publishDiagnostics')
      .flatMap((n: any) => n.params.diagnostics);

    const codeActions = await conn._handlers.codeAction({
      textDocument: { uri: 'file:///test-l2.md' },
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      context: { diagnostics },
    });

    expect(codeActions).toBeDefined();
    expect(Array.isArray(codeActions)).toBeTruthy();

    for (const action of (codeActions ?? [])) {
      expect(action.command).toBeDefined();
      expect(action.edit).toBeUndefined();
    }

    const quickFixes = (codeActions ?? []).filter((a: any) => a.kind === CodeActionKind.QuickFix);
    if (quickFixes.length > 0) {
      expect(quickFixes[0].command.command).toMatch(/^changetracks\.(acceptChange|rejectChange)$/);
    }
  });

  it('L3 footnote-native: code action for accept produces a command, not raw TextEdits', async () => {
    await initHashline();
    const conn = createMockConnection();
    const server = createServer(conn as any);

    const l3 = [
      '<!-- ctrcks.com/v1: tracked -->',
      'Hello beautiful world',
      '',
      '[^ct-1]: @alice | 2026-03-18 | ins | proposed',
      '    1:b4 beautiful ',
    ].join('\n');

    await server.handleDocumentOpen('file:///test-l3.md', l3, 'markdown');

    // Collect diagnostics published during open
    const diagnostics = conn._notifications
      .filter((n: any) => n.method === 'textDocument/publishDiagnostics')
      .flatMap((n: any) => n.params.diagnostics);

    const codeActions = await conn._handlers.codeAction({
      textDocument: { uri: 'file:///test-l3.md' },
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      context: { diagnostics },
    });

    expect(codeActions).toBeDefined();
    expect(Array.isArray(codeActions)).toBeTruthy();

    for (const action of (codeActions ?? [])) {
      expect(action.command).toBeDefined();
      expect(action.edit).toBeUndefined();
    }
  });

  it('createCodeActions directly: per-change actions use changetracks.acceptChange command', async () => {
    const { createCodeActions, DiagnosticSeverity } = await import('@changetracks/lsp-server/internals');
    const { ChangeType, ChangeStatus } = await import('@changetracks/core');

    const text = 'Hello {++world++}!';
    const changes = [
      {
        id: 'test-id-1',
        type: ChangeType.Insertion,
        status: ChangeStatus.Proposed,
        range: { start: 6, end: 17 },
        contentRange: { start: 9, end: 14 },
        modifiedText: 'world',
        level: 0,
        anchored: false,
      }
    ];
    const diagnostic = {
      range: { start: { line: 0, character: 6 }, end: { line: 0, character: 17 } },
      severity: DiagnosticSeverity.Information,
      source: 'changetracks',
      message: 'Insertion: world',
      code: 'test-id-1',
      data: { changeId: 'test-id-1', changeType: ChangeType.Insertion },
    };

    const actions = createCodeActions(diagnostic, changes as any, text, 'file:///test.md');

    // Every action must have a command and no edit
    for (const action of actions) {
      expect(action.command).toBeDefined();
      expect(action.edit).toBeUndefined();
    }

    const quickFixes = actions.filter(a => a.kind === CodeActionKind.QuickFix);
    expect(quickFixes).toHaveLength(4);
    expect(quickFixes[0].command!.command).toBe('changetracks.acceptChange');
    expect(quickFixes[0].command!.arguments).toContain('test-id-1');
    expect(quickFixes[1].command!.command).toBe('changetracks.rejectChange');
    expect(quickFixes[1].command!.arguments).toContain('test-id-1');

    const bulkActions = actions.filter(a => a.kind === CodeActionKind.Source);
    expect(bulkActions).toHaveLength(2);
    expect(bulkActions[0].command!.command).toBe('changetracks.acceptAll');
    expect(bulkActions[1].command!.command).toBe('changetracks.rejectAll');
  });
});

describe('handleReviewChange on L3 document', () => {
  it('accept insertion: header updated to accepted, edit-op preserved (no auto-settle)', async () => {
    await initHashline();
    const conn = createMockConnection();
    const server = createServer(conn as any);

    const l3 = [
      '<!-- ctrcks.com/v1: tracked -->',
      'Hello beautiful world',
      '',
      '[^ct-1]: @alice | 2026-03-18 | ins | proposed',
      '    2:b4 {++beautiful ++}',
    ].join('\n');

    await server.handleDocumentOpen('file:///test.md', l3, 'markdown');

    const result = server.handleReviewChange({
      uri: 'file:///test.md',
      changeId: 'ct-1',
      decision: 'approve',
    });

    expect('edit' in result).toBe(true);
    if ('edit' in result) {
      const newText = result.edit.newText;
      expect(newText).toContain('Hello beautiful world');
      // Header updated from proposed → accepted; edit-op preserved (auto_on_approve=false)
      expect(newText).toContain('[^ct-1]:');
      expect(newText).toContain('| accepted');
      expect(newText).toContain('{++beautiful ++}');
      expect(newText).toContain('approved:');
    }
  });

  it('reject insertion: body unchanged, header updated to rejected, edit-op preserved (no auto-settle)', async () => {
    await initHashline();
    const conn = createMockConnection();
    const server = createServer(conn as any);

    const l3 = [
      '<!-- ctrcks.com/v1: tracked -->',
      'Hello beautiful world',
      '',
      '[^ct-1]: @alice | 2026-03-18 | ins | proposed',
      '    2:b4 {++beautiful ++}',
    ].join('\n');

    await server.handleDocumentOpen('file:///test.md', l3, 'markdown');

    const result = server.handleReviewChange({
      uri: 'file:///test.md',
      changeId: 'ct-1',
      decision: 'reject',
    });

    expect('edit' in result).toBe(true);
    if ('edit' in result) {
      const newText = result.edit.newText;
      // Body unchanged (auto_on_reject=false — no auto-revert)
      const bodyLine = newText.split('\n')[1];
      expect(bodyLine).toContain('Hello');
      expect(bodyLine).toContain('beautiful');
      // Header updated from proposed → rejected; edit-op preserved
      expect(newText).toContain('[^ct-1]:');
      expect(newText).toContain('| rejected');
      expect(newText).toContain('{++beautiful ++}');
      expect(newText).toContain('rejected:');
    }
  });
});

describe('handleReviewAll on L3 document', () => {
  it('bulk accept updates all headers to accepted, edit-ops preserved (no auto-settle)', async () => {
    await initHashline();
    const conn = createMockConnection();
    const server = createServer(conn as any);

    // Both insertions on line 2: "Hello beautiful new world"
    // findUniqueMatch locates each insertion independently
    const l3 = [
      '<!-- ctrcks.com/v1: tracked -->',
      'Hello beautiful new world',
      '',
      '[^ct-1]: @alice | 2026-03-18 | ins | proposed',
      '    2:b4 {++beautiful ++}',
      '[^ct-2]: @bob | 2026-03-18 | ins | proposed',
      '    2:b4 {++new ++}',
    ].join('\n');

    await server.handleDocumentOpen('file:///test.md', l3, 'markdown');

    const result = server.handleReviewAll({
      uri: 'file:///test.md',
      decision: 'approve',
    });

    expect('edit' in result).toBe(true);
    if ('edit' in result) {
      const newText = result.edit.newText;
      expect(newText).toContain('Hello beautiful new world');
      // Both headers updated to accepted; edit-ops preserved (auto_on_approve=false)
      expect(newText).toContain('[^ct-1]:');
      expect(newText).toContain('[^ct-2]:');
      expect(newText).toContain('{++beautiful ++}');
      expect(newText).toContain('{++new ++}');
    }
  });
});
