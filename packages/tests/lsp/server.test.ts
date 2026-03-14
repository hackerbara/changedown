import { describe, it, expect, beforeEach } from 'vitest';
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
      expect(server).toBeTruthy();
      expect(server instanceof ChangetracksServer).toBeTruthy();
    });

    it('should initialize workspace on creation', () => {
      const mockConnection = createMockConnection();
      const server = createServer(mockConnection);
      expect(server.workspace).toBeTruthy();
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
      expect(result.capabilities.textDocumentSync).toBe(TextDocumentSyncKind.Full);
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

    it('should parse document on open', () => {
      const uri = 'file:///test.md';
      const text = '{++addition++}';

      server.handleDocumentOpen(uri, text);

      const parseResult = server.getParseResult(uri);
      expect(parseResult).toBeTruthy();
      expect(parseResult.getChanges()).toHaveLength(1);
      const change = parseResult.getChanges()[0];
      expect(change.type).toBe(ChangeType.Insertion);
    });

    it('should update parse result on document change', () => {
      const uri = 'file:///test.md';
      const initialText = 'plain text';
      const updatedText = '{++addition++}';

      server.handleDocumentOpen(uri, initialText);
      let parseResult = server.getParseResult(uri);
      expect(parseResult?.getChanges()).toHaveLength(0);

      server.handleDocumentChange(uri, updatedText);
      parseResult = server.getParseResult(uri);
      expect(parseResult).toBeTruthy();
      expect(parseResult.getChanges()).toHaveLength(1);
      const change = parseResult.getChanges()[0];
      expect(change.type).toBe(ChangeType.Insertion);
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

      expect(result1).toBeTruthy();
      expect(result2).toBeTruthy();
      expect(result1).not.toBe(result2);
      expect(result1.getChanges()[0].type).toBe(ChangeType.Insertion);
      expect(result2.getChanges()[0].type).toBe(ChangeType.Deletion);
    });

    it('should handle multiple changes to same document', () => {
      const uri = 'file:///test.md';

      server.handleDocumentOpen(uri, 'plain text');
      expect(server.getParseResult(uri)?.getChanges()).toHaveLength(0);

      server.handleDocumentChange(uri, '{++addition++}');
      const result1 = server.getParseResult(uri);
      expect(result1).toBeTruthy();
      expect(result1.getChanges()).toHaveLength(1);

      server.handleDocumentChange(uri, '{++add1++} and {--del1--}');
      const result2 = server.getParseResult(uri);
      expect(result2).toBeTruthy();
      expect(result2.getChanges()).toHaveLength(2);
    });

    it('should return undefined for non-existent document', () => {
      const result = server.getParseResult('file:///nonexistent.md');
      expect(result).toBeUndefined();
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

      server.handleDocumentOpen(uri, text);

      const lenses = server.handleCodeLens({ textDocument: { uri } });
      expect(Array.isArray(lenses)).toBeTruthy();
      expect(lenses).toHaveLength(0);
    });

    it('should return code lenses for document with changes', () => {
      const uri = 'file:///test.md';
      const text = '{++addition++} and {--deletion--}';

      server.handleDocumentOpen(uri, text);

      const lenses = server.handleCodeLens({ textDocument: { uri } });
      expect(Array.isArray(lenses)).toBeTruthy();
      // Should have 2 document-level lenses + 2 changes × 2 lenses each = 6 total
      expect(lenses).toHaveLength(6);

      // Check that we have document-level lenses
      const docLenses = lenses.filter(lens =>
        lens.command?.title.startsWith('Accept All') ||
        lens.command?.title.startsWith('Reject All')
      );
      expect(docLenses).toHaveLength(2);

      // Check that we have per-change lenses
      const perChangeLenses = lenses.filter(lens =>
        lens.command?.command === 'changetracks.acceptChange' ||
        lens.command?.command === 'changetracks.rejectChange'
      );
      expect(perChangeLenses).toHaveLength(4);
    });

    it('should return empty array for code lens on non-existent document', () => {
      const uri = 'file:///nonexistent.md';
      const lenses = server.handleCodeLens({ textDocument: { uri } });
      expect(Array.isArray(lenses)).toBeTruthy();
      expect(lenses).toHaveLength(0);
    });

    it('should provide semantic tokens capability in initialization', () => {
      const params: InitializeParams = {
        processId: null,
        rootUri: null,
        capabilities: {},
        workspaceFolders: null
      };

      const result = server.handleInitialize(params);
      expect(result.capabilities.semanticTokensProvider).toBeTruthy();
      expect(result.capabilities.semanticTokensProvider.legend).toBeTruthy();
      expect(result.capabilities.semanticTokensProvider.full).toBeTruthy();
    });

    it('should return semantic tokens for parsed document', () => {
      const uri = 'file:///test.md';
      const text = '{++addition++}';

      server.handleDocumentOpen(uri, text);

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

    it('should parse markdown file with CriticMarkup when languageId is markdown', () => {
      const uri = 'file:///test.md';
      const text = '{++addition++}';

      server.handleDocumentOpen(uri, text, 'markdown');

      const parseResult = server.getParseResult(uri);
      expect(parseResult).toBeTruthy();
      expect(parseResult.getChanges()).toHaveLength(1);
      const change = parseResult.getChanges()[0];
      expect(change.type).toBe(ChangeType.Insertion);
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
      expect(parseResult).toBeTruthy();
      expect(parseResult.getChanges()).toHaveLength(1);
      const change = parseResult.getChanges()[0];
      expect(change.type).toBe(ChangeType.Insertion);
      expect(change.id).toBe('ct-1');
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
      expect(parseResult).toBeTruthy();
      expect(parseResult.getChanges()).toHaveLength(1);
      const change = parseResult.getChanges()[0];
      expect(change.type).toBe(ChangeType.Insertion);
      expect(change.id).toBe('ct-1');
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
      expect(parseResult).toBeTruthy();
      expect(parseResult.getChanges()).toHaveLength(1);
      const change = parseResult.getChanges()[0];
      expect(change.type).toBe(ChangeType.Insertion);
      expect(change.id).toBe('ct-1');
    });

    it('should handle code file without sidecar annotations', () => {
      const uri = 'file:///test.py';
      const text = `def greet(name):
    return "Hello"`;

      server.handleDocumentOpen(uri, text, 'python');

      const parseResult = server.getParseResult(uri);
      expect(parseResult).toBeTruthy();
      expect(parseResult.getChanges()).toHaveLength(0);
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
      expect(parseResult?.getChanges()).toHaveLength(0);

      server.handleDocumentChange(uri, updatedText, 'python');
      parseResult = server.getParseResult(uri);
      expect(parseResult).toBeTruthy();
      expect(parseResult.getChanges()).toHaveLength(1);
      const change = parseResult.getChanges()[0];
      expect(change.type).toBe(ChangeType.Insertion);
      expect(change.id).toBe('ct-1');
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
      expect(parseResult).toBeTruthy();
      expect(parseResult.getChanges()).toHaveLength(1);
      const change = parseResult.getChanges()[0];
      expect(change.type).toBe(ChangeType.Substitution);
      expect(change.id).toBe('ct-1');
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
      expect(parseResult).toBeTruthy();
      expect(parseResult.getChanges()).toHaveLength(2);
      expect(parseResult.getChanges()[0].type).toBe(ChangeType.Insertion);
      expect(parseResult.getChanges()[1].type).toBe(ChangeType.Substitution);
    });
  });
});
