import { describe, it, expect, beforeEach } from 'vitest';
import { ChangedownServer, TextDocumentSyncKind } from '@changedown/lsp-server/internals';
import type { Connection, InitializeParams, InitializeResult } from '@changedown/lsp-server/internals';
import { ChangeType } from '@changedown/core';

/**
 * Create a mock connection for testing
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
    sendNotification: (method: string, params: any) => {
      notifications.push({ method, params });
    },
    languages: {
      semanticTokens: {
        on: (handler: any) => { handlers.semanticTokens = handler; }
      }
    },
    console: { log: () => {}, error: () => {}, warn: () => {}, info: () => {} },
    client: { register: async () => {} },
    workspace: { applyEdit: async () => ({ applied: false }) },
    onDidChangeWatchedFiles: () => {},
    listen: () => {},
    _handlers: handlers, // For test access
    _notifications: notifications, // For test access
  } as any;
}

describe('Server', () => {
  describe('ChangedownServer constructor', () => {
    it('should create a server instance', () => {
      const mockConnection = createMockConnection();
      const server = new ChangedownServer(mockConnection);
      expect(server).toBeTruthy();
      expect(server instanceof ChangedownServer).toBeTruthy();
    });

    it('should initialize workspace on creation', () => {
      const mockConnection = createMockConnection();
      const server = new ChangedownServer(mockConnection);
      expect(server.workspace).toBeTruthy();
    });

    it('should accept ServerOptions', () => {
      const mockConnection = createMockConnection();
      const server = new ChangedownServer(mockConnection, {
        loadConfig: () => undefined,
      });
      expect(server).toBeTruthy();
    });
  });

  describe('ChangedownServer', () => {
    let server: ChangedownServer;
    let mockConnection: Connection;

    beforeEach(() => {
      mockConnection = createMockConnection();
      server = new ChangedownServer(mockConnection);
    });

    it('should have a connection', () => {
      expect(server.connection).toBeTruthy();
    });

    it('should have a text document manager', () => {
      expect(server.documents).toBeTruthy();
    });

    it('should return server capabilities on initialize', async () => {
      const params: InitializeParams = {
        processId: null,
        rootUri: null,
        capabilities: {},
        workspaceFolders: null
      };

      const result = await server.handleInitialize(params);
      expect(result).toBeTruthy();
      expect(result.capabilities).toBeTruthy();
      expect(result.capabilities.textDocumentSync).toBe(TextDocumentSyncKind.Incremental);
    });

    it('should handle initialized notification', () => {
      // Should not throw
      expect(() => {
        server.handleInitialized();
      }).not.toThrow();
    });

    it('should handle shutdown', async () => {
      // Should not throw
      await expect((async () => {
        await server.handleShutdown();
      })()).resolves.not.toThrow();
    });

    it('should handle exit', () => {
      // Should not throw
      expect(() => {
        server.handleExit();
      }).not.toThrow();
    });

    it('should parse document on open', async () => {
      const uri = 'file:///test.md';
      const text = '{++addition++}';

      await server.handleDocumentOpen(uri, text);

      const parseResult = server.getParseResult(uri);
      expect(parseResult).toBeTruthy();
      expect(parseResult.getChanges()).toHaveLength(1);
      const change = parseResult.getChanges()[0];
      expect(change.type).toBe(ChangeType.Insertion);
    });

    it('should update parse result on document change', async () => {
      const uri = 'file:///test.md';
      const initialText = 'plain text';
      // Use L3 format (footnote-native) so handleDocumentChange does not
      // attempt L2-to-L3 re-promotion which requires workspace.applyEdit.
      const updatedText = '{++addition++}[^cn-1]\n\n[^cn-1]: ins | proposed | @test | 2026-01-01';

      server.handleDocumentOpen(uri, initialText);
      let parseResult = server.getParseResult(uri);
      expect(parseResult?.getChanges()).toHaveLength(0);

      await server.handleDocumentChange(uri, updatedText);
      parseResult = server.getParseResult(uri);
      expect(parseResult).toBeTruthy();
      expect(parseResult.getChanges()).toHaveLength(1);
      const change = parseResult.getChanges()[0];
      expect(change.type).toBe(ChangeType.Insertion);
    });

    it('should cache parse results by URI', async () => {
      const uri1 = 'file:///test1.md';
      const uri2 = 'file:///test2.md';
      const text1 = '{++doc1++}';
      const text2 = '{--doc2--}';

      await server.handleDocumentOpen(uri1, text1);
      await server.handleDocumentOpen(uri2, text2);

      const result1 = server.getParseResult(uri1);
      const result2 = server.getParseResult(uri2);

      expect(result1).toBeTruthy();
      expect(result2).toBeTruthy();
      expect(result1).not.toBe(result2);
      expect(result1.getChanges()[0].type).toBe(ChangeType.Insertion);
      expect(result2.getChanges()[0].type).toBe(ChangeType.Deletion);
    });

    it('should handle multiple changes to same document', async () => {
      const uri = 'file:///test.md';

      server.handleDocumentOpen(uri, 'plain text');
      expect(server.getParseResult(uri)?.getChanges()).toHaveLength(0);

      // Use L3 format to avoid L2-to-L3 re-promotion path
      await server.handleDocumentChange(uri, '{++addition++}[^cn-1]\n\n[^cn-1]: ins | proposed | @test | 2026-01-01');
      const result1 = server.getParseResult(uri);
      expect(result1).toBeTruthy();
      expect(result1.getChanges()).toHaveLength(1);

      await server.handleDocumentChange(uri, '{++add1++}[^cn-1] and {--del1--}[^cn-2]\n\n[^cn-1]: ins | proposed | @test | 2026-01-01\n[^cn-2]: del | proposed | @test | 2026-01-01');
      const result2 = server.getParseResult(uri);
      expect(result2).toBeTruthy();
      expect(result2.getChanges()).toHaveLength(2);
    });

    it('should return undefined for non-existent document', () => {
      const result = server.getParseResult('file:///nonexistent.md');
      expect(result).toBeUndefined();
    });

    it('should parse complex CriticMarkup syntax', async () => {
      const uri = 'file:///test.md';
      const text = `Plain text here.
{++This is an addition++}
{--This is a deletion--}
{~~old text~>new text~~}
{==highlighted text==}
{>>a comment<<}
{==highlight with comment==}{>>attached comment<<}`;

      await server.handleDocumentOpen(uri, text);
      const parseResult = server.getParseResult(uri);

      expect(parseResult).toBeTruthy();
      // Should have 6 changes: insertion, deletion, substitution, highlight, comment, highlight with attached comment
      // The last one is a single highlight node with comment metadata
      const changes = parseResult.getChanges();
      expect(changes).toHaveLength(6);

      // Verify change types
      expect(changes[0].type).toBe(ChangeType.Insertion);
      expect(changes[1].type).toBe(ChangeType.Deletion);
      expect(changes[2].type).toBe(ChangeType.Substitution);
      expect(changes[3].type).toBe(ChangeType.Highlight);
      expect(changes[4].type).toBe(ChangeType.Comment);
      expect(changes[5].type).toBe(ChangeType.Highlight);

      // Verify the last highlight has attached comment
      expect(changes[5].metadata).toBeTruthy();
      expect(changes[5].metadata?.comment).toBeTruthy();
    });

    it('should handle code lens request for document with no changes', () => {
      const uri = 'file:///test.md';
      const text = 'Plain text with no changes';

      // Set codeLensMode to 'always' so lenses are returned without cursor state
      (server as any).codeLensMode = 'always';

      server.handleDocumentOpen(uri, text);

      const lenses = server.handleCodeLens({ textDocument: { uri } });
      expect(Array.isArray(lenses)).toBeTruthy();
      expect(lenses).toHaveLength(0);
    });

    it('should return code lenses for document with changes', async () => {
      const uri = 'file:///test.md';
      const text = '{++addition++} and {--deletion--}';

      // Set codeLensMode to 'always' so lenses are returned without cursor state
      (server as any).codeLensMode = 'always';

      await server.handleDocumentOpen(uri, text);

      const lenses = server.handleCodeLens({ textDocument: { uri } });
      expect(Array.isArray(lenses)).toBeTruthy();
      // In 'always' mode: 2 changes x 2 per-change lenses = 4 total
      expect(lenses).toHaveLength(4);

      // Check that we have per-change lenses
      const perChangeLenses = lenses.filter(lens =>
        lens.command?.command === 'changedown.acceptChange' ||
        lens.command?.command === 'changedown.rejectChange'
      );
      expect(perChangeLenses).toHaveLength(4);
    });

    it('should return empty array for code lens on non-existent document', () => {
      const uri = 'file:///nonexistent.md';
      const lenses = server.handleCodeLens({ textDocument: { uri } });
      expect(Array.isArray(lenses)).toBeTruthy();
      expect(lenses).toHaveLength(0);
    });

    it('should provide semantic tokens capability in initialization', async () => {
      const params: InitializeParams = {
        processId: null,
        rootUri: null,
        capabilities: {},
        workspaceFolders: null
      };

      const result = await server.handleInitialize(params);
      expect(result.capabilities.semanticTokensProvider).toBeTruthy();
      expect(result.capabilities.semanticTokensProvider.legend).toBeTruthy();
      expect(result.capabilities.semanticTokensProvider.full).toBeTruthy();
    });

    it('should return semantic tokens for parsed document', async () => {
      const uri = 'file:///test.md';
      const text = '{++addition++}';

      await server.handleDocumentOpen(uri, text);

      const semanticTokens = server.handleSemanticTokens({
        textDocument: { uri }
      });

      expect(semanticTokens).toBeTruthy();
      expect(Array.isArray(semanticTokens.data)).toBeTruthy();
      expect(semanticTokens.data).toHaveLength(5); // One token: 5 integers
    });

    it('should return empty semantic tokens for non-existent document', () => {
      const semanticTokens = server.handleSemanticTokens({
        textDocument: { uri: 'file:///nonexistent.md' }
      });

      expect(semanticTokens).toBeTruthy();
      expect(semanticTokens.data).toHaveLength(0);
    });

    it('should parse markdown file with CriticMarkup when languageId is markdown', async () => {
      const uri = 'file:///test.md';
      const text = '{++addition++}';

      await server.handleDocumentOpen(uri, text, 'markdown');

      const parseResult = server.getParseResult(uri);
      expect(parseResult).toBeTruthy();
      expect(parseResult.getChanges()).toHaveLength(1);
      const change = parseResult.getChanges()[0];
      expect(change.type).toBe(ChangeType.Insertion);
    });

    it('should parse Python file with sidecar annotations when languageId is python', async () => {
      const uri = 'file:///test.py';
      const text = `def greet(name):  # cn-1
    return "Hello"

# -- ChangeDown ---
# [^cn-1]: ins | pending
# type: insertion
# -- ChangeDown ---`;

      await server.handleDocumentOpen(uri, text, 'python');

      const parseResult = server.getParseResult(uri);
      expect(parseResult).toBeTruthy();
      expect(parseResult.getChanges()).toHaveLength(1);
      const change = parseResult.getChanges()[0];
      expect(change.type).toBe(ChangeType.Insertion);
      expect(change.id).toBe('cn-1');
    });

    it('should parse JavaScript file with sidecar annotations when languageId is javascript', async () => {
      const uri = 'file:///test.js';
      const text = `function greet(name) {  // cn-1
    return "Hello";
}

// -- ChangeDown ---
// [^cn-1]: ins | pending
// type: insertion
// -- ChangeDown ---`;

      await server.handleDocumentOpen(uri, text, 'javascript');

      const parseResult = server.getParseResult(uri);
      expect(parseResult).toBeTruthy();
      expect(parseResult.getChanges()).toHaveLength(1);
      const change = parseResult.getChanges()[0];
      expect(change.type).toBe(ChangeType.Insertion);
      expect(change.id).toBe('cn-1');
    });

    it('should parse TypeScript file with sidecar annotations when languageId is typescript', async () => {
      const uri = 'file:///test.ts';
      const text = `function greet(name: string): string {  // cn-1
    return "Hello";
}

// -- ChangeDown ---
// [^cn-1]: ins | pending
// type: insertion
// -- ChangeDown ---`;

      await server.handleDocumentOpen(uri, text, 'typescript');

      const parseResult = server.getParseResult(uri);
      expect(parseResult).toBeTruthy();
      expect(parseResult.getChanges()).toHaveLength(1);
      const change = parseResult.getChanges()[0];
      expect(change.type).toBe(ChangeType.Insertion);
      expect(change.id).toBe('cn-1');
    });

    it('should handle code file without sidecar annotations', async () => {
      const uri = 'file:///test.py';
      const text = `def greet(name):
    return "Hello"`;

      await server.handleDocumentOpen(uri, text, 'python');

      const parseResult = server.getParseResult(uri);
      expect(parseResult).toBeTruthy();
      expect(parseResult.getChanges()).toHaveLength(0);
    });

    it('should update parse result with languageId on document change', async () => {
      const uri = 'file:///test.py';
      const initialText = 'def greet():\n    pass';
      const updatedText = `def greet():  # cn-1
    pass

# -- ChangeDown ---
# [^cn-1]: ins | pending
# type: insertion
# -- ChangeDown ---`;

      await server.handleDocumentOpen(uri, initialText, 'python');
      let parseResult = server.getParseResult(uri);
      expect(parseResult?.getChanges()).toHaveLength(0);

      await server.handleDocumentChange(uri, updatedText, 'python');
      parseResult = server.getParseResult(uri);
      expect(parseResult).toBeTruthy();
      expect(parseResult.getChanges()).toHaveLength(1);
      const change = parseResult.getChanges()[0];
      expect(change.type).toBe(ChangeType.Insertion);
      expect(change.id).toBe('cn-1');
    });

    it('should handle sidecar substitution in code file', async () => {
      const uri = 'file:///test.py';
      const text = `def greet(name):
    # - return f"Hello, {name}!"  # cn-1
    return f"Hi, {name}!"  # cn-1

# -- ChangeDown ---
# [^cn-1]: sub | pending
# type: substitution
# original: return f"Hello, {name}!"
# -- ChangeDown ---`;

      await server.handleDocumentOpen(uri, text, 'python');

      const parseResult = server.getParseResult(uri);
      expect(parseResult).toBeTruthy();
      expect(parseResult.getChanges()).toHaveLength(1);
      const change = parseResult.getChanges()[0];
      expect(change.type).toBe(ChangeType.Substitution);
      expect(change.id).toBe('cn-1');
    });

    it('should parse code file with multiple sidecar changes', async () => {
      const uri = 'file:///test.py';
      const text = `def greet(name):  # cn-1
    # - return f"Hello, {name}!"  # cn-2
    return f"Hi, {name}!"  # cn-2

# -- ChangeDown ---
# [^cn-1]: ins | pending
# type: insertion
#
# [^cn-2]: sub | pending
# type: substitution
# original: return f"Hello, {name}!"
# -- ChangeDown ---`;

      await server.handleDocumentOpen(uri, text, 'python');

      const parseResult = server.getParseResult(uri);
      expect(parseResult).toBeTruthy();
      expect(parseResult.getChanges()).toHaveLength(2);
      expect(parseResult.getChanges()[0].type).toBe(ChangeType.Insertion);
      expect(parseResult.getChanges()[1].type).toBe(ChangeType.Substitution);
    });

    it('should suppress decorationData during batch edit', async () => {
      const uri = 'file:///test-batch.md';
      const notifications = (mockConnection as any)._notifications as Array<{ method: string; params: any }>;

      // Open document (plain text — no promotion, synchronous path)
      await server.handleDocumentOpen(uri, 'hello', 'markdown');

      // Clear all notifications from open
      notifications.length = 0;

      // Start batch
      server.handleBatchEditStart(uri);

      // Change document during batch
      await server.handleDocumentChange(uri, 'hello world', 'markdown');

      // decorationData must NOT have been sent during the batch window
      const decoNotifs = notifications.filter(
        (n) => n.method === 'changedown/decorationData'
      );
      expect(decoNotifs).toHaveLength(0);

      // Parse result must still be updated (parse-and-cache still runs)
      const parseResult = server.getParseResult(uri);
      expect(parseResult).toBeTruthy();
      expect(parseResult.getChanges()).toHaveLength(0); // 'hello world' has no markup
    });

    it('should send fresh decorationData on batchEditEnd', async () => {
      const uri = 'file:///test-batchend.md';
      const notifications = (mockConnection as any)._notifications as Array<{ method: string; params: any }>;

      // Open document with plain text
      await server.handleDocumentOpen(uri, 'hello', 'markdown');

      // Clear all notifications from open
      notifications.length = 0;

      // Start batch, change document, then end batch
      server.handleBatchEditStart(uri);
      await server.handleDocumentChange(uri, 'hello world', 'markdown');

      // No decorationData should have been sent during the batch
      const decosDuringBatch = notifications.filter(
        (n) => n.method === 'changedown/decorationData'
      );
      expect(decosDuringBatch).toHaveLength(0);

      // End batch
      server.handleBatchEditEnd(uri);

      // Should now have exactly one decorationData notification
      const decoNotifs = notifications.filter(
        (n) => n.method === 'changedown/decorationData'
      );
      expect(decoNotifs).toHaveLength(1);
      expect(decoNotifs[0].params.uri).toBe(uri);
      expect(decoNotifs[0].params.documentVersion).toBeDefined();
    });
  });
});
