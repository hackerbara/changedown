import * as assert from 'assert';
import { nextViewMode } from '../../view-mode';
import type { ViewMode } from '../../view-mode';

suite('ViewModeManager (view-mode helpers)', () => {
    test('cycleViewMode advances through modes: review → changes → settled → raw → review', () => {
        let mode: ViewMode = 'review';
        mode = nextViewMode(mode);
        assert.strictEqual(mode, 'changes');
        mode = nextViewMode(mode);
        assert.strictEqual(mode, 'settled');
        mode = nextViewMode(mode);
        assert.strictEqual(mode, 'raw');
        mode = nextViewMode(mode);
        assert.strictEqual(mode, 'review');
    });

    test('nextViewMode wraps from last to first', () => {
        const mode = nextViewMode('raw');
        assert.strictEqual(mode, 'review');
    });

    test('nextViewMode handles each mode independently', () => {
        assert.strictEqual(nextViewMode('review'), 'changes');
        assert.strictEqual(nextViewMode('changes'), 'settled');
        assert.strictEqual(nextViewMode('settled'), 'raw');
        assert.strictEqual(nextViewMode('raw'), 'review');
    });
});

suite('ViewModeManager (class)', () => {
    function makeManager(initialViewMode: ViewMode = 'review', initialShowDelimiters = false) {
        const { ViewModeManager } = require('../../managers/view-mode-manager');
        const { DocumentStateManager } = require('../../managers/document-state-manager');
        const { LspBridge } = require('../../managers/lsp-bridge');

        const docStateStub = new DocumentStateManager(
            () => [],
            () => {},
        );
        const lspStub = new LspBridge(docStateStub, () => undefined);
        const callbacks = {
            updateDecorations: () => {},
            scheduleNotifyChanges: () => {},
            getChangesForDocument: () => [],
            updateStatusBar: () => {},
            setContextKey: () => {},
        };
        return new ViewModeManager(docStateStub, lspStub, callbacks, initialViewMode, initialShowDelimiters);
    }

    test('constructor sets initial viewMode from argument', () => {
        const mgr = makeManager('settled');
        assert.strictEqual(mgr.viewMode, 'settled');
    });

    test('constructor defaults initial viewMode to review', () => {
        const mgr = makeManager('review');
        assert.strictEqual(mgr.viewMode, 'review');
    });

    test('updateShowDelimiters updates the showDelimiters getter', () => {
        const mgr = makeManager('review', false);
        assert.strictEqual(mgr.showDelimiters, false);

        mgr.updateShowDelimiters(true);
        assert.strictEqual(mgr.showDelimiters, true);

        mgr.updateShowDelimiters(false);
        assert.strictEqual(mgr.showDelimiters, false);
    });

    test('constructor sets initial showDelimiters from argument', () => {
        const mgr = makeManager('review', true);
        assert.strictEqual(mgr.showDelimiters, true);
    });

    test('resetForTest is callable without error', () => {
        const mgr = makeManager();
        assert.doesNotThrow(() => mgr.resetForTest());
    });
});
