import * as assert from 'assert';
import { createServer, ChangetracksServer, PreviousVersionResult } from '@changetracks/lsp-server/internals';
import type { WorkspaceEdit } from '@changetracks/lsp-server/internals';

/**
 * Tests for the changetracks/annotate custom request handler.
 *
 * The handler takes { textDocument: { uri } }, looks up git history,
 * runs the appropriate annotator (markdown or sidecar), and returns
 * a WorkspaceEdit that replaces the entire buffer.
 *
 * Git functions are mocked — no real git repos needed.
 */

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Captured onRequest handlers, keyed by method name. */
interface RequestHandlers {
  [method: string]: (params: any) => any;
}

/**
 * Create a mock LSP connection that captures onRequest registrations.
 */
function createMockConnection(): any {
  const handlers: any = {};
  const requestHandlers: RequestHandlers = {};
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
    onRequest: (method: string, handler: any) => { requestHandlers[method] = handler; },
    onNotification: (method: string, handler: any) => { handlers['notification:' + method] = handler; },
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
    _handlers: handlers,
    _requestHandlers: requestHandlers,
    _notifications: notifications,
  };
}

/**
 * Stub git functions on the server for testing.
 * This replaces the real git module functions with controllable mocks.
 */
function stubGit(
  server: ChangetracksServer,
  options: {
    workspaceRoot?: string | undefined;
    previousVersion?: PreviousVersionResult | undefined;
  }
): void {
  (server as any)._gitGetWorkspaceRoot = async () => options.workspaceRoot;
  (server as any)._gitGetPreviousVersion = async () => options.previousVersion;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('changetracks/annotate handler', () => {

  let server: ChangetracksServer;
  let mockConnection: any;

  beforeEach(() => {
    mockConnection = createMockConnection();
    server = createServer(mockConnection);
  });

  // -----------------------------------------------------------------------
  // Handler registration
  // -----------------------------------------------------------------------

  it('should register changetracks/annotate as a request handler', () => {
    assert.ok(mockConnection._requestHandlers['changetracks/annotate'],
      'Expected changetracks/annotate to be registered via connection.onRequest');
  });

  // -----------------------------------------------------------------------
  // Markdown annotation
  // -----------------------------------------------------------------------

  describe('markdown files', () => {

    it('should return a WorkspaceEdit with CriticMarkup annotations', async () => {
      const uri = 'file:///project/doc.md';
      const currentText = 'Hello world\n';
      const oldText = 'Hello there\n';

      // Simulate the document being open in the server
      server.handleDocumentOpen(uri, currentText, 'markdown');

      // Stub git: file is in a repo and has a previous version
      stubGit(server, {
        workspaceRoot: '/project',
        previousVersion: { oldText },
      });

      const result: WorkspaceEdit | null = await server.handleAnnotate({
        textDocument: { uri }
      });

      assert.ok(result, 'Expected a WorkspaceEdit result');
      assert.ok(result!.changes, 'Expected changes in WorkspaceEdit');
      assert.ok(result!.changes![uri], 'Expected changes for the document URI');

      const edits = result!.changes![uri];
      assert.strictEqual(edits.length, 1, 'Expected exactly one text edit (full replacement)');

      const edit = edits[0];
      // Should start at beginning of document
      assert.strictEqual(edit.range.start.line, 0);
      assert.strictEqual(edit.range.start.character, 0);

      // The annotated text should contain CriticMarkup
      assert.ok(
        edit.newText.includes('{~~') || edit.newText.includes('{++') || edit.newText.includes('{--'),
        `Expected CriticMarkup in annotated text, got: ${edit.newText}`
      );
    });

    it('should produce character-level substitution for markdown', async () => {
      const uri = 'file:///project/doc.md';
      const oldText = 'The quick brown fox\n';
      const currentText = 'The slow brown fox\n';

      server.handleDocumentOpen(uri, currentText, 'markdown');
      stubGit(server, {
        workspaceRoot: '/project',
        previousVersion: { oldText },
      });

      const result = await server.handleAnnotate({ textDocument: { uri } });

      assert.ok(result);
      const newText = result!.changes![uri][0].newText;
      // "quick" → "slow" should produce a substitution
      assert.ok(newText.includes('{~~'), `Expected substitution markup, got: ${newText}`);
      assert.ok(newText.includes('quick'), 'Expected old text in substitution');
      assert.ok(newText.includes('slow'), 'Expected new text in substitution');
    });
  });

  // -----------------------------------------------------------------------
  // Sidecar annotation (code files)
  // -----------------------------------------------------------------------

  describe('code files (sidecar)', () => {

    it('should return a WorkspaceEdit with sidecar annotations for Python', async () => {
      const uri = 'file:///project/main.py';
      const oldText = 'def greet():\n    return "Hello"\n';
      const currentText = 'def greet():\n    return "Hi"\n';

      server.handleDocumentOpen(uri, currentText, 'python');
      stubGit(server, {
        workspaceRoot: '/project',
        previousVersion: { oldText, author: 'Alice', date: '2026-02-09' },
      });

      const result = await server.handleAnnotate({ textDocument: { uri } });

      assert.ok(result, 'Expected a WorkspaceEdit result');
      const edits = result!.changes![uri];
      assert.strictEqual(edits.length, 1);

      const newText = edits[0].newText;
      // Sidecar annotations use `# ct-N` tags and a sidecar block
      assert.ok(newText.includes('# ct-'), `Expected sidecar tags, got: ${newText}`);
      assert.ok(newText.includes('-- ChangeTracks'), `Expected sidecar block, got: ${newText}`);
    });

    it('should include author and date metadata in sidecar annotations', async () => {
      const uri = 'file:///project/main.py';
      const oldText = 'x = 1\n';
      const currentText = 'x = 2\n';

      server.handleDocumentOpen(uri, currentText, 'python');
      stubGit(server, {
        workspaceRoot: '/project',
        previousVersion: { oldText, author: 'Bob', date: '2026-01-15' },
      });

      const result = await server.handleAnnotate({ textDocument: { uri } });
      assert.ok(result);

      const newText = result!.changes![uri][0].newText;
      assert.ok(newText.includes('Bob'), 'Expected author in sidecar metadata');
      assert.ok(newText.includes('2026-01-15'), 'Expected date in sidecar metadata');
    });

    it('should return a WorkspaceEdit with sidecar annotations for JavaScript', async () => {
      const uri = 'file:///project/app.js';
      const oldText = 'const x = 1;\n';
      const currentText = 'const x = 2;\n';

      server.handleDocumentOpen(uri, currentText, 'javascript');
      stubGit(server, {
        workspaceRoot: '/project',
        previousVersion: { oldText },
      });

      const result = await server.handleAnnotate({ textDocument: { uri } });

      assert.ok(result);
      const newText = result!.changes![uri][0].newText;
      // JavaScript uses // for comments
      assert.ok(newText.includes('// ct-'), `Expected JS comment tags, got: ${newText}`);
      assert.ok(newText.includes('// -- ChangeTracks'), `Expected sidecar block, got: ${newText}`);
    });
  });

  // -----------------------------------------------------------------------
  // Error cases
  // -----------------------------------------------------------------------

  describe('error cases', () => {

    it('should return null when document is not open', async () => {
      const uri = 'file:///project/unknown.md';
      // Don't open the document

      stubGit(server, {
        workspaceRoot: '/project',
        previousVersion: { oldText: 'old' },
      });

      const result = await server.handleAnnotate({ textDocument: { uri } });
      assert.strictEqual(result, null);
    });

    it('should return null when file is not in a git repo', async () => {
      const uri = 'file:///project/doc.md';
      server.handleDocumentOpen(uri, 'Hello', 'markdown');

      stubGit(server, {
        workspaceRoot: undefined, // Not in a git repo
        previousVersion: undefined,
      });

      const result = await server.handleAnnotate({ textDocument: { uri } });
      assert.strictEqual(result, null);
    });

    it('should return null when no previous version exists', async () => {
      const uri = 'file:///project/doc.md';
      server.handleDocumentOpen(uri, 'Hello', 'markdown');

      stubGit(server, {
        workspaceRoot: '/project',
        previousVersion: undefined, // No git history
      });

      const result = await server.handleAnnotate({ textDocument: { uri } });
      assert.strictEqual(result, null);
    });

    it('should return null when file already contains CriticMarkup annotations', async () => {
      const uri = 'file:///project/doc.md';
      const textWithMarkup = 'Hello {++world++}\n';

      server.handleDocumentOpen(uri, textWithMarkup, 'markdown');
      stubGit(server, {
        workspaceRoot: '/project',
        previousVersion: { oldText: 'Hello\n' },
      });

      const result = await server.handleAnnotate({ textDocument: { uri } });
      assert.strictEqual(result, null);
    });

    it('should return null when file already contains sidecar annotations', async () => {
      const uri = 'file:///project/main.py';
      const textWithSidecar = 'x = 1  # ct-1\n\n# -- ChangeTracks ---\n# [^ct-1]: ins | pending\n';

      server.handleDocumentOpen(uri, textWithSidecar, 'python');
      stubGit(server, {
        workspaceRoot: '/project',
        previousVersion: { oldText: 'x = 0\n' },
      });

      const result = await server.handleAnnotate({ textDocument: { uri } });
      assert.strictEqual(result, null);
    });

    it('should return null when no changes detected (old === current)', async () => {
      const uri = 'file:///project/doc.md';
      const text = 'Hello world\n';

      server.handleDocumentOpen(uri, text, 'markdown');
      stubGit(server, {
        workspaceRoot: '/project',
        previousVersion: { oldText: text }, // Same as current
      });

      const result = await server.handleAnnotate({ textDocument: { uri } });
      assert.strictEqual(result, null);
    });

    it('should return null for unsupported language (no comment syntax)', async () => {
      const uri = 'file:///project/data.bin';
      const oldText = 'old content\n';
      const currentText = 'new content\n';

      // Use a language that has no comment syntax
      server.handleDocumentOpen(uri, currentText, 'plaintext');
      stubGit(server, {
        workspaceRoot: '/project',
        previousVersion: { oldText },
      });

      const result = await server.handleAnnotate({ textDocument: { uri } });
      // plaintext is not markdown and has no comment syntax for sidecar
      assert.strictEqual(result, null);
    });
  });

  // -----------------------------------------------------------------------
  // WorkspaceEdit structure
  // -----------------------------------------------------------------------

  describe('WorkspaceEdit structure', () => {

    it('should produce a full-document replacement range', async () => {
      const uri = 'file:///project/doc.md';
      const currentText = 'Line 1\nLine 2\nLine 3\n';
      const oldText = 'Line 1\nOld Line\nLine 3\n';

      server.handleDocumentOpen(uri, currentText, 'markdown');
      stubGit(server, {
        workspaceRoot: '/project',
        previousVersion: { oldText },
      });

      const result = await server.handleAnnotate({ textDocument: { uri } });
      assert.ok(result);

      const edit = result!.changes![uri][0];
      // Range should start at (0,0)
      assert.strictEqual(edit.range.start.line, 0);
      assert.strictEqual(edit.range.start.character, 0);

      // Range end should cover the entire document
      const lines = currentText.split('\n');
      const lastLineIndex = lines.length - 1;
      const lastLineLength = lines[lastLineIndex].length;
      assert.strictEqual(edit.range.end.line, lastLineIndex);
      assert.strictEqual(edit.range.end.character, lastLineLength);
    });

    it('should handle single-line document', async () => {
      const uri = 'file:///project/doc.md';
      const currentText = 'world';
      const oldText = 'hello';

      server.handleDocumentOpen(uri, currentText, 'markdown');
      stubGit(server, {
        workspaceRoot: '/project',
        previousVersion: { oldText },
      });

      const result = await server.handleAnnotate({ textDocument: { uri } });
      assert.ok(result);

      const edit = result!.changes![uri][0];
      assert.strictEqual(edit.range.start.line, 0);
      assert.strictEqual(edit.range.start.character, 0);
      assert.strictEqual(edit.range.end.line, 0);
      assert.strictEqual(edit.range.end.character, 5); // length of "world"
    });
  });
});
