import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handle_get_project_info,
  handle_get_component_tree
} from '../../extension/lib/tool-handlers.js';

describe('tool-handlers', () => {
  let mockPageApi;

  beforeEach(() => {
    mockPageApi = {
      call: vi.fn()
    };
  });

  describe('handle_get_project_info', () => {
    it('returns project info shape', async () => {
      mockPageApi.call
        .mockImplementation((fn) => {
          switch (fn) {
            case 'HTML5DragDrop_getOpenProjectId': return '3766081';
            case 'BlocklyPanel_getProjectName': return 'MyApp';
            case 'isEditorOpen': return true;
            case 'isBlocksEditorOpen': return false;
            case 'BlocklyPanel_getCurrentScreen': return 'Screen1';
            default: return null;
          }
        });

      const result = await handle_get_project_info({}, mockPageApi);

      expect(result.success).toBe(true);
      expect(result.projectId).toBe('3766081');
      expect(result.projectName).toBe('MyApp');
      expect(result.isEditorOpen).toBe(true);
      expect(result.isBlocksEditorOpen).toBe(false);
      expect(result.currentScreen).toBe('Screen1');
    });

    it('returns error when not on App Inventor page', async () => {
      mockPageApi.call.mockImplementation(() => {
        throw new Error('Function not found');
      });

      const result = await handle_get_project_info({}, mockPageApi);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('handle_get_component_tree', () => {
    it('returns SCM tree for default screen', async () => {
      const mockScm = {
        Properties: {
          $Name: 'Screen1',
          $Type: 'Form',
          $Components: [
            { $Name: 'Button1', $Type: 'Button' }
          ]
        }
      };
      mockPageApi.call.mockReturnValue(JSON.stringify(mockScm));

      const result = await handle_get_component_tree({}, mockPageApi);

      expect(result.success).toBe(true);
      expect(result.scm).toBeDefined();
      expect(result.scm.Properties.$Name).toBe('Screen1');
    });

    it('accepts screenName parameter', async () => {
      const mockScm = { Properties: { $Name: 'Screen2' } };
      mockPageApi.call.mockReturnValue(JSON.stringify(mockScm));

      const result = await handle_get_component_tree({ screenName: 'Screen2' }, mockPageApi);

      expect(mockPageApi.call).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ screenName: 'Screen2' })
      );
    });

    it('returns error when SCM read fails', async () => {
      mockPageApi.call.mockImplementation(() => {
        throw new Error('No SCM data');
      });

      const result = await handle_get_component_tree({}, mockPageApi);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
