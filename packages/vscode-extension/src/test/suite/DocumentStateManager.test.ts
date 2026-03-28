import * as assert from 'assert';
import { DocumentStateManager } from '../../managers/document-state-manager';

suite('DocumentStateManager', () => {
    let manager: DocumentStateManager;

    setup(() => {
        manager = new DocumentStateManager(() => []);
    });

    teardown(() => {
        manager.dispose();
    });

    test('ensureDocState creates new state for unknown URI', () => {
        const state = manager.ensureDocState('file:///test.md', 1, 'hello');
        assert.ok(state);
        assert.strictEqual(state.version, 1);
        assert.strictEqual(state.shadow, 'hello');
    });

    test('ensureDocState returns existing state for known URI', () => {
        const first = manager.ensureDocState('file:///test.md', 1, 'hello');
        const second = manager.ensureDocState('file:///test.md', 2, 'world');
        assert.strictEqual(first, second);
    });

    test('allocateScId increments from 1 for new documents', () => {
        // Pre-seed state so allocateScId doesn't depend on vscode.window.activeTextEditor
        manager.ensureDocState('file:///test.md', 1, '');
        const id1 = manager.allocateScId('file:///test.md');
        const id2 = manager.allocateScId('file:///test.md');
        assert.strictEqual(id1, 'cn-1');
        assert.strictEqual(id2, 'cn-2');
    });

    test('handleFileRename migrates state to new URI', () => {
        manager.ensureDocState('file:///old.md', 1, 'content');
        manager.handleFileRename('file:///old.md', 'file:///new.md');
        assert.strictEqual(manager.getState('file:///old.md'), undefined);
        assert.ok(manager.getState('file:///new.md'));
    });

    test('handleFileRename preserves max nextScId on collision', () => {
        const oldState = manager.ensureDocState('file:///old.md', 1, 'content');
        oldState.nextScId = 10;
        const newState = manager.ensureDocState('file:///new.md', 1, 'other');
        newState.nextScId = 5;
        manager.handleFileRename('file:///old.md', 'file:///new.md');
        const migrated = manager.getState('file:///new.md')!;
        assert.strictEqual(migrated.nextScId, 10);
    });

    test('removeState deletes state for URI', () => {
        manager.ensureDocState('file:///test.md', 1, 'hello');
        manager.removeState('file:///test.md');
        assert.strictEqual(manager.getState('file:///test.md'), undefined);
    });

    test('filterOptimisticNodes removes nodes with empty id and level 0', () => {
        const changes = [
            { id: 'cn-1', level: 1 },
            { id: '', level: 0 },
            { id: 'cn-2', level: 2 },
        ] as any[];
        const filtered = DocumentStateManager.filterOptimisticNodes(changes);
        assert.strictEqual(filtered.length, 2);
    });

    test('mergeWithPending inserts nodes at correct position', () => {
        const sorted = [
            { range: { start: 0 } },
            { range: { start: 20 } },
            { range: { start: 40 } },
        ] as any[];
        const pending = [{ range: { start: 10 } }] as any[];
        const merged = DocumentStateManager.mergeWithPending(sorted, pending);
        assert.strictEqual(merged.length, 4);
        assert.strictEqual(merged[1].range.start, 10);
    });

    test('mergeWithPending handles empty pending array', () => {
        const sorted = [
            { range: { start: 0 } },
            { range: { start: 20 } },
        ] as any[];
        const merged = DocumentStateManager.mergeWithPending(sorted, []);
        assert.strictEqual(merged.length, 2);
    });

    test('resetForTest clears all state', () => {
        manager.ensureDocState('file:///test.md', 1, 'hello');
        manager.resetForTest();
        assert.strictEqual(manager.getState('file:///test.md'), undefined);
    });

    test('setDocumentState fires onDidChangeDocumentState event', () => {
        let firedPayload: any;
        manager.onDidChangeDocumentState(payload => { firedPayload = payload; });
        manager.setDocumentState('file:///test.md', {
            tracking: { enabled: true, source: 'header' },
            viewMode: 'review',
        });
        assert.ok(firedPayload);
        assert.strictEqual(firedPayload.uri, 'file:///test.md');
        assert.strictEqual(firedPayload.state.tracking.enabled, true);
    });

    test('setDocumentState stores tracking and viewMode on doc state', () => {
        manager.setDocumentState('file:///test.md', {
            tracking: { enabled: true, source: 'header' },
            viewMode: 'settled',
        });
        const ds = manager.getState('file:///test.md')!;
        assert.strictEqual(ds.tracking.enabled, true);
        assert.strictEqual(ds.tracking.source, 'header');
        assert.strictEqual(ds.lspViewMode, 'settled');
    });
});
