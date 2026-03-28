import { describe, it, expect } from 'vitest';
import { classifyEdit, shouldLogEdit } from 'changedown-hooks/internals';

describe('classifyEdit', () => {
  it('classifies Write as creation', () => {
    expect(classifyEdit('Write', '', 'new content')).toBe('creation');
  });

  it('classifies empty old + non-empty new as insertion', () => {
    expect(classifyEdit('Edit', '', 'inserted text')).toBe('insertion');
  });

  it('classifies non-empty old + empty new as deletion', () => {
    expect(classifyEdit('Edit', 'deleted text', '')).toBe('deletion');
  });

  it('classifies both non-empty as substitution', () => {
    expect(classifyEdit('Edit', 'old', 'new')).toBe('substitution');
  });
});

describe('shouldLogEdit', () => {
  it('returns true only in safety-net mode', () => {
    expect(shouldLogEdit('safety-net')).toBe(true);
    expect(shouldLogEdit('strict')).toBe(false);
    expect(shouldLogEdit('permissive')).toBe(false);
  });
});
