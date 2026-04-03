import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handle_update_component_properties,
  handle_remove_components,
  handle_clear_blocks,
  handle_modify_block,
  handle_take_screenshot,
  handle_undo,
  handle_redo,
  handle_reload_designer
} from '../../extension/lib/tool-handlers.js';

describe('polish tool handlers', () => {
  let mockPageApi;

  beforeEach(() => {
    mockPageApi = { call: vi.fn() };
  });

  describe('handle_update_component_properties (US-021)', () => {
    it('updates property on existing component', async () => {
      const scm = {
        authURL: ['ai2a.appinventor.mit.edu'], YaVersion: '233', Source: 'Form',
        Properties: {
          $Name: 'Screen1', $Type: 'Form', $Version: '31', Uuid: '0',
          $Components: [
            { $Name: 'Button1', $Type: 'Button', $Version: '7', Uuid: '1', Text: 'Old' }
          ]
        }
      };

      mockPageApi.call.mockImplementation((fn) => {
        if (fn === 'getComponentTree') return JSON.stringify(scm);
        if (fn === 'save2') return { success: true };
        if (fn === 'reload') return true;
        if (fn === 'HTML5DragDrop_getOpenProjectId') return '123';
        if (fn === 'getSessionParams') return {
          baseUrl: 'https://ai2a.appinventor.mit.edu/ode/',
          gwtPermutationHash: 'H', sessionUuid: 'U', filePath: 'src/Screen1.scm'
        };
        return null;
      });

      const result = await handle_update_component_properties({
        componentName: 'Button1',
        properties: { Text: 'New', BackgroundColor: '&HFF0000FF' }
      }, mockPageApi);

      expect(result.success).toBe(true);
      expect(result.updatedProperties).toContain('Text');
      expect(result.updatedProperties).toContain('BackgroundColor');
    });

    it('returns error for component not found', async () => {
      const scm = {
        authURL: ['ai2a.appinventor.mit.edu'], YaVersion: '233', Source: 'Form',
        Properties: {
          $Name: 'Screen1', $Type: 'Form', $Version: '31', Uuid: '0', $Components: []
        }
      };

      mockPageApi.call.mockImplementation((fn) => {
        if (fn === 'getComponentTree') return JSON.stringify(scm);
        return null;
      });

      const result = await handle_update_component_properties({
        componentName: 'NonExistent', properties: { Text: 'x' }
      }, mockPageApi);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('handle_remove_components (US-022)', () => {
    it('removes a single component', async () => {
      const scm = {
        authURL: ['ai2a.appinventor.mit.edu'], YaVersion: '233', Source: 'Form',
        Properties: {
          $Name: 'Screen1', $Type: 'Form', $Version: '31', Uuid: '0',
          $Components: [
            { $Name: 'Button1', $Type: 'Button', $Version: '7', Uuid: '1' },
            { $Name: 'Label1', $Type: 'Label', $Version: '5', Uuid: '2' }
          ]
        }
      };

      mockPageApi.call.mockImplementation((fn) => {
        if (fn === 'getComponentTree') return JSON.stringify(scm);
        if (fn === 'save2') return { success: true };
        if (fn === 'reload') return true;
        if (fn === 'HTML5DragDrop_getOpenProjectId') return '123';
        if (fn === 'getSessionParams') return {
          baseUrl: 'https://ai2a.appinventor.mit.edu/ode/',
          gwtPermutationHash: 'H', sessionUuid: 'U', filePath: 'src/Screen1.scm'
        };
        return null;
      });

      const result = await handle_remove_components({
        componentNames: ['Button1']
      }, mockPageApi);

      expect(result.success).toBe(true);
      expect(result.removedComponents).toContain('Button1');
    });

    it('removes component with children (cascading)', async () => {
      const scm = {
        authURL: ['ai2a.appinventor.mit.edu'], YaVersion: '233', Source: 'Form',
        Properties: {
          $Name: 'Screen1', $Type: 'Form', $Version: '31', Uuid: '0',
          $Components: [{
            $Name: 'VA1', $Type: 'VerticalArrangement', $Version: '4', Uuid: '1',
            $Components: [
              { $Name: 'Button1', $Type: 'Button', $Version: '7', Uuid: '2' }
            ]
          }]
        }
      };

      mockPageApi.call.mockImplementation((fn) => {
        if (fn === 'getComponentTree') return JSON.stringify(scm);
        if (fn === 'save2') return { success: true };
        if (fn === 'reload') return true;
        if (fn === 'HTML5DragDrop_getOpenProjectId') return '123';
        if (fn === 'getSessionParams') return {
          baseUrl: 'https://ai2a.appinventor.mit.edu/ode/',
          gwtPermutationHash: 'H', sessionUuid: 'U', filePath: 'src/Screen1.scm'
        };
        return null;
      });

      const result = await handle_remove_components({
        componentNames: ['VA1']
      }, mockPageApi);

      expect(result.success).toBe(true);
      expect(result.removedComponents).toContain('VA1');
    });
  });

  describe('handle_clear_blocks (US-023)', () => {
    it('clears all blocks', async () => {
      mockPageApi.call.mockImplementation((fn) => {
        if (fn === 'clearBlocks') return { blocksRemoved: 15 };
        return null;
      });

      const result = await handle_clear_blocks({}, mockPageApi);
      expect(result.success).toBe(true);
      expect(result.blocksRemoved).toBe(15);
    });

    it('clears targeted blocks by ID', async () => {
      mockPageApi.call.mockImplementation((fn) => {
        if (fn === 'clearBlocks') return { blocksRemoved: 2 };
        return null;
      });

      const result = await handle_clear_blocks({ blockIds: ['b1', 'b2'] }, mockPageApi);
      expect(result.success).toBe(true);
      expect(result.blocksRemoved).toBe(2);
    });
  });

  describe('handle_modify_block (US-023)', () => {
    it('modifies a block field value', async () => {
      mockPageApi.call.mockReturnValue({ success: true });

      const result = await handle_modify_block({
        blockId: 'b1', fieldName: 'TEXT', newValue: 'Updated'
      }, mockPageApi);

      expect(result.success).toBe(true);
    });
  });

  describe('handle_take_screenshot (US-024)', () => {
    it('returns base64 PNG', async () => {
      mockPageApi.call.mockReturnValue({ imageData: 'data:image/png;base64,iVBOR...' });

      const result = await handle_take_screenshot({}, mockPageApi);
      expect(result.success).toBe(true);
      expect(result.imageData).toContain('base64');
    });
  });

  describe('handle_undo (US-024)', () => {
    it('returns remaining counts', async () => {
      mockPageApi.call.mockReturnValue({ remainingUndos: 5, remainingRedos: 1 });

      const result = await handle_undo({}, mockPageApi);
      expect(result.success).toBe(true);
      expect(result.remainingUndos).toBe(5);
      expect(result.remainingRedos).toBe(1);
    });
  });

  describe('handle_redo (US-024)', () => {
    it('returns remaining counts', async () => {
      mockPageApi.call.mockReturnValue({ remainingUndos: 6, remainingRedos: 0 });

      const result = await handle_redo({}, mockPageApi);
      expect(result.success).toBe(true);
    });
  });

  describe('handle_reload_designer (US-024)', () => {
    it('returns loadTime', async () => {
      mockPageApi.call.mockReturnValue({ loadTime: 2500 });

      const result = await handle_reload_designer({}, mockPageApi);
      expect(result.success).toBe(true);
      expect(result.loadTime).toBe(2500);
    });
  });
});
