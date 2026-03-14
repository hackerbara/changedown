import { describe, it, expect } from 'vitest';
import { resolveTracking } from '@changetracks/lsp-server/internals';

describe('resolveTracking', () => {
  it('returns file source when tracked header present', () => {
    const result = resolveTracking('<!-- ctrcks.com/v1: tracked -->\n# Doc');
    expect(result).toStrictEqual({ enabled: true, source: 'file' });
  });

  it('returns file source when untracked header present', () => {
    const result = resolveTracking('<!-- ctrcks.com/v1: untracked -->\n# Doc');
    expect(result).toStrictEqual({ enabled: false, source: 'file' });
  });

  it('returns project source when no header and config says tracked', () => {
    const result = resolveTracking('# No Header', 'tracked');
    expect(result).toStrictEqual({ enabled: true, source: 'project' });
  });

  it('returns project source when no header and config says untracked', () => {
    const result = resolveTracking('# No Header', 'untracked');
    expect(result).toStrictEqual({ enabled: false, source: 'project' });
  });

  it('returns default (tracked) when no header and no config', () => {
    const result = resolveTracking('# No Header');
    expect(result).toStrictEqual({ enabled: true, source: 'default' });
  });

  it('file header takes precedence over project config', () => {
    const result = resolveTracking('<!-- ctrcks.com/v1: untracked -->\n# Doc', 'tracked');
    expect(result).toStrictEqual({ enabled: false, source: 'file' });
  });

  it('handles header with extra whitespace', () => {
    const result = resolveTracking('<!--  ctrcks.com/v1:  tracked  -->\n# Doc');
    expect(result).toStrictEqual({ enabled: true, source: 'file' });
  });
});
