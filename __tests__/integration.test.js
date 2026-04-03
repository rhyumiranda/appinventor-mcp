import { describe, it, expect, vi } from 'vitest';
import { handleMessage } from '../extension/lib/mcp-handler.js';
import { handle_get_project_info, handle_get_component_tree, handle_add_components } from '../extension/lib/tool-handlers.js';

describe('Phase 1 Integration', () => {
  const mockPageApi = {
    call: vi.fn()
  };

  function createToolExecutor(pageApi) {
    return async (toolName, args) => {
      switch (toolName) {
        case 'get_project_info': return handle_get_project_info(args, pageApi);
        case 'get_component_tree': return handle_get_component_tree(args, pageApi);
        case 'add_components': return handle_add_components(args, pageApi);
        default: return { success: false, error: `Unknown tool: ${toolName}` };
      }
    };
  }

  it('MCP request -> tool handler -> response', async () => {
    mockPageApi.call.mockImplementation((fn) => {
      if (fn === 'HTML5DragDrop_getOpenProjectId') return '123';
      if (fn === 'BlocklyPanel_getProjectName') return 'TestApp';
      if (fn === 'isEditorOpen') return true;
      if (fn === 'isBlocksEditorOpen') return false;
      if (fn === 'BlocklyPanel_getCurrentScreen') return 'Screen1';
      return null;
    });

    const response = await handleMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'get_project_info', arguments: {} }
    }, createToolExecutor(mockPageApi));

    expect(response.result.content[0].type).toBe('text');
    const data = JSON.parse(response.result.content[0].text);
    expect(data.projectId).toBe('123');
  });

  it('add_components end-to-end (mock page APIs)', async () => {
    const scm = {
      authURL: ['ai2a.appinventor.mit.edu'],
      YaVersion: '233',
      Source: 'Form',
      Properties: {
        $Name: 'Screen1', $Type: 'Form', $Version: '31', Uuid: '0',
        $Components: []
      }
    };

    mockPageApi.call.mockImplementation((fn) => {
      if (fn === 'getComponentTree') return JSON.stringify(scm);
      if (fn === 'save2') return { success: true };
      if (fn === 'reload') return true;
      if (fn === 'HTML5DragDrop_getOpenProjectId') return '123';
      if (fn === 'getSessionParams') return {
        baseUrl: 'https://ai2a.appinventor.mit.edu/ode/',
        gwtPermutationHash: 'HASH', sessionUuid: 'UUID',
        filePath: 'src/Screen1.scm'
      };
      return null;
    });

    const response = await handleMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'add_components',
        arguments: {
          components: [{ type: 'Button', name: 'Button1', properties: { Text: 'Go' } }]
        }
      }
    }, createToolExecutor(mockPageApi));

    const data = JSON.parse(response.result.content[0].text);
    expect(data.success).toBe(true);
    expect(data.componentsAdded).toContain('Button1');
  });

  it('get_component_tree after add_components returns updated tree', async () => {
    let currentScm = {
      authURL: ['ai2a.appinventor.mit.edu'],
      YaVersion: '233',
      Source: 'Form',
      Properties: {
        $Name: 'Screen1', $Type: 'Form', $Version: '31', Uuid: '0',
        $Components: []
      }
    };

    mockPageApi.call.mockImplementation((fn, args) => {
      if (fn === 'getComponentTree') return JSON.stringify(currentScm);
      if (fn === 'save2') {
        // Simulate save2 updating the SCM
        currentScm = args.scm;
        return { success: true };
      }
      if (fn === 'reload') return true;
      if (fn === 'HTML5DragDrop_getOpenProjectId') return '123';
      if (fn === 'getSessionParams') return {
        baseUrl: 'https://ai2a.appinventor.mit.edu/ode/',
        gwtPermutationHash: 'H', sessionUuid: 'U',
        filePath: 'src/Screen1.scm'
      };
      return null;
    });

    const executor = createToolExecutor(mockPageApi);

    // Add a component
    await handleMessage({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: {
        name: 'add_components',
        arguments: { components: [{ type: 'Label', name: 'Label1', properties: { Text: 'Hi' } }] }
      }
    }, executor);

    // Read tree — should now contain Label1
    const treeResponse = await handleMessage({
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'get_component_tree', arguments: {} }
    }, executor);

    const treeData = JSON.parse(treeResponse.result.content[0].text);
    expect(treeData.success).toBe(true);
    const componentNames = treeData.scm.Properties.$Components.map(c => c.$Name);
    expect(componentNames).toContain('Label1');
  });
});
