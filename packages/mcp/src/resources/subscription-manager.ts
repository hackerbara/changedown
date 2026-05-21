export interface ResourceNotification {
  method: 'notifications/resources/updated';
  params: {
    uri: string;
    version?: string;
  };
}

export interface SubscriptionManagerOptions {
  /** Maximum pending notifications queued per paused session before oldest is dropped. Default: 50. */
  maxQueuedNotificationsPerSession?: number;
}

type SendCallback = (sessionId: string, notification: ResourceNotification) => void;
type DropCallback = (sessionId: string, notification: ResourceNotification) => void;

export class SubscriptionManager {
  /** uri → Set<sessionId> */
  private readonly subs = new Map<string, Set<string>>();
  /** sessionId → Set<uri> (reverse index for removeSession) */
  private readonly bySess = new Map<string, Set<string>>();
  /** Paused sessions accumulate notifications here */
  private readonly queues = new Map<string, ResourceNotification[]>();
  private readonly paused = new Set<string>();
  private readonly maxQueue: number;
  private dropCallback: DropCallback | null = null;

  constructor(opts: SubscriptionManagerOptions = {}) {
    this.maxQueue = opts.maxQueuedNotificationsPerSession ?? 50;
  }

  subscribe(sessionId: string, uri: string): void {
    if (!this.subs.has(uri)) this.subs.set(uri, new Set());
    this.subs.get(uri)!.add(sessionId);

    if (!this.bySess.has(sessionId)) this.bySess.set(sessionId, new Set());
    this.bySess.get(sessionId)!.add(uri);
  }

  unsubscribe(sessionId: string, uri: string): void {
    this.subs.get(uri)?.delete(sessionId);
    this.bySess.get(sessionId)?.delete(uri);
  }

  subscribersFor(uri: string): string[] {
    return Array.from(this.subs.get(uri) ?? []);
  }

  removeSession(sessionId: string): void {
    const uris = this.bySess.get(sessionId);
    if (uris) {
      for (const uri of uris) {
        this.subs.get(uri)?.delete(sessionId);
      }
    }
    this.bySess.delete(sessionId);
    this.queues.delete(sessionId);
    this.paused.delete(sessionId);
  }

  onDrop(cb: DropCallback): void {
    this.dropCallback = cb;
  }

  markSessionPaused(sessionId: string): void {
    this.paused.add(sessionId);
    if (!this.queues.has(sessionId)) this.queues.set(sessionId, []);
  }

  markSessionResumed(sessionId: string): void {
    this.paused.delete(sessionId);
  }

  /**
   * Enqueue a notification for a paused session. Drops oldest when the queue
   * exceeds the configured limit so slow consumers don't grow unbounded.
   */
  enqueue(sessionId: string, notification: ResourceNotification): void {
    const queue = this.queues.get(sessionId) ?? [];
    this.queues.set(sessionId, queue);
    if (queue.length >= this.maxQueue) {
      const dropped = queue.shift()!;
      this.dropCallback?.(sessionId, dropped);
    }
    queue.push(notification);
  }

  /**
   * Fan-out a resources/updated notification to all subscribed sessions.
   * Paused sessions get the notification enqueued; active sessions get the
   * callback fired immediately (the callback writes to their SSE stream).
   */
  fanOut(uri: string, send: SendCallback, version?: string): void {
    const notification: ResourceNotification = {
      method: 'notifications/resources/updated',
      params: version === undefined ? { uri } : { uri, version },
    };
    for (const sessionId of this.subscribersFor(uri)) {
      if (this.paused.has(sessionId)) {
        this.enqueue(sessionId, notification);
      } else {
        send(sessionId, notification);
      }
    }
  }

  /**
   * Drain queued notifications for a session that just resumed.
   * Calls send() for each queued notification in order.
   */
  drain(sessionId: string, send: SendCallback): void {
    const queue = this.queues.get(sessionId);
    if (!queue || queue.length === 0) return;
    this.queues.set(sessionId, []);
    for (const notification of queue) {
      send(sessionId, notification);
    }
  }
}
