import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handle_add_components } from '../../extension/lib/tool-handlers.js';

describe('handle_add_components', () => {
  let mockPageApi;

  beforeEach(() => {
    const existingScm = {
      authURL: ['ai2a.appinventor.mit.edu'],
      YaVersion: '233',
      Source: 'Form',
      Properties: {
        $Name: 'Screen1',
        $Type: 'Form',
        $Version: '31',
        Uuid: '0',
        $Components: []
      }
    };

    mockPageApi = {
      call: vi.fn().mockImplementation((fn) => {
        switch (fn) {
          case 'getComponentTree': return JSON.stringify(existingScm);
          case 'save2': return { success: true };
          case 'reload': return true;
          case 'HTML5DragDrop_getOpenProjectId': return '3766081';
          case 'getSessionParams': return {
            baseUrl: 'https://ai2a.appinventor.mit.edu/ode/',
            gwtPermutationHash: 'ABC123',
            sessionUuid: 'sess-uuid',
            filePath: 'src/appinventor/ai_test/App/Screen1.scm'
          };
          default: return null;
        }
      })
    };
  });

  it('adds a single component', async () => {
    const result = await handle_add_components({
      components: [{ type: 'Button', name: 'Button1', properties: { Text: 'Click Me' } }]
    }, mockPageApi);

    expect(result.success).toBe(true);
    expect(result.componentsAdded).toContain('Button1');
  });

  it('adds nested children', async () => {
    const result = await handle_add_components({
      components: [{
        type: 'VerticalArrangement',
        name: 'VA1',
        children: [
          { type: 'Button', name: 'Button1' },
          { type: 'Label', name: 'Label1' }
        ]
      }]
    }, mockPageApi);

    expect(result.success).toBe(true);
    expect(result.componentsAdded).toContain('VA1');
    expect(result.componentsAdded).toContain('Button1');
    expect(result.componentsAdded).toContain('Label1');
  });

  it('merges into existing tree', async () => {
    const existingWithButton = {
      authURL: ['ai2a.appinventor.mit.edu'],
      YaVersion: '233',
      Source: 'Form',
      Properties: {
        $Name: 'Screen1',
        $Type: 'Form',
        $Version: '31',
        Uuid: '0',
        $Components: [
          { $Name: 'Button1', $Type: 'Button', $Version: '7', Uuid: '1' }
        ]
      }
    };

    mockPageApi.call.mockImplementation((fn) => {
      if (fn === 'getComponentTree') return JSON.stringify(existingWithButton);
      if (fn === 'save2') return { success: true };
      if (fn === 'reload') return true;
      if (fn === 'HTML5DragDrop_getOpenProjectId') return '3766081';
      if (fn === 'getSessionParams') return {
        baseUrl: 'https://ai2a.appinventor.mit.edu/ode/',
        gwtPermutationHash: 'ABC123',
        sessionUuid: 'sess-uuid',
        filePath: 'src/appinventor/ai_test/App/Screen1.scm'
      };
      return null;
    });

    const result = await handle_add_components({
      components: [{ type: 'Label', name: 'Label1' }]
    }, mockPageApi);

    expect(result.success).toBe(true);
    expect(result.componentsAdded).toContain('Label1');
  });

  it('triggers save2 + reload', async () => {
    await handle_add_components({
      components: [{ type: 'Button', name: 'Button1' }]
    }, mockPageApi);

    expect(mockPageApi.call).toHaveBeenCalledWith('save2', expect.any(Object));
    expect(mockPageApi.call).toHaveBeenCalledWith('reload');
  });

  it('returns error on failure', async () => {
    mockPageApi.call.mockImplementation((fn) => {
      if (fn === 'getComponentTree') throw new Error('Not on page');
      return null;
    });

    const result = await handle_add_components({
      components: [{ type: 'Button', name: 'B1' }]
    }, mockPageApi);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
