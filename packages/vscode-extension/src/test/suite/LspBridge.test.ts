import * as assert from 'assert';
import { LspBridge } from '../../managers/lsp-bridge';
import { DocumentStateManager } from '../../managers/document-state-manager';

suite('LspBridge', () => {
    let bridge: LspBridge;
    let docStateManager: DocumentStateManager;

    setup(() => {
        docStateManager = new DocumentStateManager(() => []);
        bridge = new LspBridge(docStateManager, () => null);
    });

    teardown(() => {
        bridge.dispose();
        docStateManager.dispose();
    });

    test('handlePromotionStarting sets isConverting on docState', () => {
        bridge.handlePromotionStarting('file:///test.md');
        const state = docStateManager.getState('file:///test.md');
        assert.ok(state);
        assert.strictEqual(state.isConverting, true);
    });

    test('handlePromotionComplete clears isConverting and fires event', () => {
        let completedUri: string | undefined;
        bridge.onDidCompletePromotion(uri => { completedUri = uri; });

        // Pre-seed state via promotionStarting
        bridge.handlePromotionStarting('file:///test.md');
        assert.strictEqual(docStateManager.getState('file:///test.md')!.isConverting, true);

        bridge.handlePromotionComplete('file:///test.md');
        assert.strictEqual(docStateManager.getState('file:///test.md')!.isConverting, false);
        assert.strictEqual(completedUri, 'file:///test.md');
    });

    test('handleDecorationDataUpdate fires event', () => {
        let receivedUri: string | undefined;
        bridge.onDidReceiveDecorationData(uri => { receivedUri = uri; });
        bridge.handleDecorationDataUpdate('file:///test.md', []);
        assert.strictEqual(receivedUri, 'file:///test.md');
    });

    test('sendLifecycleRequest returns failure when no LSP client', async () => {
        const result = await bridge.sendLifecycleRequest('test', {});
        assert.strictEqual(result.success, false);
    });

    test('getProjectConfig returns default when no LSP client', async () => {
        const config = await bridge.getProjectConfig();
        assert.deepStrictEqual(config, { reasonRequired: { human: false } });
    });

    test('batchEdit delegates to batchEditSender', () => {
        const calls: [string, string][] = [];
        bridge.setBatchEditSender((action, uri) => { calls.push([action, uri]); });

        bridge.batchEdit('start', 'file:///test.md');
        bridge.batchEdit('end', 'file:///test.md');

        assert.strictEqual(calls.length, 2);
        assert.deepStrictEqual(calls[0], ['start', 'file:///test.md']);
        assert.deepStrictEqual(calls[1], ['end', 'file:///test.md']);
    });

    test('batchEdit is safe when no sender set', () => {
        // Should not throw
        bridge.batchEdit('start', 'file:///test.md');
        bridge.batchEdit('end', 'file:///test.md');
    });

    test('sendOverlayNull is safe when no sender set', () => {
        // Should not throw
        bridge.sendOverlayNull('file:///test.md');
    });

    test('sendViewMode delegates to viewModeSender', () => {
        const calls: [string, string][] = [];
        bridge.setViewModeSender((uri, mode) => { calls.push([uri, mode]); });

        bridge.sendViewMode('file:///test.md', 'review');
        assert.strictEqual(calls.length, 1);
        assert.deepStrictEqual(calls[0], ['file:///test.md', 'review']);
    });

    test('hasViewModeSender returns false initially, true after set', () => {
        assert.strictEqual(bridge.hasViewModeSender, false);
        bridge.setViewModeSender(() => {});
        assert.strictEqual(bridge.hasViewModeSender, true);
    });

    test('sendCursorPosition delegates to cursorPositionSender', () => {
        const calls: [string, number, string | undefined][] = [];
        bridge.setCursorPositionSender((uri, line, changeId) => { calls.push([uri, line, changeId]); });

        bridge.sendCursorPosition('file:///test.md', 5, 'ct-1');
        assert.strictEqual(calls.length, 1);
        assert.deepStrictEqual(calls[0], ['file:///test.md', 5, 'ct-1']);
    });

    test('dispose clears overlay timeout', () => {
        // Set up overlay sender so scheduleOverlaySend creates a timeout
        bridge.setOverlaySender(() => {});
        bridge.scheduleOverlaySend();
        // Dispose should clear without errors
        bridge.dispose();
    });
});
