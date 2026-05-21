import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResourceLister } from '@changedown/mcp/internals';
import { ResourceReader } from '@changedown/mcp/internals';
import type { BackendRegistry, DocumentBackend, DocumentResourceDescriptor } from '@changedown/core';

function makeBackend(scheme: string, descriptors: DocumentResourceDescriptor[]): DocumentBackend {
  return {
    schemes: [scheme],
    list: vi.fn().mockReturnValue(descriptors),
    read: vi.fn().mockResolvedValue({
      text: '# Hello',
      format: 'L3',
      version: 'v1',
      publicationState: 'ready',
      protocolSurface: {
        protocolVersion: 'changedown-protocol-v1',
        sourceDigest: 'digest-resource-hello',
        source: '# Hello',
        entries: [],
        order: [],
        actionabilityByChangeId: {},
        certificationByChangeId: {},
      },
    }),
    applyChange: vi.fn(),
    listChanges: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
  } as unknown as DocumentBackend;
}

function makeRegistry(backends: DocumentBackend[]): BackendRegistry {
  const map = new Map<string, DocumentBackend>();
  for (const b of backends) {
    for (const s of b.schemes) {
      map.set(s, b);
    }
  }
  return {
    listResources: () => backends.flatMap((b) => b.list()),
    resolve: (uri: string) => {
      const scheme = uri.split('://')[0];
      const b = map.get(scheme!);
      if (!b) throw new Error(`BackendNotFoundError: no backend for scheme ${scheme}`);
      return b;
    },
    register: vi.fn(),
    onDidChange: vi.fn(),
  } as unknown as BackendRegistry;
}

describe('ResourceLister', () => {
  it('returns empty list when no backends registered', () => {
    const registry = makeRegistry([]);
    const lister = new ResourceLister(registry);
    expect(lister.list()).toEqual([]);
  });

  it('includes file resources from FileBackend', () => {
    const fileDescriptor: DocumentResourceDescriptor = {
      uri: 'file:///home/user/doc.md',
      name: 'doc.md',
      mimeType: 'text/markdown',
    };
    const backend = makeBackend('file', [fileDescriptor]);
    const registry = makeRegistry([backend]);
    const lister = new ResourceLister(registry);
    expect(lister.list()).toHaveLength(1);
    expect(lister.list()[0]!.uri).toBe('file:///home/user/doc.md');
  });

  it('includes Word session resource when pane is registered', () => {
    const wordDescriptor: DocumentResourceDescriptor = {
      uri: 'word://sess-abc-123',
      name: 'Active Word Document (sess-abc-123)',
      mimeType: 'text/markdown',
    };
    const backend = makeBackend('word', [wordDescriptor]);
    const registry = makeRegistry([backend]);
    const lister = new ResourceLister(registry);
    const results = lister.list();
    expect(results).toHaveLength(1);
    expect(results[0]!.uri).toBe('word://sess-abc-123');
  });

  it('aggregates resources from multiple backends', () => {
    const file1: DocumentResourceDescriptor = {
      uri: 'file:///a/b.md',
      name: 'b.md',
      mimeType: 'text/markdown',
    };
    const word1: DocumentResourceDescriptor = {
      uri: 'word://sess-xyz',
      name: 'Active Word Document (sess-xyz)',
      mimeType: 'text/markdown',
    };
    const fileBackend = makeBackend('file', [file1]);
    const wordBackend = makeBackend('word', [word1]);
    const registry = makeRegistry([fileBackend, wordBackend]);
    const lister = new ResourceLister(registry);
    expect(lister.list()).toHaveLength(2);
  });
});

describe('ResourceReader', () => {
  it('delegates read to the correct backend', async () => {
    const descriptor: DocumentResourceDescriptor = {
      uri: 'word://sess-abc-123',
      name: 'Active Word Document',
      mimeType: 'text/markdown',
    };
    const backend = makeBackend('word', [descriptor]);
    const registry = makeRegistry([backend]);
    const reader = new ResourceReader(registry);
    const result = await reader.read('word://sess-abc-123');
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]!.text).toBe('# Hello');
    expect(result.contents[0]!.uri).toBe('word://sess-abc-123');
  });

  it('can format resource reads through the agent markdown pipeline', async () => {
    const descriptor: DocumentResourceDescriptor = {
      uri: 'word://sess-abc-123',
      name: 'Active Word Document',
      mimeType: 'text/markdown',
    };
    const backend = makeBackend('word', [descriptor]);
    const registry = makeRegistry([backend]);
    const reader = new ResourceReader(registry, async (uri, snapshot) => {
      expect(uri).toBe('word://sess-abc-123');
      expect(snapshot.text).toBe('# Hello');
      return '001:a1 │ # Hello';
    });
    const result = await reader.read('word://sess-abc-123');
    expect(result.contents[0]!.text).toBe('001:a1 │ # Hello');
  });

  it('throws when no backend can serve the URI', async () => {
    const registry = makeRegistry([]);
    const reader = new ResourceReader(registry);
    await expect(reader.read('word://sess-unknown'))
      .rejects.toThrow('BackendNotFoundError');
  });
});
