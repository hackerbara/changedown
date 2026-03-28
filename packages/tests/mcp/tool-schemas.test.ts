import { describe, it, expect } from 'vitest';
import {
  classicProposeChangeSchema,
  compactProposeChangeSchema,
} from '@changedown/mcp/internals';

describe('tool schemas', () => {
  describe('classic mode', () => {
    it('propose_change has old_text, new_text, changes, raw, no at/op', () => {
      const props = classicProposeChangeSchema.inputSchema.properties as Record<string, unknown>;
      expect(props).toHaveProperty('old_text');
      expect(props).toHaveProperty('new_text');
      expect(props).toHaveProperty('reason');
      expect(props).toHaveProperty('insert_after');
      expect(props).toHaveProperty('author');
      expect(props).toHaveProperty('changes');
      expect(props).toHaveProperty('raw');
      expect(props).not.toHaveProperty('at');
      expect(props).not.toHaveProperty('op');
      // No hashline params
      expect(props).not.toHaveProperty('start_line');
      expect(props).not.toHaveProperty('start_hash');
      expect(props).not.toHaveProperty('level');
    });

    it('propose_change required fields are file only (old_text/new_text optional when changes array used)', () => {
      expect(classicProposeChangeSchema.inputSchema.required).toEqual(['file']);
    });

    it('propose_change changes array has old_text/new_text items', () => {
      const props = classicProposeChangeSchema.inputSchema.properties as Record<string, { items?: { properties: Record<string, unknown> } }>;
      const itemProps = props['changes']?.items?.properties;
      expect(itemProps).toHaveProperty('old_text');
      expect(itemProps).toHaveProperty('new_text');
      expect(itemProps).not.toHaveProperty('at');
      expect(itemProps).not.toHaveProperty('op');
    });
  });

  describe('compact mode', () => {
    it('propose_change has at, op, changes, raw, no old_text/new_text', () => {
      const props = compactProposeChangeSchema.inputSchema.properties as Record<string, unknown>;
      expect(props).toHaveProperty('at');
      expect(props).toHaveProperty('op');
      expect(props).toHaveProperty('author');
      expect(props).toHaveProperty('changes');
      expect(props).toHaveProperty('raw');
      expect(props).not.toHaveProperty('old_text');
      expect(props).not.toHaveProperty('new_text');
      expect(props).not.toHaveProperty('insert_after');
      expect(props).not.toHaveProperty('reason');
    });

    it('propose_change required fields are file only (at/op optional when changes array used)', () => {
      expect(compactProposeChangeSchema.inputSchema.required).toEqual(['file']);
    });

    it('propose_change changes array has at/op items', () => {
      const props = compactProposeChangeSchema.inputSchema.properties as Record<string, { items?: { properties: Record<string, unknown> } }>;
      const itemProps = props['changes']?.items?.properties;
      expect(itemProps).toHaveProperty('at');
      expect(itemProps).toHaveProperty('op');
      expect(itemProps).not.toHaveProperty('old_text');
      expect(itemProps).not.toHaveProperty('new_text');
    });

    it('propose_change changes items require at and op', () => {
      const props = compactProposeChangeSchema.inputSchema.properties as Record<string, { items?: { required: string[] } }>;
      expect(props['changes']?.items?.required).toEqual(['at', 'op']);
    });
  });
});
