import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handle_get_component_schema,
  handle_get_all_component_types,
  handle_search_components,
  handle_get_block_diagnostics
} from '../../extension/lib/tool-handlers.js';

describe('intelligence tool handlers', () => {
  let mockPageApi;

  beforeEach(() => {
    mockPageApi = { call: vi.fn() };
  });

  describe('handle_get_component_schema (US-015)', () => {
    it('returns schema shape for known component', async () => {
      mockPageApi.call.mockImplementation((fn, args) => {
        if (fn === 'getComponentInfo') return {
          type: 'Button',
          category: 'User Interface',
          version: 7,
          properties: [{ name: 'Text', type: 'string', access: 'read-write' }],
          events: [{ name: 'Click', params: [] }],
          methods: [{ name: 'SetFocus', params: [], returnType: 'void' }]
        };
        return null;
      });

      const result = await handle_get_component_schema({ componentType: 'Button' }, mockPageApi);

      expect(result.success).toBe(true);
      expect(result.type).toBe('Button');
      expect(result.category).toBe('User Interface');
      expect(result.properties).toHaveLength(1);
      expect(result.events).toHaveLength(1);
      expect(result.methods).toHaveLength(1);
    });

    it('returns error for unknown component type', async () => {
      mockPageApi.call.mockImplementation(() => { throw new Error('Unknown component'); });

      const result = await handle_get_component_schema({ componentType: 'FakeWidget' }, mockPageApi);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('handle_get_all_component_types (US-016)', () => {
    it('returns full catalog', async () => {
      mockPageApi.call.mockImplementation((fn) => {
        if (fn === 'getAllComponentTypes') return [
          { type: 'Button', category: 'User Interface', version: 7, visible: true },
          { type: 'Clock', category: 'Sensors', version: 4, visible: false },
          { type: 'Label', category: 'User Interface', version: 5, visible: true }
        ];
        return null;
      });

      const result = await handle_get_all_component_types({}, mockPageApi);

      expect(result.success).toBe(true);
      expect(result.components).toHaveLength(3);
      expect(result.components[0]).toHaveProperty('type');
      expect(result.components[0]).toHaveProperty('category');
      expect(result.components[0]).toHaveProperty('version');
      expect(result.components[0]).toHaveProperty('visible');
    });
  });

  describe('handle_search_components (US-017)', () => {
    it('returns matches for keyword search', async () => {
      mockPageApi.call.mockImplementation((fn, args) => {
        if (fn === 'searchComponents') return [
          { type: 'Button', category: 'User Interface', description: 'A clickable button' },
          { type: 'ListPicker', category: 'User Interface', description: 'Button that shows a list picker' }
        ];
        return null;
      });

      const result = await handle_search_components({ query: 'button' }, mockPageApi);

      expect(result.success).toBe(true);
      expect(result.matches).toHaveLength(2);
      expect(result.matches[0]).toHaveProperty('type');
    });

    it('returns empty matches for no results', async () => {
      mockPageApi.call.mockImplementation((fn) => {
        if (fn === 'searchComponents') return [];
        return null;
      });

      const result = await handle_search_components({ query: 'zzzznonexistent' }, mockPageApi);

      expect(result.success).toBe(true);
      expect(result.matches).toHaveLength(0);
    });
  });

  describe('handle_get_block_diagnostics (US-018)', () => {
    it('returns diagnostic info', async () => {
      mockPageApi.call.mockImplementation((fn) => {
        if (fn === 'getBlockDiagnostics') return {
          warnings: [{ blockId: 'b1', blockType: 'component_set_get', component: 'Label1', message: 'Missing component' }],
          orphanedBlocks: [{ blockId: 'b2', blockType: 'text' }],
          totalBlocks: 10,
          connectedBlocks: 8
        };
        return null;
      });

      const result = await handle_get_block_diagnostics({}, mockPageApi);

      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.orphanedBlocks).toHaveLength(1);
      expect(result.totalBlocks).toBe(10);
      expect(result.connectedBlocks).toBe(8);
    });
  });
});
