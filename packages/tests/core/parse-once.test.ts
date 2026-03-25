import { describe, it, expect, beforeAll } from 'vitest';
import { initHashline, buildChangesDocument, buildSettledDocument, buildReviewDocument, buildRawDocument } from '@changetracks/core/internals';

const FIXTURE = [
  'Hello {++world++}[^ct-1] and {--old--}[^ct-2]',
  '',
  '[^ct-1]: @alice | 2026-03-23 | ins | proposed',
  '[^ct-2]: @bob | 2026-03-23 | del | accepted',
].join('\n');

beforeAll(async () => { await initHashline(); });

const OPTIONS = {
  filePath: 'test.md',
  trackingStatus: 'tracked' as const,
  protocolMode: 'standard',
  defaultView: 'review' as const,
  viewPolicy: 'default',
};

describe('parse-once view builders', () => {
  it('changes view produces correct header counts', () => {
    const doc = buildChangesDocument(FIXTURE, OPTIONS);
    expect(doc.header.counts).toEqual({ proposed: 1, accepted: 1, rejected: 0 });
    expect(doc.header.authors).toEqual(['@alice', '@bob']);
  });

  it('settled view produces correct header counts', () => {
    const doc = buildSettledDocument(FIXTURE, OPTIONS);
    expect(doc.header.counts).toEqual({ proposed: 1, accepted: 1, rejected: 0 });
  });

  it('review view produces correct header and metadata', () => {
    const doc = buildReviewDocument(FIXTURE, OPTIONS);
    expect(doc.header.counts).toEqual({ proposed: 1, accepted: 1, rejected: 0 });
    expect(doc.lines.length).toBeGreaterThan(0);
  });

  it('raw view produces correct header', () => {
    const doc = buildRawDocument(FIXTURE, OPTIONS);
    expect(doc.header.counts).toEqual({ proposed: 1, accepted: 1, rejected: 0 });
  });
});
