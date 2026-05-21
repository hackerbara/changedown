import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BaseController,
  EventEmitter,
  DocumentStateManager,
  DecorationScheduler,
  type EditorHost,
  type TypedLspConnection,
  type DecorationPort,
  type Disposable,
  type ContentChange,
  type RangeEdit,
  type ApplyEditResult,
  type CoherenceState,
  type FormatAdapter,
  type ReviewOperationResult,
} from '@changedown/core/host';

function createMockHost(): EditorHost & {
  fireOpen: (uri: string, text: string) => void;
  fireContent: (data: { uri: string; text: string; version: number; changes: ContentChange[]; isEcho: boolean }) => void;
  fireCursor: (uri: string, offset: number) => void;
  fireSave: (uri: string) => void;
  fireClose: (uri: string) => void;
  fireActiveDoc: (data: { uri: string; text: string } | null) => void;
} {
  const openEmitter = new EventEmitter<{ uri: string; text: string }>();
  const closeEmitter = new EventEmitter<{ uri: string }>();
  const saveEmitter = new EventEmitter<{ uri: string }>();
  const contentEmitter = new EventEmitter<any>();
  const activeEmitter = new EventEmitter<any>();
  const cursorEmitter = new EventEmitter<{ uri: string; offset: number }>();

  return {
    onDidOpenDocument: openEmitter.event,
    onDidCloseDocument: closeEmitter.event,
    onDidSaveDocument: saveEmitter.event,
    onDidChangeContent: contentEmitter.event,
    onDidChangeActiveDocument: activeEmitter.event,
    onDidChangeCursorPosition: cursorEmitter.event,
    getDocumentText: vi.fn(() => ''),
    applyEdits: vi.fn(async () => ({ applied: true, text: '', version: 1 })),
    fireOpen: (uri, text) => openEmitter.fire({ uri, text }),
    fireContent: (data) => contentEmitter.fire(data),
    fireCursor: (uri, offset) => cursorEmitter.fire({ uri, offset }),
    fireSave: (uri) => saveEmitter.fire({ uri }),
    fireClose: (uri) => closeEmitter.fire({ uri }),
    fireActiveDoc: (data) => activeEmitter.fire(data),
  };
}

function createMockLsp(): TypedLspConnection {
  return {
    sendDidOpen: vi.fn(),
    sendDidClose: vi.fn(),
    sendDidChange: vi.fn(),
    sendDidChangeFullDoc: vi.fn(),
    sendCursorMove: vi.fn(),
    sendViewMode: vi.fn(),
    sendFlushPending: vi.fn(),
    sendSetDocumentState: vi.fn(),
    reviewChange: vi.fn(async () => ({ uri: '', success: true })),
    amendChange: vi.fn(async () => ({ uri: '', success: true })),
    supersedeChange: vi.fn(async () => ({ success: true, uri: '', edits: [] })),
    compactChange: vi.fn(async () => ({ uri: '', success: true })),
    reviewAll: vi.fn(async () => ({ uri: '', success: true })),
    onDecorationData: vi.fn(() => ({ dispose: vi.fn() })),
    onPendingEditFlushed: vi.fn(() => ({ dispose: vi.fn() })),
    onDocumentState: vi.fn(() => ({ dispose: vi.fn() })),
    onOverlayUpdate: vi.fn(() => ({ dispose: vi.fn() })),
    sendRequest: vi.fn(async () => ({})),
    sendNotification: vi.fn(),
    onNotification: vi.fn(() => ({ dispose: vi.fn() })),
  } as any;
}

function createMockDecorationPort(): DecorationPort {
  return {
    update: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  };
}

function createMockFormatAdapter(): FormatAdapter {
  return {
    convertL2ToL3: async (_uri: string, text: string) => text,
    convertL3ToL2: async (_uri: string, text: string) => text,
  };
}

function createHarness() {
  const h = createMockHost();
  const l = createMockLsp();
  const dp = createMockDecorationPort();
  const ctrl = new BaseController({ host: h, lsp: l, decorationPort: dp, formatAdapter: createMockFormatAdapter() });
  return { controller: ctrl, host: h, lsp: l };
}

describe('BaseController', () => {
  let host: ReturnType<typeof createMockHost>;
  let lsp: TypedLspConnection;
  let decorationPort: DecorationPort;
  let controller: BaseController;

  beforeEach(() => {
    host = createMockHost();
    lsp = createMockLsp();
    decorationPort = createMockDecorationPort();
    controller = new BaseController({ host, lsp, decorationPort, formatAdapter: createMockFormatAdapter() });
  });

  describe('document lifecycle', () => {
    it('opens document on onDidOpenDocument', () => {
      host.fireOpen('file:///test.md', '# Hello');
      expect(lsp.sendDidOpen).toHaveBeenCalledWith('file:///test.md', '# Hello');
      expect(controller.getState('file:///test.md')).toBeDefined();
    });

    it('normalizes LSP documentState notifications that use textDocument.uri/viewMode', () => {
      const handler = (lsp.onDocumentState as any).mock.calls[0][0];

      handler({
        textDocument: { uri: 'file:///test.md' },
        tracking: { enabled: true, source: 'file' },
        viewMode: 'working',
      });

      expect(controller.isTrackingEnabled('file:///test.md')).toBe(true);
    });

    it('closes document on onDidCloseDocument', () => {
      host.fireOpen('file:///test.md', '# Hello');
      host.fireClose('file:///test.md');
      expect(lsp.sendDidClose).toHaveBeenCalledWith('file:///test.md');
      expect(controller.getState('file:///test.md')).toBeUndefined();
    });

    it('flushes pending on save', () => {
      host.fireSave('file:///test.md');
      expect(lsp.sendFlushPending).toHaveBeenCalledWith('file:///test.md');
    });
  });

  describe('content changes', () => {
    it('forwards non-echo changes to LSP', () => {
      host.fireOpen('file:///test.md', '# Hello');
      const changes: ContentChange[] = [{
        range: { start: { line: 0, character: 7 }, end: { line: 0, character: 7 } },
        rangeLength: 0,
        text: ' World',
      }];
      host.fireContent({
        uri: 'file:///test.md', text: '# Hello World', version: 2,
        changes, isEcho: false,
      });
      expect(lsp.sendDidChange).toHaveBeenCalledWith('file:///test.md', changes);
    });

    it('suppresses echo content changes', () => {
      host.fireOpen('file:///test.md', '# Hello');
      host.fireContent({
        uri: 'file:///test.md', text: '# Hello', version: 2,
        changes: [], isEcho: true,
      });
      expect(lsp.sendDidChange).not.toHaveBeenCalled();
    });
  });

  describe('cursor and view mode', () => {
    it('sends cursor move to LSP', () => {
      host.fireCursor('file:///test.md', 42);
      expect(lsp.sendCursorMove).toHaveBeenCalledWith('file:///test.md', 42);
    });

    it('setView updates view and notifies LSP', () => {
      host.fireOpen('file:///test.md', '# Hello');
      controller.setView('simple');
      expect(controller.getView().name).toBe('simple');
      expect(lsp.sendViewMode).toHaveBeenCalled();
    });
  });

  describe('cursor-move signal wiring', () => {
    it('forwards cursor-move events from host to LSP', () => {
      const { host: h, lsp: l } = createHarness();

      h.fireCursor('file:///a.md', 6);

      expect(l.sendCursorMove).toHaveBeenCalledWith('file:///a.md', 6);
    });

    it('dedupes cursor-move by identical offset', () => {
      const { host: h, lsp: l } = createHarness();

      h.fireCursor('file:///a.md', 6);
      h.fireCursor('file:///a.md', 6);

      expect(l.sendCursorMove).toHaveBeenCalledTimes(1);
    });

    it('forwards again when offset actually changes', () => {
      const { host: h, lsp: l } = createHarness();

      h.fireCursor('file:///a.md', 6);
      h.fireCursor('file:///a.md', 7);

      expect(l.sendCursorMove).toHaveBeenCalledTimes(2);
      expect(l.sendCursorMove).toHaveBeenNthCalledWith(2, 'file:///a.md', 7);
    });
  });

  describe('echo handling and edit verification', () => {
    it('calls applyEdits and sends verified text to LSP', async () => {
      host.fireOpen('file:///test.md', '# Hello');
      const edits: RangeEdit[] = [{
        range: { start: { line: 0, character: 7 }, end: { line: 0, character: 7 } },
        newText: '{++World++}[^cn-1]',
      }];

      (host.applyEdits as any).mockResolvedValue({
        applied: true,
        text: '# Hello{++World++}[^cn-1]',
        version: 2,
      });

      const handler = (lsp.onPendingEditFlushed as any).mock.calls[0][0];
      await handler({ uri: 'file:///test.md', edits });

      expect(host.applyEdits).toHaveBeenCalledWith('file:///test.md', edits);
      expect(lsp.sendDidChangeFullDoc).toHaveBeenCalledWith(
        'file:///test.md',
        '# Hello{++World++}[^cn-1]',
      );
    });
  });

  describe('applyEdits failure path', () => {
    it('does not forward to LSP when applyEdits returns applied: false', async () => {
      host.fireOpen('file:///test.md', '# Hello');
      (host.applyEdits as any).mockResolvedValue({ applied: false, text: '', version: 1 });

      const handler = (lsp.onPendingEditFlushed as any).mock.calls[0][0];
      await handler({ uri: 'file:///test.md', edits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: 'x' }] });

      expect(lsp.sendDidChangeFullDoc).not.toHaveBeenCalled();
    });
  });

  describe('hooks', () => {
    it('fires onDidOpenDocument hook', () => {
      const hook = vi.fn();
      controller.dispose();
      controller = new BaseController({
        host, lsp, decorationPort,
        formatAdapter: createMockFormatAdapter(),
        hooks: { onDidOpenDocument: hook },
      });
      host.fireOpen('file:///test.md', '# Hello');
      expect(hook).toHaveBeenCalledWith('file:///test.md', expect.any(Object));
    });
  });

  describe('dispose', () => {
    it('disposes without error', () => {
      expect(() => controller.dispose()).not.toThrow();
    });

    it('stops handling events after dispose', () => {
      controller.dispose();
      host.fireOpen('file:///post-dispose.md', '# Hello');
      expect(lsp.sendDidOpen).not.toHaveBeenCalled();
    });
  });

  describe('public service surface', () => {
    it('exposes stateManager as readonly', () => {
      const { controller } = createHarness();
      expect(controller.stateManager).toBeDefined();
      expect(controller.stateManager.getState).toBeInstanceOf(Function);
    });

    it('exposes trackingService as readonly', () => {
      const { controller } = createHarness();
      expect(controller.trackingService).toBeDefined();
      expect(controller.trackingService.isTrackingEnabled).toBeInstanceOf(Function);
    });

    it('exposes reviewService as readonly', () => {
      const { controller } = createHarness();
      expect(controller.reviewService).toBeDefined();
      expect(controller.reviewService.acceptChange).toBeInstanceOf(Function);
    });

    it('exposes navigationService as readonly', () => {
      const { controller } = createHarness();
      expect(controller.navigationService).toBeDefined();
      expect(controller.navigationService.getChangeAtOffset).toBeInstanceOf(Function);
    });

    it('exposes coherenceService as readonly', () => {
      const { controller } = createHarness();
      expect(controller.coherenceService).toBeDefined();
      expect(controller.coherenceService.getCoherence).toBeInstanceOf(Function);
    });
  });

  describe('curated query methods', () => {
    it('getChangesForUri delegates to stateManager', () => {
      const { controller } = createHarness();
      controller.openDocument('file:///a.md', 'hello world');
      // Delegation: wrapper output equals direct stateManager output
      expect(controller.getChangesForUri('file:///a.md'))
        .toEqual(controller.stateManager.getChangesForUri('file:///a.md'));
    });

    it('isTrackingEnabled delegates to trackingService', () => {
      const { controller } = createHarness();
      expect(controller.isTrackingEnabled('file:///a.md')).toBe(false);
      controller.trackingService.setTrackingEnabled('file:///a.md', true);
      expect(controller.isTrackingEnabled('file:///a.md')).toBe(true);
    });

    it('getCoherence delegates to coherenceService', () => {
      const { controller } = createHarness();
      expect(controller.getCoherence('file:///a.md')).toBeUndefined();
      controller.coherenceService.update('file:///a.md', 0.9, 2, 0.8);
      const c = controller.getCoherence('file:///a.md');
      expect(c).toEqual({ rate: 0.9, unresolvedCount: 2, threshold: 0.8 });
    });
  });

  describe('standalone mode (no LSP)', () => {
    it('crystallizes an insertion when tracking is enabled', async () => {
      const parseAdapter = { parse: vi.fn().mockReturnValue([]) };
      const dp = createMockDecorationPort();
      const h = createMockHost();
      h.applyEdits = vi.fn().mockImplementation(async (_uri: string, edits: RangeEdit[]) => {
        return { applied: true, text: 'Hello {++w++}orld.\n', version: 3 };
      });

      const ctrl = new BaseController({
        host: h, decorationPort: dp, parseAdapter,
        formatAdapter: createMockFormatAdapter(),
        tracking: { pauseThresholdMs: 0 },
      });

      h.fireOpen('file:///test.md', 'Hello world.\n');
      ctrl.trackingService.setTrackingEnabled('file:///test.md', true);

      // Simulate typing 'w' at offset 6
      h.fireContent({
        uri: 'file:///test.md', text: 'Hello wworld.\n', version: 2,
        changes: [{ range: { start: { line: 0, character: 6 }, end: { line: 0, character: 6 } }, text: 'w', rangeLength: 0, rangeOffset: 6 }],
        isEcho: false,
      });

      // Move cursor far away to trigger flush (PEM crystallizes on cursor move outside anchor)
      h.fireCursor('file:///test.md', 100);

      // Wait for async crystallization
      await new Promise(resolve => setTimeout(resolve, 50));

      // applyEdits should have been called with crystallized markup
      expect(h.applyEdits).toHaveBeenCalled();

      ctrl.dispose();
    });

    it('parses locally on document open when parseAdapter is provided', () => {
      const parseAdapter = { parse: vi.fn().mockReturnValue([{ id: 'cn-1', type: 'insertion' }]) };
      const dp = createMockDecorationPort();
      const h = createMockHost();
      const ctrl = new BaseController({ host: h, decorationPort: dp, parseAdapter, formatAdapter: createMockFormatAdapter() });

      h.fireOpen('file:///test.md', 'Hello {++world++}.\n');

      expect(parseAdapter.parse).toHaveBeenCalledWith('file:///test.md', 'Hello {++world++}.\n', expect.any(String));
      expect(dp.update).toHaveBeenCalled();
      const snapshot = (dp.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(snapshot.changes.length).toBeGreaterThan(0);

      ctrl.dispose();
    });

    it('parses locally on content change when parseAdapter is provided', () => {
      const parseAdapter = { parse: vi.fn().mockReturnValue([]) };
      const dp = createMockDecorationPort();
      const h = createMockHost();
      const ctrl = new BaseController({ host: h, decorationPort: dp, parseAdapter, formatAdapter: createMockFormatAdapter() });

      h.fireOpen('file:///test.md', 'Hello.\n');
      parseAdapter.parse.mockClear();  // reset from open

      h.fireContent({
        uri: 'file:///test.md',
        text: 'Hello world.\n',
        version: 2,
        changes: [{ range: { start: { line: 0, character: 5 }, end: { line: 0, character: 5 } }, text: ' world', rangeLength: 0 }],
        isEcho: false,
      });

      expect(parseAdapter.parse).toHaveBeenCalledWith('file:///test.md', 'Hello world.\n', expect.any(String));
      ctrl.dispose();
    });

    it('echoes do not trigger local parse (applyMutationEdits handles re-parse)', () => {
      const parseAdapter = { parse: vi.fn().mockReturnValue([]) };
      const dp = createMockDecorationPort();
      const h = createMockHost();
      const ctrl = new BaseController({ host: h, decorationPort: dp, parseAdapter, formatAdapter: createMockFormatAdapter() });

      h.fireOpen('file:///test.md', 'Hello.\n');
      parseAdapter.parse.mockClear();

      h.fireContent({
        uri: 'file:///test.md',
        text: 'Hello world.\n',
        version: 2,
        changes: [{ range: { start: { line: 0, character: 5 }, end: { line: 0, character: 5 } }, text: ' world', rangeLength: 0 }],
        isEcho: true,  // programmatic edit echo
      });

      // Echo triggers early return — no parse
      expect(parseAdapter.parse).not.toHaveBeenCalled();
      ctrl.dispose();
    });

    it('hybrid mode: local parse runs even when LSP is provided', () => {
      const parseAdapter = { parse: vi.fn().mockReturnValue([{ id: 'cn-1', type: 'insertion' }]) };
      const dp = createMockDecorationPort();
      const h = createMockHost();
      const l = createMockLsp();
      const ctrl = new BaseController({ host: h, lsp: l, decorationPort: dp, parseAdapter, formatAdapter: createMockFormatAdapter() });

      h.fireOpen('file:///test.md', 'Hello {++world++}.\n');

      // Local parse runs immediately
      expect(parseAdapter.parse).toHaveBeenCalledWith('file:///test.md', 'Hello {++world++}.\n', expect.any(String));
      // LSP also gets the document
      expect(l.sendDidOpen).toHaveBeenCalledWith('file:///test.md', 'Hello {++world++}.\n');

      ctrl.dispose();
    });
  });

  describe('applyMutationEdits', () => {
    it('applies edits, updates state, re-parses, and schedules render', async () => {
      const parseAdapter = { parse: vi.fn().mockReturnValue([{ id: 'cn-1', type: 'insertion' }]) };
      const dp = createMockDecorationPort();
      const h = createMockHost();
      // Configure host.applyEdits to return success
      h.applyEdits = vi.fn().mockResolvedValue({ applied: true, text: 'Updated text.\n', version: 2 });

      const ctrl = new BaseController({ host: h, decorationPort: dp, parseAdapter, formatAdapter: createMockFormatAdapter() });
      h.fireOpen('file:///test.md', 'Original text.\n');
      parseAdapter.parse.mockClear();
      (dp.update as ReturnType<typeof vi.fn>).mockClear();

      // Call applyMutationEdits (it's private — test via bracket notation)
      const result = await (ctrl as any).applyMutationEdits('file:///test.md', [
        { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } }, newText: 'Updated' },
      ]);

      expect(result?.applied).toBe(true);
      expect(h.applyEdits).toHaveBeenCalled();
      expect(parseAdapter.parse).toHaveBeenCalledWith('file:///test.md', 'Updated text.\n', expect.any(String));
      // Decoration port should have been updated (via scheduler.updateNow)
      expect(dp.update).toHaveBeenCalled();

      ctrl.dispose();
    });

    it('returns null when host has no applyEdits', async () => {
      const parseAdapter = { parse: vi.fn().mockReturnValue([]) };
      const dp = createMockDecorationPort();
      const h = createMockHost();
      delete (h as any).applyEdits;  // no applyEdits capability

      const ctrl = new BaseController({ host: h, decorationPort: dp, parseAdapter, formatAdapter: createMockFormatAdapter() });
      h.fireOpen('file:///test.md', 'Text.\n');

      const result = await (ctrl as any).applyMutationEdits('file:///test.md', []);
      expect(result).toBeNull();

      ctrl.dispose();
    });
  });

  describe('convenience review methods', () => {
    const L2_DOC = 'Hello {++world++}[^cn-1]\n\n[^cn-1]: @alice | 2026-01-01 | proposed | insertion\n';

    function createReviewHarness() {
      const h = createMockHost();
      const dp = createMockDecorationPort();
      const ctrl = new BaseController({
        host: h,
        decorationPort: dp,
        formatAdapter: createMockFormatAdapter(),
      });
      return { controller: ctrl, host: h, dp };
    }

    describe('acceptChange', () => {
      it('returns error when document is not open', async () => {
        const { controller } = createReviewHarness();
        const result = await controller.acceptChange('file:///missing.md', 'cn-1', 'bob');
        expect(result.error).toBe('Document not open');
        expect(result.updatedText).toBe('');
        expect(result.affectedChangeIds).toEqual([]);
        controller.dispose();
      });

      it('delegates to reviewService and applies mutation', async () => {
        const { controller, host } = createReviewHarness();

        // Open document with tracked change
        host.fireOpen('file:///test.md', L2_DOC);

        // Mock applyEdits to simulate host applying the full-document replacement
        (host.applyEdits as any).mockImplementation(async (_uri: string, edits: RangeEdit[]) => {
          return { applied: true, text: edits[0].newText, version: 2 };
        });

        const result = await controller.acceptChange('file:///test.md', 'cn-1', 'bob');

        // Should have called applyEdits (the text changed)
        expect(host.applyEdits).toHaveBeenCalled();
        // Should return affected change IDs
        expect(result.affectedChangeIds).toContain('cn-1');
        // No error
        expect(result.error).toBeUndefined();

        controller.dispose();
      });

      it('returns ReviewService error without calling applyEdits', async () => {
        const { controller, host } = createReviewHarness();
        host.fireOpen('file:///test.md', 'Plain text with no changes.\n');

        const result = await controller.acceptChange('file:///test.md', 'nonexistent', 'bob');

        // ReviewService returns an error for missing change
        expect(result.error).toBeDefined();
        // applyEdits should NOT be called when review fails
        expect(host.applyEdits).not.toHaveBeenCalled();

        controller.dispose();
      });
    });

    describe('rejectChange', () => {
      it('returns error when document is not open', async () => {
        const { controller } = createReviewHarness();
        const result = await controller.rejectChange('file:///missing.md', 'cn-1', 'bob');
        expect(result.error).toBe('Document not open');
        expect(result.updatedText).toBe('');
        expect(result.affectedChangeIds).toEqual([]);
        controller.dispose();
      });

      it('delegates to reviewService and applies mutation', async () => {
        const { controller, host } = createReviewHarness();

        host.fireOpen('file:///test.md', L2_DOC);

        (host.applyEdits as any).mockImplementation(async (_uri: string, edits: RangeEdit[]) => {
          return { applied: true, text: edits[0].newText, version: 2 };
        });

        const result = await controller.rejectChange('file:///test.md', 'cn-1', 'bob');

        expect(host.applyEdits).toHaveBeenCalled();
        expect(result.affectedChangeIds).toContain('cn-1');
        expect(result.error).toBeUndefined();

        controller.dispose();
      });
    });

    describe('acceptAll', () => {
      it('returns error when document is not open', async () => {
        const { controller } = createReviewHarness();
        const result = await controller.acceptAll('file:///missing.md');
        expect(result.error).toBe('Document not open');
        controller.dispose();
      });

      it('accepts all proposed changes', async () => {
        const { controller, host } = createReviewHarness();

        host.fireOpen('file:///test.md', L2_DOC);

        (host.applyEdits as any).mockImplementation(async (_uri: string, edits: RangeEdit[]) => {
          return { applied: true, text: edits[0].newText, version: 2 };
        });

        const result = await controller.acceptAll('file:///test.md');

        expect(host.applyEdits).toHaveBeenCalled();
        expect(result.affectedChangeIds).toContain('cn-1');
        expect(result.error).toBeUndefined();

        controller.dispose();
      });

      it('does not call applyEdits when no changes to process', async () => {
        const { controller, host } = createReviewHarness();

        host.fireOpen('file:///test.md', 'Plain text with no changes.\n');

        const result = await controller.acceptAll('file:///test.md');

        // No proposed changes → no edit, no error
        expect(host.applyEdits).not.toHaveBeenCalled();
        expect(result.affectedChangeIds).toEqual([]);

        controller.dispose();
      });
    });

    describe('rejectAll', () => {
      it('returns error when document is not open', async () => {
        const { controller } = createReviewHarness();
        const result = await controller.rejectAll('file:///missing.md');
        expect(result.error).toBe('Document not open');
        controller.dispose();
      });

      it('rejects all proposed changes', async () => {
        const { controller, host } = createReviewHarness();

        host.fireOpen('file:///test.md', L2_DOC);

        (host.applyEdits as any).mockImplementation(async (_uri: string, edits: RangeEdit[]) => {
          return { applied: true, text: edits[0].newText, version: 2 };
        });

        const result = await controller.rejectAll('file:///test.md');

        expect(host.applyEdits).toHaveBeenCalled();
        expect(result.affectedChangeIds).toContain('cn-1');
        expect(result.error).toBeUndefined();

        controller.dispose();
      });
    });

    describe('applyMutationResult skips no-op', () => {
      it('does not call applyEdits when text is unchanged', async () => {
        const { controller, host } = createReviewHarness();

        host.fireOpen('file:///test.md', 'Plain text with no changes.\n');

        // acceptAll on a doc with no proposed changes returns the same text
        const result = await controller.acceptAll('file:///test.md');

        // The helper should skip applyEdits since oldText === newText
        expect(host.applyEdits).not.toHaveBeenCalled();

        controller.dispose();
      });
    });
  });
});
