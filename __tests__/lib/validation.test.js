import { describe, it, expect } from 'vitest';
import {
  validateAddComponents,
  validateAddBlocks
} from '../../extension/lib/validators.js';

describe('validators', () => {
  describe('validateAddComponents', () => {
    it('passes for valid component specs', () => {
      const result = validateAddComponents({
        components: [{ type: 'Button', name: 'Button1' }]
      });
      expect(result.valid).toBe(true);
    });

    it('fails for missing component type', () => {
      const result = validateAddComponents({
        components: [{ name: 'Button1' }]
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('type');
    });

    it('fails for missing component name', () => {
      const result = validateAddComponents({
        components: [{ type: 'Button' }]
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('name');
    });

    it('fails for duplicate names', () => {
      const result = validateAddComponents({
        components: [
          { type: 'Button', name: 'Button1' },
          { type: 'Label', name: 'Button1' }
        ]
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('duplicate');
    });

    it('fails for empty components array', () => {
      const result = validateAddComponents({ components: [] });
      expect(result.valid).toBe(false);
    });

    it('fails for missing components field', () => {
      const result = validateAddComponents({});
      expect(result.valid).toBe(false);
    });
  });

  describe('validateAddBlocks', () => {
    it('passes for valid XML input', () => {
      const result = validateAddBlocks({
        xml: '<xml><block type="text"></block></xml>'
      });
      expect(result.valid).toBe(true);
    });

    it('passes for valid structured blocks', () => {
      const result = validateAddBlocks({
        blocks: [{ type: 'event_handler', component: 'Button1', componentType: 'Button', event: 'Click' }]
      });
      expect(result.valid).toBe(true);
    });

    it('fails for empty input (no xml or blocks)', () => {
      const result = validateAddBlocks({});
      expect(result.valid).toBe(false);
    });

    it('fails for malformed XML (missing xml root)', () => {
      const result = validateAddBlocks({
        xml: '<block type="text"></block>'
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('xml');
    });
  });
});
