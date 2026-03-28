import { describe, it, expect, beforeEach } from 'vitest';
import { ChangedownServer } from '@changedown/lsp-server/internals';
import type { Connection, InitializeParams } from '@changedown/lsp-server/internals';

/**
 * Mock connection for browser-mode tests.
 * Mirrors the pattern in server.test.ts.
 */
function createMockConnection(): Connection {
  const handlers: any = {};
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
    sendNotification: (method: string, params: any) => { notifications.push({ method, params }); },
    languages: {
      semanticTokens: {
        on: (handler: any) => { handlers.semanticTokens = handler; },
      },
    },
    console: { log: () => {}, error: () => {}, warn: () => {}, info: () => {} },
    client: { register: async () => {} },
    workspace: { applyEdit: async () => ({ applied: false }) },
    onDidChangeWatchedFiles: () => {},
    listen: () => {},
    _handlers: handlers,
    _notifications: notifications,
  } as any;
}

describe('Browser-mode ChangedownServer', () => {
  let server: ChangedownServer;
  let mockConnection: any;

  beforeEach(() => {
    mockConnection = createMockConnection();
    server = new ChangedownServer(mockConnection);
  });

  it('creates without options (browser default)', () => {
    expect(server).toBeTruthy();
    expect(server.workspace).toBeTruthy();
  });

  it('git stubs return undefined by default', async () => {
    const root = await server._gitGetWorkspaceRoot('/some/path');
    expect(root).toBeUndefined();

    const prev = await server._gitGetPreviousVersion('/some/path', '/root');
    expect(prev).toBeUndefined();
  });

  it('handleAnnotate returns null when no document is open', async () => {
    // No document opened — currentText will be undefined, returns null immediately
    const result = await server.handleAnnotate({ textDocument: { uri: 'file:///test.md' } });
    expect(result).toBeNull();
  });

  it('handleAnnotate returns null when git stubs are no-ops', async () => {
    // Use handleDocumentOpen to register document text through the server's public API
    await server.handleDocumentOpen('file:///test.md', 'Hello world', 'markdown');

    // With default git stubs returning undefined, _gitGetWorkspaceRoot returns undefined
    // and handleAnnotate returns null at the workspace-root check
    const result = await server.handleAnnotate({ textDocument: { uri: 'file:///test.md' } });
    expect(result).toBeNull();
  });

  it('loadProjectConfig uses defaults when no loadConfig provided', async () => {
    const result = await server.handleInitialize({
      capabilities: {},
      rootUri: 'file:///root',
    } as InitializeParams);

    // Server should have capabilities (init succeeded) and use default config
    expect(result.capabilities).toBeTruthy();
    expect(result.capabilities.hoverProvider).toBe(true);
  });

  it('loadProjectConfig uses provided callback', async () => {
    let callbackCalled = false;
    const customServer = new ChangedownServer(createMockConnection(), {
      loadConfig: () => {
        callbackCalled = true;
        return undefined;
      },
    });

    // Initialize with rootUri so workspaceRoot is set, then handleInitialized triggers loadProjectConfig
    await customServer.handleInitialize({
      capabilities: {},
      rootUri: 'file:///root',
    } as InitializeParams);
    customServer.handleInitialized();

    expect(callbackCalled).toBe(true);
  });
});
