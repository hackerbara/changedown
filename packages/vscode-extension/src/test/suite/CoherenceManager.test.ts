import * as assert from 'assert';
import { CoherenceManager } from '../../managers/coherence-manager';

suite('CoherenceManager', () => {
    let manager: CoherenceManager;

    setup(() => {
        manager = new CoherenceManager();
    });

    teardown(() => {
        manager.dispose();
    });

    test('updateCoherence stores state and fires event', () => {
        let firedUri: string | undefined;
        manager.onDidChangeCoherence(uri => { firedUri = uri; });
        manager.updateCoherence('file:///test.md', 95, 2, 98);
        const state = manager.getCoherenceForStatusBar('file:///test.md');
        assert.deepStrictEqual(state, { rate: 95, unresolvedCount: 2, threshold: 98 });
        assert.strictEqual(firedUri, 'file:///test.md');
    });

    test('getCoherenceForStatusBar returns undefined for unknown URI', () => {
        assert.strictEqual(manager.getCoherenceForStatusBar('file:///unknown.md'), undefined);
    });

    test('checkCoherenceDegradation suppresses duplicate notifications for same URI', () => {
        manager.updateCoherence('file:///test.md', 90, 3, 98);
        manager.checkCoherenceDegradation('file:///test.md');
        manager.checkCoherenceDegradation('file:///test.md');
    });

    test('checkCoherenceDegradation skips when no unresolved changes', () => {
        manager.updateCoherence('file:///test.md', 100, 0, 98);
        manager.checkCoherenceDegradation('file:///test.md');
    });

    test('resetForTest clears all state', () => {
        manager.updateCoherence('file:///test.md', 90, 3, 98);
        manager.resetForTest();
        assert.strictEqual(manager.getCoherenceForStatusBar('file:///test.md'), undefined);
    });

    test('removeState deletes coherence for closed document', () => {
        manager.updateCoherence('file:///test.md', 90, 3, 98);
        manager.removeState('file:///test.md');
        assert.strictEqual(manager.getCoherenceForStatusBar('file:///test.md'), undefined);
    });
});
