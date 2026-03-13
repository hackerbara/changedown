/**
 * Tests for Phase 2: LSP Lifecycle Operation Custom Requests (2A-2G)
 *
 * Verifies that the 7 new LSP custom requests correctly delegate to
 * core lifecycle functions and return the expected response shapes.
 */

import { describe, it, expect } from 'vitest';
import { createServer, ChangetracksServer } from '@changetracks/lsp-server/internals';
import type { Connection, TextEdit } from '@changetracks/lsp-server/internals';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** A markdown document with a Level 2 proposed insertion (footnote-backed). */
const L2_INSERTION_DOC = `Hello world.

{++added text++}[^ct-1]

More text.

[^ct-1]: @alice | 2026-03-01 | ins | proposed
    @alice 2026-03-01: Initial insertion
`;

/** A markdown document with a Level 2 proposed substitution. */
const L2_SUBSTITUTION_DOC = `Hello world.

{~~old text~>new text~~}[^ct-1]

More text.

[^ct-1]: @alice | 2026-03-01 | sub | proposed
    @alice 2026-03-01: Initial substitution
`;

/** A markdown document with an accepted change (for compaction tests). */
const ACCEPTED_DOC = `Hello world.

{++accepted text++}[^ct-1]

More text.

[^ct-1]: @alice | 2026-03-01 | ins | accepted
    @alice 2026-03-01: Initial insertion
    approved: @bob 2026-03-02 "Looks good"
`;

/** A markdown document with a resolved thread. */
const RESOLVED_DOC = `Hello world.

{++added text++}[^ct-1]

More text.

[^ct-1]: @alice | 2026-03-01 | ins | proposed
    @alice 2026-03-01: Initial insertion
    resolved: @bob 2026-03-02
`;

// ─── Mock Connection ──────────────────────────────────────────────────────────

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
        on: (handler: any) => { handlers.semanticTokens = handler; },
      },
    },
    listen: () => {},
    _handlers: handlers,
    _notifications: notifications,
  } as any;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupServer(): { server: ChangetracksServer; conn: Connection } {
  const conn = createMockConnection();
  const server = createServer(conn);
  return { server, conn };
}

function openDoc(server: ChangetracksServer, uri: string, text: string): void {
  server.handleDocumentOpen(uri, text, 'markdown');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Phase 2: Lifecycle LSP Requests', () => {
  const URI = 'file:///test.md';

  // ── 2A: getProjectConfig ──────────────────────────────────────────────────

  describe('changetracks/getProjectConfig (2A)', () => {
    it('returns default config shape', () => {
      const { server } = setupServer();
      const result = server.handleGetProjectConfig();
      expect(result.reasonRequired).toEqual({ human: false, agent: true });
      expect(result.reviewerIdentity).toBeUndefined();
    });

    it('includes reviewerIdentity when set', () => {
      const { server } = setupServer();
      server.reviewerIdentity = 'bob';
      const result = server.handleGetProjectConfig();
      expect(result.reviewerIdentity).toBe('bob');
    });
  });

  // ── 2B: reviewChange ──────────────────────────────────────────────────────

  describe('changetracks/reviewChange (2B)', () => {
    it('approves a proposed change', () => {
      const { server } = setupServer();
      openDoc(server, URI, L2_INSERTION_DOC);

      const result = server.handleReviewChange({
        uri: URI,
        changeId: 'ct-1',
        decision: 'approve',
        reason: 'Looks good',
        author: 'bob',
      });

      expect('edit' in result).toBe(true);
      const edit = (result as { edit: TextEdit }).edit;
      expect(edit.newText).toContain('| accepted');
      expect(edit.newText).toContain('approved:');
      expect(edit.newText).toContain('@bob');
      expect(edit.newText).toContain('Looks good');
    });

    it('rejects a proposed change', () => {
      const { server } = setupServer();
      openDoc(server, URI, L2_INSERTION_DOC);

      const result = server.handleReviewChange({
        uri: URI,
        changeId: 'ct-1',
        decision: 'reject',
        reason: 'Not needed',
        author: 'bob',
      });

      expect('edit' in result).toBe(true);
      const edit = (result as { edit: TextEdit }).edit;
      expect(edit.newText).toContain('| rejected');
      expect(edit.newText).toContain('rejected:');
    });

    it('returns error for non-existent change', () => {
      const { server } = setupServer();
      openDoc(server, URI, L2_INSERTION_DOC);

      const result = server.handleReviewChange({
        uri: URI,
        changeId: 'ct-999',
        decision: 'approve',
        reason: 'test',
        author: 'bob',
      });

      expect('error' in result).toBe(true);
    });

    it('returns error for missing document', () => {
      const { server } = setupServer();

      const result = server.handleReviewChange({
        uri: 'file:///nonexistent.md',
        changeId: 'ct-1',
        decision: 'approve',
        author: 'bob',
      });

      expect('error' in result).toBe(true);
      expect((result as { error: string }).error).toBe('Document not found');
    });

    it('uses reviewerIdentity when author not provided', () => {
      const { server } = setupServer();
      server.reviewerIdentity = 'reviewer-bot';
      openDoc(server, URI, L2_INSERTION_DOC);

      const result = server.handleReviewChange({
        uri: URI,
        changeId: 'ct-1',
        decision: 'approve',
        reason: 'Auto-approved',
      });

      expect('edit' in result).toBe(true);
      const edit = (result as { edit: TextEdit }).edit;
      expect(edit.newText).toContain('@reviewer-bot');
    });
  });

  // ── 2C: replyToThread ─────────────────────────────────────────────────────

  describe('changetracks/replyToThread (2C)', () => {
    it('adds a reply to a change thread', () => {
      const { server } = setupServer();
      openDoc(server, URI, L2_INSERTION_DOC);

      const result = server.handleReplyToThread({
        uri: URI,
        changeId: 'ct-1',
        text: 'I have a question about this.',
        author: 'bob',
      });

      expect('edit' in result).toBe(true);
      const edit = (result as { edit: TextEdit }).edit;
      expect(edit.newText).toContain('@bob');
      expect(edit.newText).toContain('I have a question about this.');
    });

    it('adds a labeled reply', () => {
      const { server } = setupServer();
      openDoc(server, URI, L2_INSERTION_DOC);

      const result = server.handleReplyToThread({
        uri: URI,
        changeId: 'ct-1',
        text: 'Please fix the typo.',
        author: 'bob',
        label: 'nit',
      });

      expect('edit' in result).toBe(true);
      const edit = (result as { edit: TextEdit }).edit;
      expect(edit.newText).toContain('[nit]');
    });

    it('returns error for non-existent change', () => {
      const { server } = setupServer();
      openDoc(server, URI, L2_INSERTION_DOC);

      const result = server.handleReplyToThread({
        uri: URI,
        changeId: 'ct-999',
        text: 'Hello',
        author: 'bob',
      });

      expect('error' in result).toBe(true);
    });
  });

  // ── 2D: amendChange ───────────────────────────────────────────────────────

  describe('changetracks/amendChange (2D)', () => {
    it('amends a proposed insertion', () => {
      const { server } = setupServer();
      openDoc(server, URI, L2_INSERTION_DOC);

      const result = server.handleAmendChange({
        uri: URI,
        changeId: 'ct-1',
        newText: 'amended text',
        reason: 'Improved wording',
        author: 'alice',
      });

      expect('edit' in result).toBe(true);
      const edit = (result as { edit: TextEdit }).edit;
      expect(edit.newText).toContain('{++amended text++}');
      expect(edit.newText).toContain('revised');
      expect(edit.newText).toContain('Improved wording');
    });

    it('returns error when amending accepted change', () => {
      const { server } = setupServer();
      openDoc(server, URI, ACCEPTED_DOC);

      const result = server.handleAmendChange({
        uri: URI,
        changeId: 'ct-1',
        newText: 'new text',
        author: 'alice',
      });

      expect('error' in result).toBe(true);
      expect((result as { error: string }).error).toContain('accepted');
    });

    it('returns error for missing document', () => {
      const { server } = setupServer();

      const result = server.handleAmendChange({
        uri: 'file:///nonexistent.md',
        changeId: 'ct-1',
        newText: 'new text',
        author: 'alice',
      });

      expect('error' in result).toBe(true);
      expect((result as { error: string }).error).toBe('Document not found');
    });
  });

  // ── 2E: supersedeChange ───────────────────────────────────────────────────

  describe('changetracks/supersedeChange (2E)', () => {
    it('supersedes a proposed substitution', () => {
      const { server } = setupServer();
      openDoc(server, URI, L2_SUBSTITUTION_DOC);

      const result = server.handleSupersedeChange({
        uri: URI,
        changeId: 'ct-1',
        newText: 'better text',
        oldText: 'old text',
        reason: 'Better approach',
        author: 'bob',
      });

      expect('edit' in result).toBe(true);
      expect('newChangeId' in result).toBe(true);
      const typed = result as { edit: TextEdit; newChangeId: string };
      expect(typed.newChangeId).toMatch(/^ct-/);
      expect(typed.edit.newText).toContain('| rejected');
      expect(typed.edit.newText).toContain('supersedes:');
      expect(typed.edit.newText).toContain('superseded-by:');
    });

    it('returns error for accepted change', () => {
      const { server } = setupServer();
      openDoc(server, URI, ACCEPTED_DOC);

      const result = server.handleSupersedeChange({
        uri: URI,
        changeId: 'ct-1',
        newText: 'new text',
        author: 'bob',
      });

      expect('error' in result).toBe(true);
      expect((result as { error: string }).error).toContain('accepted');
    });
  });

  // ── 2F: resolveThread / unresolveThread ───────────────────────────────────

  describe('changetracks/resolveThread (2F)', () => {
    it('resolves a thread', () => {
      const { server } = setupServer();
      openDoc(server, URI, L2_INSERTION_DOC);

      const result = server.handleResolveThread({
        uri: URI,
        changeId: 'ct-1',
        author: 'bob',
      });

      expect('edit' in result).toBe(true);
      const edit = (result as { edit: TextEdit }).edit;
      expect(edit.newText).toContain('resolved:');
      expect(edit.newText).toContain('@bob');
    });

    it('returns error for non-existent change', () => {
      const { server } = setupServer();
      openDoc(server, URI, L2_INSERTION_DOC);

      const result = server.handleResolveThread({
        uri: URI,
        changeId: 'ct-999',
      });

      expect('error' in result).toBe(true);
    });
  });

  describe('changetracks/unresolveThread (2F)', () => {
    it('unresolves a thread', () => {
      const { server } = setupServer();
      openDoc(server, URI, RESOLVED_DOC);

      const result = server.handleUnresolveThread({
        uri: URI,
        changeId: 'ct-1',
      });

      expect('edit' in result).toBe(true);
      const edit = (result as { edit: TextEdit }).edit;
      expect(edit.newText).not.toContain('resolved:');
    });

    it('returns error for change without resolved line', () => {
      const { server } = setupServer();
      openDoc(server, URI, L2_INSERTION_DOC);

      const result = server.handleUnresolveThread({
        uri: URI,
        changeId: 'ct-1',
      });

      expect('error' in result).toBe(true);
    });
  });

  // ── 2G: compactChange ─────────────────────────────────────────────────────

  describe('changetracks/compactChange (2G)', () => {
    it('compacts an accepted change from L2 to L1', () => {
      const { server } = setupServer();
      openDoc(server, URI, ACCEPTED_DOC);

      const result = server.handleCompactChange({
        uri: URI,
        changeId: 'ct-1',
      });

      expect('edit' in result).toBe(true);
      const edit = (result as { edit: TextEdit }).edit;
      // After L2 -> L1, the footnote definition is gone, replaced by inline comment
      expect(edit.newText).not.toContain('[^ct-1]:');
      expect(edit.newText).toContain('{>>');
    });

    it('rejects compaction of proposed change', () => {
      const { server } = setupServer();
      openDoc(server, URI, L2_INSERTION_DOC);

      const result = server.handleCompactChange({
        uri: URI,
        changeId: 'ct-1',
      });

      expect('error' in result).toBe(true);
      expect((result as { error: string }).error).toContain('proposed');
    });

    it('fully compacts from L2 to L0', () => {
      const { server } = setupServer();
      openDoc(server, URI, ACCEPTED_DOC);

      const result = server.handleCompactChange({
        uri: URI,
        changeId: 'ct-1',
        fully: true,
      });

      expect('edit' in result).toBe(true);
      const edit = (result as { edit: TextEdit }).edit;
      // After full compaction (L2 -> L0), no footnote and no inline comment
      expect(edit.newText).not.toContain('[^ct-1]:');
      // The inline markup should still be present
      expect(edit.newText).toContain('{++accepted text++}');
    });

    it('returns error for missing document', () => {
      const { server } = setupServer();

      const result = server.handleCompactChange({
        uri: 'file:///nonexistent.md',
        changeId: 'ct-1',
      });

      expect('error' in result).toBe(true);
      expect((result as { error: string }).error).toBe('Document not found');
    });
  });

  // ── Full-document edit shape ──────────────────────────────────────────────

  describe('fullDocumentEdit shape', () => {
    it('returns TextEdit covering entire document', () => {
      const { server } = setupServer();
      openDoc(server, URI, L2_INSERTION_DOC);

      const result = server.handleReviewChange({
        uri: URI,
        changeId: 'ct-1',
        decision: 'approve',
        reason: 'OK',
        author: 'bob',
      });

      expect('edit' in result).toBe(true);
      const edit = (result as { edit: TextEdit }).edit;
      expect(edit.range.start.line).toBe(0);
      expect(edit.range.start.character).toBe(0);
      // End should be at the last line of the original document
      const origLines = L2_INSERTION_DOC.split('\n');
      const lastLine = origLines.length - 1;
      expect(edit.range.end.line).toBe(lastLine);
    });
  });
});
