import * as assert from 'assert';

suite('EditTrackingManager', () => {
    test('isCriticMarkupSyntax detects insertion markup', () => {
        const { isCriticMarkupSyntax } = require('../../managers/edit-tracking-manager');
        assert.strictEqual(isCriticMarkupSyntax('{++hello++}'), true);
        assert.strictEqual(isCriticMarkupSyntax('{--text--}'), true);
        assert.strictEqual(isCriticMarkupSyntax('{~~old~>new~~}'), true);
        assert.strictEqual(isCriticMarkupSyntax('[^cn-1]'), true);
        assert.strictEqual(isCriticMarkupSyntax('plain text'), false);
    });

    test('isCriticMarkupSyntax detects comment and highlight markup', () => {
        const { isCriticMarkupSyntax } = require('../../managers/edit-tracking-manager');
        assert.strictEqual(isCriticMarkupSyntax('{==highlighted==}'), true);
        assert.strictEqual(isCriticMarkupSyntax('{>>comment<<}'), true);
    });

    test('isCriticMarkupSyntax returns false for empty string', () => {
        const { isCriticMarkupSyntax } = require('../../managers/edit-tracking-manager');
        assert.strictEqual(isCriticMarkupSyntax(''), false);
    });

    test('EDIT_CONFIRMATION_TIMEOUT_MS is 50', () => {
        const { EditTrackingManager } = require('../../managers/edit-tracking-manager');
        assert.strictEqual(EditTrackingManager.EDIT_CONFIRMATION_TIMEOUT_MS, 50);
    });

    function makeManager() {
        const { EditTrackingManager } = require('../../managers/edit-tracking-manager');
        const { DocumentStateManager } = require('../../managers/document-state-manager');
        const { LspBridge } = require('../../managers/lsp-bridge');

        // Minimal stubs — only the fields accessed during construction and resetForTest
        const docStateStub = new DocumentStateManager(
            () => [],   // getPendingNodes
            () => {},   // onUriRename
        );
        const lspStub = new LspBridge(docStateStub, () => undefined);
        const callbacks = {
            getAuthor: () => 'test-author',
            scheduleOverlaySend: () => {},
            sendOverlayNull: () => {},
        };
        return new EditTrackingManager(docStateStub, lspStub, callbacks);
    }

    test('resetForTest clears tracking state', () => {
        const manager = makeManager();

        // Set tracking mode to true, then verify resetForTest clears it
        manager.setTrackingModeRaw(true);
        assert.strictEqual(manager.trackingMode, true);

        manager.resetForTest();
        assert.strictEqual(manager.trackingMode, false);
    });

    test('onDidChangeTrackingMode event fires when tracking mode changes', () => {
        const manager = makeManager();
        let firedValue: boolean | undefined;
        manager.onDidChangeTrackingMode((v: boolean) => { firedValue = v; });

        manager.setTrackingMode(true);
        assert.strictEqual(firedValue, true);

        manager.setTrackingMode(false);
        assert.strictEqual(firedValue, false);
    });

    test('onDidChangeTrackingMode does not fire when value is unchanged', () => {
        const manager = makeManager();
        let fireCount = 0;
        manager.onDidChangeTrackingMode(() => { fireCount++; });

        manager.setTrackingModeRaw(false); // start at false
        manager.setTrackingMode(false);    // same value — should not fire
        assert.strictEqual(fireCount, 0);

        manager.setTrackingMode(true);     // changes — should fire
        assert.strictEqual(fireCount, 1);
    });
});
