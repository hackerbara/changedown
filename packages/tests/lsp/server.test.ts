import * as assert from 'assert';
import { createServer, ChangetracksServer, TextDocumentSyncKind } from '@changetracks/lsp-server/internals';
import type { Connection, InitializeParams, InitializeResult } from '@changetracks/lsp-server/internals';
import { ChangeType } from '@changetracks/core';

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
    listen: () => {},
    _handlers: handlers, // For test access
    _notifications: notifications, // For test access
  } as any;
}

describe('Server', () => {
  describe('createServer', () => {
    it('should create a server instance', () => {
      const mockConnection = createMockConnection();
      const server = createServer(mockConnection);
      assert.ok(server);
      assert.ok(server instanceof ChangetracksServer);
    });

    it('should initialize workspace on creation', () => {
      const mockConnection = createMockConnection();
      const server = createServer(mockConnection);
      assert.ok(server.workspace);
    });
  });

  describe('ChangetracksServer', () => {
    let server: ChangetracksServer;
    let mockConnection: Connection;

    beforeEach(() => {
      mockConnection = createMockConnection();
      server = createServer(mockConnection);
    });

    it('should have a connection', () => {
      assert.ok(server.connection);
    });

    it('should have a text document manager', () => {
      assert.ok(server.documents);
    });

    it('should return server capabilities on initialize', async () => {
      const params: InitializeParams = {
        processId: null,
        rootUri: null,
        capabilities: {},
        workspaceFolders: null
      };

      const result = await server.handleInitialize(params);
      assert.ok(result);
      assert.ok(result.capabilities);
      assert.strictEqual(result.capabilities.textDocumentSync, TextDocumentSyncKind.Full);
    });

    it('should handle initialized notification', () => {
      // Should not throw
      assert.doesNotThrow(() => {
        server.handleInitialized();
      });
    });

    it('should handle shutdown', async () => {
      // Should not throw
      await assert.doesNotReject(async () => {
        await server.handleShutdown();
      });
    });

    it('should handle exit', () => {
      // Should not throw
      assert.doesNotThrow(() => {
        server.handleExit();
      });
    });

    it('should parse document on open', () => {
      const uri = 'file:///test.md';
      const text = '{++addition++}';

      server.handleDocumentOpen(uri, text);

      const parseResult = server.getParseResult(uri);
      assert.ok(parseResult);
      assert.strictEqual(parseResult.getChanges().length, 1);
      const change = parseResult.getChanges()[0];
      assert.strictEqual(change.type, ChangeType.Insertion);
    });

    it('should update parse result on document change', () => {
      const uri = 'file:///test.md';
      const initialText = 'plain text';
      const updatedText = '{++addition++}';

      server.handleDocumentOpen(uri, initialText);
      let parseResult = server.getParseResult(uri);
      assert.strictEqual(parseResult?.getChanges().length, 0);

      server.handleDocumentChange(uri, updatedText);
      parseResult = server.getParseResult(uri);
      assert.ok(parseResult);
      assert.strictEqual(parseResult.getChanges().length, 1);
      const change = parseResult.getChanges()[0];
      assert.strictEqual(change.type, ChangeType.Insertion);
    });

    it('should cache parse results by URI', () => {
      const uri1 = 'file:///test1.md';
      const uri2 = 'file:///test2.md';
      const text1 = '{++doc1++}';
      const text2 = '{--doc2--}';

      server.handleDocumentOpen(uri1, text1);
      server.handleDocumentOpen(uri2, text2);

      const result1 = server.getParseResult(uri1);
      const result2 = server.getParseResult(uri2);

      assert.ok(result1);
      assert.ok(result2);
      assert.notStrictEqual(result1, result2);
      assert.strictEqual(result1.getChanges()[0].type, ChangeType.Insertion);
      assert.strictEqual(result2.getChanges()[0].type, ChangeType.Deletion);
    });

    it('should handle multiple changes to same document', () => {
      const uri = 'file:///test.md';

      server.handleDocumentOpen(uri, 'plain text');
      assert.strictEqual(server.getParseResult(uri)?.getChanges().length, 0);

      server.handleDocumentChange(uri, '{++addition++}');
      const result1 = server.getParseResult(uri);
      assert.ok(result1);
      assert.strictEqual(result1.getChanges().length, 1);

      server.handleDocumentChange(uri, '{++add1++} and {--del1--}');
      const result2 = server.getParseResult(uri);
      assert.ok(result2);
      assert.strictEqual(result2.getChanges().length, 2);
    });

    it('should return undefined for non-existent document', () => {
      const result = server.getParseResult('file:///nonexistent.md');
      assert.strictEqual(result, undefined);
    });

    it('should parse complex CriticMarkup syntax', () => {
      const uri = 'file:///test.md';
      const text = `Plain text here.
{++This is an addition++}
{--This is a deletion--}
{~~old text~>new text~~}
{==highlighted text==}
{>>a comment<<}
{==highlight with comment==}{>>attached comment<<}`;

      server.handleDocumentOpen(uri, text);
      const parseResult = server.getParseResult(uri);

      assert.ok(parseResult);
      // Should have 6 changes: insertion, deletion, substitution, highlight, comment, highlight with attached comment
      // The last one is a single highlight node with comment metadata
      const changes = parseResult.getChanges();
      assert.strictEqual(changes.length, 6);

      // Verify change types
      assert.strictEqual(changes[0].type, ChangeType.Insertion);
      assert.strictEqual(changes[1].type, ChangeType.Deletion);
      assert.strictEqual(changes[2].type, ChangeType.Substitution);
      assert.strictEqual(changes[3].type, ChangeType.Highlight);
      assert.strictEqual(changes[4].type, ChangeType.Comment);
      assert.strictEqual(changes[5].type, ChangeType.Highlight);

      // Verify the last highlight has attached comment
      assert.ok(changes[5].metadata);
      assert.ok(changes[5].metadata?.comment);
    });

    it('should handle code lens request for document with no changes', () => {
      const uri = 'file:///test.md';
      const text = 'Plain text with no changes';

      server.handleDocumentOpen(uri, text);

      const lenses = server.handleCodeLens({ textDocument: { uri } });
      assert.ok(Array.isArray(lenses));
      assert.strictEqual(lenses.length, 0);
    });

    it('should return code lenses for document with changes', () => {
      const uri = 'file:///test.md';
      const text = '{++addition++} and {--deletion--}';

      server.handleDocumentOpen(uri, text);

      const lenses = server.handleCodeLens({ textDocument: { uri } });
      assert.ok(Array.isArray(lenses));
      // Should have 2 document-level lenses + 2 changes × 2 lenses each = 6 total
      assert.strictEqual(lenses.length, 6);

      // Check that we have document-level lenses
      const docLenses = lenses.filter(lens =>
        lens.command?.title.startsWith('Accept All') ||
        lens.command?.title.startsWith('Reject All')
      );
      assert.strictEqual(docLenses.length, 2);

      // Check that we have per-change lenses
      const perChangeLenses = lenses.filter(lens =>
        lens.command?.command === 'changetracks.acceptChange' ||
        lens.command?.command === 'changetracks.rejectChange'
      );
      assert.strictEqual(perChangeLenses.length, 4);
    });

    it('should return empty array for code lens on non-existent document', () => {
      const uri = 'file:///nonexistent.md';
      const lenses = server.handleCodeLens({ textDocument: { uri } });
      assert.ok(Array.isArray(lenses));
      assert.strictEqual(lenses.length, 0);
    });

    it('should provide semantic tokens capability in initialization', () => {
      const params: InitializeParams = {
        processId: null,
        rootUri: null,
        capabilities: {},
        workspaceFolders: null
      };

      const result = server.handleInitialize(params);
      assert.ok(result.capabilities.semanticTokensProvider);
      assert.ok(result.capabilities.semanticTokensProvider.legend);
      assert.ok(result.capabilities.semanticTokensProvider.full);
    });

    it('should return semantic tokens for parsed document', () => {
      const uri = 'file:///test.md';
      const text = '{++addition++}';

      server.handleDocumentOpen(uri, text);

      const semanticTokens = server.handleSemanticTokens({
        textDocument: { uri }
      });

      assert.ok(semanticTokens);
      assert.ok(Array.isArray(semanticTokens.data));
      assert.strictEqual(semanticTokens.data.length, 5); // One token: 5 integers
    });

    it('should return empty semantic tokens for non-existent document', () => {
      const semanticTokens = server.handleSemanticTokens({
        textDocument: { uri: 'file:///nonexistent.md' }
      });

      assert.ok(semanticTokens);
      assert.strictEqual(semanticTokens.data.length, 0);
    });

    it('should parse markdown file with CriticMarkup when languageId is markdown', () => {
      const uri = 'file:///test.md';
      const text = '{++addition++}';

      server.handleDocumentOpen(uri, text, 'markdown');

      const parseResult = server.getParseResult(uri);
      assert.ok(parseResult);
      assert.strictEqual(parseResult.getChanges().length, 1);
      const change = parseResult.getChanges()[0];
      assert.strictEqual(change.type, ChangeType.Insertion);
    });

    it('should parse Python file with sidecar annotations when languageId is python', () => {
      const uri = 'file:///test.py';
      const text = `def greet(name):  # ct-1
    return "Hello"

# -- ChangeTracks ---
# [^ct-1]: ins | pending
# type: insertion
# -- ChangeTracks ---`;

      server.handleDocumentOpen(uri, text, 'python');

      const parseResult = server.getParseResult(uri);
      assert.ok(parseResult);
      assert.strictEqual(parseResult.getChanges().length, 1);
      const change = parseResult.getChanges()[0];
      assert.strictEqual(change.type, ChangeType.Insertion);
      assert.strictEqual(change.id, 'ct-1');
    });

    it('should parse JavaScript file with sidecar annotations when languageId is javascript', () => {
      const uri = 'file:///test.js';
      const text = `function greet(name) {  // ct-1
    return "Hello";
}

// -- ChangeTracks ---
// [^ct-1]: ins | pending
// type: insertion
// -- ChangeTracks ---`;

      server.handleDocumentOpen(uri, text, 'javascript');

      const parseResult = server.getParseResult(uri);
      assert.ok(parseResult);
      assert.strictEqual(parseResult.getChanges().length, 1);
      const change = parseResult.getChanges()[0];
      assert.strictEqual(change.type, ChangeType.Insertion);
      assert.strictEqual(change.id, 'ct-1');
    });

    it('should parse TypeScript file with sidecar annotations when languageId is typescript', () => {
      const uri = 'file:///test.ts';
      const text = `function greet(name: string): string {  // ct-1
    return "Hello";
}

// -- ChangeTracks ---
// [^ct-1]: ins | pending
// type: insertion
// -- ChangeTracks ---`;

      server.handleDocumentOpen(uri, text, 'typescript');

      const parseResult = server.getParseResult(uri);
      assert.ok(parseResult);
      assert.strictEqual(parseResult.getChanges().length, 1);
      const change = parseResult.getChanges()[0];
      assert.strictEqual(change.type, ChangeType.Insertion);
      assert.strictEqual(change.id, 'ct-1');
    });

    it('should handle code file without sidecar annotations', () => {
      const uri = 'file:///test.py';
      const text = `def greet(name):
    return "Hello"`;

      server.handleDocumentOpen(uri, text, 'python');

      const parseResult = server.getParseResult(uri);
      assert.ok(parseResult);
      assert.strictEqual(parseResult.getChanges().length, 0);
    });

    it('should update parse result with languageId on document change', () => {
      const uri = 'file:///test.py';
      const initialText = 'def greet():\n    pass';
      const updatedText = `def greet():  # ct-1
    pass

# -- ChangeTracks ---
# [^ct-1]: ins | pending
# type: insertion
# -- ChangeTracks ---`;

      server.handleDocumentOpen(uri, initialText, 'python');
      let parseResult = server.getParseResult(uri);
      assert.strictEqual(parseResult?.getChanges().length, 0);

      server.handleDocumentChange(uri, updatedText, 'python');
      parseResult = server.getParseResult(uri);
      assert.ok(parseResult);
      assert.strictEqual(parseResult.getChanges().length, 1);
      const change = parseResult.getChanges()[0];
      assert.strictEqual(change.type, ChangeType.Insertion);
      assert.strictEqual(change.id, 'ct-1');
    });

    it('should handle sidecar substitution in code file', () => {
      const uri = 'file:///test.py';
      const text = `def greet(name):
    # - return f"Hello, {name}!"  # ct-1
    return f"Hi, {name}!"  # ct-1

# -- ChangeTracks ---
# [^ct-1]: sub | pending
# type: substitution
# original: return f"Hello, {name}!"
# -- ChangeTracks ---`;

      server.handleDocumentOpen(uri, text, 'python');

      const parseResult = server.getParseResult(uri);
      assert.ok(parseResult);
      assert.strictEqual(parseResult.getChanges().length, 1);
      const change = parseResult.getChanges()[0];
      assert.strictEqual(change.type, ChangeType.Substitution);
      assert.strictEqual(change.id, 'ct-1');
    });

    it('should parse code file with multiple sidecar changes', () => {
      const uri = 'file:///test.py';
      const text = `def greet(name):  # ct-1
    # - return f"Hello, {name}!"  # ct-2
    return f"Hi, {name}!"  # ct-2

# -- ChangeTracks ---
# [^ct-1]: ins | pending
# type: insertion
#
# [^ct-2]: sub | pending
# type: substitution
# original: return f"Hello, {name}!"
# -- ChangeTracks ---`;

      server.handleDocumentOpen(uri, text, 'python');

      const parseResult = server.getParseResult(uri);
      assert.ok(parseResult);
      assert.strictEqual(parseResult.getChanges().length, 2);
      assert.strictEqual(parseResult.getChanges()[0].type, ChangeType.Insertion);
      assert.strictEqual(parseResult.getChanges()[1].type, ChangeType.Substitution);
    });
  });
});
