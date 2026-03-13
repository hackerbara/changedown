import { describe, it, expect, beforeAll } from 'vitest';
import {
  initHashline,
  buildViewDocument,
  formatPlainText,
  formatAnsi,
} from '@changetracks/core';

const FIXTURE_CONTENT = [
  'Hello {++world++}[^ct-1].',
  '',
  '[^ct-1]: @ai:test | 2026-01-01 | ins | proposed',
  '    reason: greeting',
].join('\n');

const VIEW_OPTIONS = {
  filePath: 'test.md',
  trackingStatus: 'tracked' as const,
  protocolMode: 'classic',
  defaultView: 'review' as const,
  viewPolicy: 'suggest',
};

describe('unified renderer CLI integration', () => {
  beforeAll(async () => { await initHashline(); });

  it('review view output contains three-zone format', () => {
    const doc = buildViewDocument(FIXTURE_CONTENT, 'review', VIEW_OPTIONS);
    const output = formatPlainText(doc);

    // Header present with counts
    expect(output).toContain('## test.md | policy: classic | tracking: tracked');
    expect(output).toContain('proposed: 1');
    expect(output).toContain('---');

    // Hashline coordinates: LINE:HASH FLAG| content
    expect(output).toMatch(/\d+:[0-9a-f]{2}\s+\w?\|/);

    // Zone 3 metadata inline
    expect(output).toContain('{>>ct-1');
  });

  it('changes view output contains P/A flags and change IDs', () => {
    const doc = buildViewDocument(FIXTURE_CONTENT, 'changes', VIEW_OPTIONS);
    const output = formatPlainText(doc);

    // P flag for proposed change
    expect(output).toMatch(/P\|/);

    // Change ID in metadata
    expect(output).toContain('{>>ct-1<<}');

    // Committed text (insertion stripped since proposed)
    expect(output).toContain('Hello .');
  });

  it('settled view output contains clean text', () => {
    const doc = buildViewDocument(FIXTURE_CONTENT, 'settled', VIEW_OPTIONS);
    const output = formatPlainText(doc);

    // Accept-all: insertion applied
    expect(output).toContain('Hello world.');

    // No CriticMarkup in output
    expect(output).not.toContain('{++');
    expect(output).not.toContain('[^ct-1]');

    // No metadata zone
    expect(output).not.toContain('{>>');
  });

  it('raw view output contains literal file content', () => {
    const doc = buildViewDocument(FIXTURE_CONTENT, 'raw', VIEW_OPTIONS);
    const output = formatPlainText(doc);

    // Literal CriticMarkup preserved
    expect(output).toContain('{++world++}');
    expect(output).toContain('[^ct-1]');
  });

  it('ANSI formatter produces colored output without hashlines', () => {
    const doc = buildViewDocument(FIXTURE_CONTENT, 'review', VIEW_OPTIONS);
    const output = formatAnsi(doc);

    // ANSI escape codes present
    expect(output).toContain('\x1b[');

    // No hashline coordinates in ANSI output
    expect(output).not.toMatch(/^\d+:[0-9a-f]{2}/m);
  });

  it('ANSI formatter respects showMarkup option', () => {
    const doc = buildViewDocument(FIXTURE_CONTENT, 'review', VIEW_OPTIONS);
    const withMarkup = formatAnsi(doc, { showMarkup: true });
    const withoutMarkup = formatAnsi(doc, { showMarkup: false });

    // With showMarkup, delimiters are visible
    expect(withMarkup).toContain('{++');

    // Without showMarkup, delimiters are hidden (empty string for delimiters)
    expect(withoutMarkup).not.toContain('{++');
  });
});
