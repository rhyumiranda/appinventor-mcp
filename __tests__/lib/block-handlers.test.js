import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handle_get_blocks, handle_add_blocks } from '../../extension/lib/tool-handlers.js';

describe('block tool handlers', () => {
  let mockPageApi;

  beforeEach(() => {
    mockPageApi = {
      call: vi.fn()
    };
  });

  describe('handle_get_blocks', () => {
    it('returns XML format by default', async () => {
      mockPageApi.call.mockImplementation((fn) => {
        if (fn === 'getBlocksXml') return '<xml><block type="component_event"></block></xml>';
        return null;
      });

      const result = await handle_get_blocks({}, mockPageApi);

      expect(result.success).toBe(true);
      expect(result.xml).toBeDefined();
      expect(result.xml).toContain('<xml');
    });

    it('returns XML format when explicitly requested', async () => {
      mockPageApi.call.mockImplementation((fn) => {
        if (fn === 'getBlocksXml') return '<xml></xml>';
        return null;
      });

      const result = await handle_get_blocks({ format: 'xml' }, mockPageApi);

      expect(result.success).toBe(true);
      expect(result.xml).toBeDefined();
    });

    it('returns summary format when requested', async () => {
      mockPageApi.call.mockImplementation((fn) => {
        if (fn === 'getBlocksSummary') return {
          eventHandlers: [{ component: 'Button1', event: 'Click', blockCount: 3 }],
          variables: ['score'],
          procedures: [{ name: 'resetGame', hasReturn: false, paramCount: 0 }],
          totalBlocks: 12,
          warnings: [{ blockType: 'component_set_get', message: 'Missing component' }],
          orphanedBlocks: 2
        };
        return null;
      });

      const result = await handle_get_blocks({ format: 'summary' }, mockPageApi);

      expect(result.success).toBe(true);
      expect(result.eventHandlers).toHaveLength(1);
      expect(result.variables).toContain('score');
      expect(result.procedures).toHaveLength(1);
      expect(result.totalBlocks).toBe(12);
      expect(result.warnings).toHaveLength(1);
      expect(result.orphanedBlocks).toBe(2);
    });

    it('returns error on failure', async () => {
      mockPageApi.call.mockImplementation(() => { throw new Error('No workspace'); });

      const result = await handle_get_blocks({}, mockPageApi);
      expect(result.success).toBe(false);
    });
  });

  describe('handle_add_blocks', () => {
    it('adds blocks via raw XML input', async () => {
      mockPageApi.call.mockImplementation((fn) => {
        if (fn === 'injectBlocksXml') return { blocksAdded: 3, warnings: [] };
        return null;
      });

      const result = await handle_add_blocks({
        xml: '<xml><block type="component_event"></block></xml>'
      }, mockPageApi);

      expect(result.success).toBe(true);
      expect(result.blocksAdded).toBe(3);
    });

    it('adds blocks via structured descriptions', async () => {
      mockPageApi.call.mockImplementation((fn) => {
        if (fn === 'injectBlocksXml') return { blocksAdded: 1, warnings: [] };
        return null;
      });

      const result = await handle_add_blocks({
        blocks: [{
          type: 'event_handler',
          component: 'Button1',
          componentType: 'Button',
          event: 'Click'
        }]
      }, mockPageApi);

      expect(result.success).toBe(true);
      expect(result.blocksAdded).toBe(1);
    });

    it('returns warnings from newly added blocks', async () => {
      mockPageApi.call.mockImplementation((fn) => {
        if (fn === 'injectBlocksXml') return {
          blocksAdded: 2,
          warnings: ['Button1 does not exist on this screen']
        };
        return null;
      });

      const result = await handle_add_blocks({
        xml: '<xml><block type="component_event"></block></xml>'
      }, mockPageApi);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Button1');
    });

    it('wraps batch injection with events disable/enable', async () => {
      const callLog = [];
      mockPageApi.call.mockImplementation((fn) => {
        callLog.push(fn);
        if (fn === 'injectBlocksXml') return { blocksAdded: 1, warnings: [] };
        return null;
      });

      await handle_add_blocks({
        xml: '<xml><block type="text"></block></xml>'
      }, mockPageApi);

      expect(callLog).toContain('disableBlocklyEvents');
      expect(callLog).toContain('enableBlocklyEvents');
      const disableIdx = callLog.indexOf('disableBlocklyEvents');
      const injectIdx = callLog.indexOf('injectBlocksXml');
      const enableIdx = callLog.indexOf('enableBlocklyEvents');
      expect(disableIdx).toBeLessThan(injectIdx);
      expect(injectIdx).toBeLessThan(enableIdx);
    });

    it('returns error on failure', async () => {
      mockPageApi.call.mockImplementation(() => { throw new Error('Injection failed'); });

      const result = await handle_add_blocks({ xml: '<xml></xml>' }, mockPageApi);
      expect(result.success).toBe(false);
    });
  });
});
