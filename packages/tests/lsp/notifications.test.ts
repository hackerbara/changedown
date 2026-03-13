import * as assert from 'assert';
import { ChangeNode, ChangeType, ChangeStatus } from '@changetracks/core';
import { sendDecorationData, sendChangeCount } from '@changetracks/lsp-server/internals';
import type { Connection } from '@changetracks/lsp-server/internals';

/**
 * Create a spy connection that captures sendNotification calls
 */
function createSpyConnection(): Connection & { notifications: Array<{ method: string; params: any }> } {
  const notifications: Array<{ method: string; params: any }> = [];

  return {
    sendNotification: (method: string, params: any) => {
      notifications.push({ method, params });
    },
    notifications,
  } as any;
}

describe('Notifications', () => {
  describe('sendDecorationData', () => {
    it('should send decoration data notification with correct structure', () => {
      const connection = createSpyConnection();
      const uri = 'file:///test.md';
      const changes: ChangeNode[] = [
        {
          id: '1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 11 },
          contentRange: { start: 3, end: 8 },
          level: 0, anchored: false
        }
      ];

      sendDecorationData(connection, uri, changes);

      assert.strictEqual(connection.notifications.length, 1);
      assert.strictEqual(connection.notifications[0].method, 'changetracks/decorationData');
      assert.deepStrictEqual(connection.notifications[0].params, {
        uri,
        changes
      });
    });

    it('should send empty changes array', () => {
      const connection = createSpyConnection();
      const uri = 'file:///test.md';
      const changes: ChangeNode[] = [];

      sendDecorationData(connection, uri, changes);

      assert.strictEqual(connection.notifications.length, 1);
      assert.strictEqual(connection.notifications[0].method, 'changetracks/decorationData');
      assert.deepStrictEqual(connection.notifications[0].params, {
        uri,
        changes: []
      });
    });

    it('should preserve all change node properties', () => {
      const connection = createSpyConnection();
      const uri = 'file:///test.md';
      const changes: ChangeNode[] = [
        {
          id: '1',
          type: ChangeType.Substitution,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 20 },
          contentRange: { start: 3, end: 17 },
          originalRange: { start: 3, end: 6 },
          modifiedRange: { start: 8, end: 11 },
          originalText: 'old',
          modifiedText: 'new',
          metadata: {
            author: 'test',
            date: '2026-02-10',
            comment: 'test comment'
          },
          level: 0, anchored: false
        }
      ];

      sendDecorationData(connection, uri, changes);

      assert.strictEqual(connection.notifications.length, 1);
      assert.deepStrictEqual(connection.notifications[0].params.changes[0], changes[0]);
    });
  });

  describe('sendChangeCount', () => {
    it('should send change count notification with all types', () => {
      const connection = createSpyConnection();
      const uri = 'file:///test.md';
      const changes: ChangeNode[] = [
        {
          id: '1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 11 },
          contentRange: { start: 3, end: 8 },
          level: 0, anchored: false
        },
        {
          id: '2',
          type: ChangeType.Deletion,
          status: ChangeStatus.Proposed,
          range: { start: 12, end: 23 },
          contentRange: { start: 15, end: 20 },
          level: 0, anchored: false
        },
        {
          id: '3',
          type: ChangeType.Substitution,
          status: ChangeStatus.Proposed,
          range: { start: 24, end: 40 },
          contentRange: { start: 27, end: 37 },
          originalRange: { start: 27, end: 30 },
          modifiedRange: { start: 32, end: 37 },
          level: 0, anchored: false
        },
        {
          id: '4',
          type: ChangeType.Highlight,
          status: ChangeStatus.Proposed,
          range: { start: 41, end: 52 },
          contentRange: { start: 44, end: 49 },
          level: 0, anchored: false
        },
        {
          id: '5',
          type: ChangeType.Comment,
          status: ChangeStatus.Proposed,
          range: { start: 53, end: 64 },
          contentRange: { start: 56, end: 61 },
          level: 0, anchored: false
        }
      ];

      sendChangeCount(connection, uri, changes);

      assert.strictEqual(connection.notifications.length, 1);
      const notification = connection.notifications[0];
      assert.strictEqual(notification.method, 'changetracks/changeCount');
      assert.deepStrictEqual(notification.params, {
        uri,
        counts: {
          insertions: 1,
          deletions: 1,
          substitutions: 1,
          highlights: 1,
          comments: 1,
          total: 5
        }
      });
    });

    it('should send zero counts for empty changes', () => {
      const connection = createSpyConnection();
      const uri = 'file:///test.md';
      const changes: ChangeNode[] = [];

      sendChangeCount(connection, uri, changes);

      // Should send both changeCount and allChangesResolved when total is 0
      assert.strictEqual(connection.notifications.length, 2);

      // First notification: changeCount
      const changeCountNotif = connection.notifications[0];
      assert.strictEqual(changeCountNotif.method, 'changetracks/changeCount');
      assert.deepStrictEqual(changeCountNotif.params, {
        uri,
        counts: {
          insertions: 0,
          deletions: 0,
          substitutions: 0,
          highlights: 0,
          comments: 0,
          total: 0
        }
      });

      // Second notification: allChangesResolved
      const resolvedNotif = connection.notifications[1];
      assert.strictEqual(resolvedNotif.method, 'changetracks/allChangesResolved');
      assert.deepStrictEqual(resolvedNotif.params, { uri });
    });

    it('should send allChangesResolved notification when total is zero', () => {
      const connection = createSpyConnection();
      const uri = 'file:///test.md';
      const changes: ChangeNode[] = [];

      sendChangeCount(connection, uri, changes);

      assert.strictEqual(connection.notifications.length, 2);

      // First notification: changeCount
      assert.strictEqual(connection.notifications[0].method, 'changetracks/changeCount');

      // Second notification: allChangesResolved
      assert.strictEqual(connection.notifications[1].method, 'changetracks/allChangesResolved');
      assert.deepStrictEqual(connection.notifications[1].params, { uri });
    });

    it('should not send allChangesResolved when changes exist', () => {
      const connection = createSpyConnection();
      const uri = 'file:///test.md';
      const changes: ChangeNode[] = [
        {
          id: '1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 11 },
          contentRange: { start: 3, end: 8 },
          level: 0, anchored: false
        }
      ];

      sendChangeCount(connection, uri, changes);

      assert.strictEqual(connection.notifications.length, 1);
      assert.strictEqual(connection.notifications[0].method, 'changetracks/changeCount');
    });

    it('should count multiple changes of same type', () => {
      const connection = createSpyConnection();
      const uri = 'file:///test.md';
      const changes: ChangeNode[] = [
        {
          id: '1',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 0, end: 11 },
          contentRange: { start: 3, end: 8 },
          level: 0, anchored: false
        },
        {
          id: '2',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 12, end: 23 },
          contentRange: { start: 15, end: 20 },
          level: 0, anchored: false
        },
        {
          id: '3',
          type: ChangeType.Insertion,
          status: ChangeStatus.Proposed,
          range: { start: 24, end: 35 },
          contentRange: { start: 27, end: 32 },
          level: 0, anchored: false
        }
      ];

      sendChangeCount(connection, uri, changes);

      assert.strictEqual(connection.notifications.length, 1);
      const notification = connection.notifications[0];
      assert.deepStrictEqual(notification.params.counts, {
        insertions: 3,
        deletions: 0,
        substitutions: 0,
        highlights: 0,
        comments: 0,
        total: 3
      });
    });
  });
});
