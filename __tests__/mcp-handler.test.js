import { describe, it, expect, vi } from 'vitest';
import { handleMessage, TOOL_DEFINITIONS, MCP_PROTOCOL_VERSION } from '../extension/lib/mcp-handler.js';

// --- Helpers ---
function makeRequest(method, params = {}, id = 1) {
  return { jsonrpc: '2.0', method, params, id };
}

function mockToolExecutor(result = { success: true }) {
  return vi.fn().mockResolvedValue(result);
}

// --- Tests ---

describe('MCP Protocol', () => {
  describe('Request Validation', () => {
    it('rejects requests without jsonrpc version', async () => {
      const res = await handleMessage({ method: 'initialize', id: 1 }, mockToolExecutor());
      expect(res.error).toBeDefined();
      expect(res.error.code).toBe(-32600);
      expect(res.error.message).toContain('missing or wrong jsonrpc version');
    });

    it('rejects requests with wrong jsonrpc version', async () => {
      const res = await handleMessage({ jsonrpc: '1.0', method: 'initialize', id: 1 }, mockToolExecutor());
      expect(res.error.code).toBe(-32600);
    });

    it('rejects requests without method', async () => {
      const res = await handleMessage({ jsonrpc: '2.0', id: 1 }, mockToolExecutor());
      expect(res.error.code).toBe(-32600);
      expect(res.error.message).toContain('missing method');
    });
  });

  describe('initialize', () => {
    it('returns protocol version and server info', async () => {
      const res = await handleMessage(makeRequest('initialize'), mockToolExecutor());
      expect(res.jsonrpc).toBe('2.0');
      expect(res.id).toBe(1);
      expect(res.result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
      expect(res.result.serverInfo.name).toBe('appinventor-mcp-bridge');
      expect(res.result.serverInfo.version).toBe('0.1.0');
    });

    it('declares tools and resources capabilities', async () => {
      const res = await handleMessage(makeRequest('initialize'), mockToolExecutor());
      expect(res.result.capabilities).toHaveProperty('tools');
      expect(res.result.capabilities).toHaveProperty('resources');
    });
  });

  describe('tools/list', () => {
    it('returns all tool definitions', async () => {
      const res = await handleMessage(makeRequest('tools/list'), mockToolExecutor());
      expect(res.result.tools).toBe(TOOL_DEFINITIONS);
      expect(res.result.tools.length).toBeGreaterThan(10);
    });

    it('every tool has name, description, and inputSchema', () => {
      for (const tool of TOOL_DEFINITIONS) {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });
  });

  describe('resources/list', () => {
    it('returns resource list with uri, name, description', async () => {
      const res = await handleMessage(makeRequest('resources/list'), mockToolExecutor());
      const resources = res.result.resources;
      expect(resources.length).toBeGreaterThan(0);
      for (const r of resources) {
        expect(r).toHaveProperty('uri');
        expect(r).toHaveProperty('name');
        expect(r).toHaveProperty('description');
        // Should NOT expose content in list
        expect(r).not.toHaveProperty('content');
      }
    });
  });

  describe('resources/read', () => {
    it('reads a known resource', async () => {
      const res = await handleMessage(
        makeRequest('resources/read', { uri: 'appinventor://scm-format' }),
        mockToolExecutor()
      );
      expect(res.result.contents).toHaveLength(1);
      expect(res.result.contents[0].uri).toBe('appinventor://scm-format');
      expect(res.result.contents[0].mimeType).toBe('text/plain');
      expect(res.result.contents[0].text).toContain('SCM Format');
    });

    it('returns error for unknown resource', async () => {
      const res = await handleMessage(
        makeRequest('resources/read', { uri: 'appinventor://nonexistent' }),
        mockToolExecutor()
      );
      expect(res.error).toBeDefined();
      expect(res.error.code).toBe(-32602);
    });

    it('can read all defined resources', async () => {
      const listRes = await handleMessage(makeRequest('resources/list'), mockToolExecutor());
      for (const r of listRes.result.resources) {
        const readRes = await handleMessage(
          makeRequest('resources/read', { uri: r.uri }),
          mockToolExecutor()
        );
        expect(readRes.result.contents[0].text).toBeDefined();
      }
    });
  });

  describe('tools/call', () => {
    it('calls tool executor with correct name and args', async () => {
      const executor = mockToolExecutor({ success: true, projectId: '123' });
      await handleMessage(
        makeRequest('tools/call', { name: 'get_project_info', arguments: {} }),
        executor
      );
      expect(executor).toHaveBeenCalledWith('get_project_info', {});
    });

    it('passes arguments to tool executor', async () => {
      const executor = mockToolExecutor({ success: true });
      await handleMessage(
        makeRequest('tools/call', {
          name: 'add_components',
          arguments: { screenName: 'Screen1', components: [{ type: 'Button', name: 'btn1' }] }
        }),
        executor
      );
      expect(executor).toHaveBeenCalledWith('add_components', {
        screenName: 'Screen1',
        components: [{ type: 'Button', name: 'btn1' }]
      });
    });

    it('returns success result as content', async () => {
      const executor = mockToolExecutor({ success: true, data: 'hello' });
      const res = await handleMessage(
        makeRequest('tools/call', { name: 'get_project_info', arguments: {} }),
        executor
      );
      expect(res.result.content[0].type).toBe('text');
      const parsed = JSON.parse(res.result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toBe('hello');
    });

    it('returns error result with isError flag', async () => {
      const executor = mockToolExecutor({ success: false, error: 'something broke' });
      const res = await handleMessage(
        makeRequest('tools/call', { name: 'get_project_info', arguments: {} }),
        executor
      );
      expect(res.result.isError).toBe(true);
      const parsed = JSON.parse(res.result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('something broke');
    });

    it('rejects unknown tool name', async () => {
      const executor = mockToolExecutor();
      const res = await handleMessage(
        makeRequest('tools/call', { name: 'nonexistent_tool', arguments: {} }),
        executor
      );
      expect(res.error).toBeDefined();
      expect(res.error.code).toBe(-32602);
      expect(res.error.message).toContain('unknown tool');
      expect(executor).not.toHaveBeenCalled();
    });

    it('rejects missing tool name', async () => {
      const executor = mockToolExecutor();
      const res = await handleMessage(
        makeRequest('tools/call', { arguments: {} }),
        executor
      );
      expect(res.error).toBeDefined();
      expect(res.error.code).toBe(-32602);
      expect(res.error.message).toContain('missing tool name');
    });

    it('defaults arguments to empty object', async () => {
      const executor = mockToolExecutor({ success: true });
      await handleMessage(
        makeRequest('tools/call', { name: 'get_project_info' }),
        executor
      );
      expect(executor).toHaveBeenCalledWith('get_project_info', {});
    });
  });

  describe('Unknown method', () => {
    it('returns method not found error', async () => {
      const res = await handleMessage(makeRequest('unknown/method'), mockToolExecutor());
      expect(res.error).toBeDefined();
      expect(res.error.code).toBe(-32601);
      expect(res.error.message).toContain('Method not found');
    });
  });

  describe('Response format', () => {
    it('always includes jsonrpc and id in responses', async () => {
      const res = await handleMessage(makeRequest('initialize', {}, 42), mockToolExecutor());
      expect(res.jsonrpc).toBe('2.0');
      expect(res.id).toBe(42);
    });

    it('uses null id for error responses without id', async () => {
      const res = await handleMessage({ jsonrpc: '1.0', method: 'test' }, mockToolExecutor());
      expect(res.id).toBeNull();
    });
  });
});

describe('Tool Definitions', () => {
  const toolNames = TOOL_DEFINITIONS.map(t => t.name);

  it('includes all expected tools', () => {
    const expected = [
      'get_project_info', 'get_component_tree', 'get_component_schema',
      'get_all_component_types', 'get_blocks', 'get_block_diagnostics',
      'search_components', 'add_components', 'update_component_properties',
      'remove_components', 'add_blocks', 'clear_blocks', 'modify_block',
      'take_screenshot', 'reload_designer'
    ];
    for (const name of expected) {
      expect(toolNames).toContain(name);
    }
  });

  it('add_components has replaceAll parameter', () => {
    const addComp = TOOL_DEFINITIONS.find(t => t.name === 'add_components');
    expect(addComp.inputSchema.properties.replaceAll).toBeDefined();
    expect(addComp.inputSchema.properties.replaceAll.type).toBe('boolean');
  });

  it('add_components requires components array', () => {
    const addComp = TOOL_DEFINITIONS.find(t => t.name === 'add_components');
    expect(addComp.inputSchema.required).toContain('components');
  });

  it('update_component_properties requires componentName and properties', () => {
    const tool = TOOL_DEFINITIONS.find(t => t.name === 'update_component_properties');
    expect(tool.inputSchema.required).toContain('componentName');
    expect(tool.inputSchema.required).toContain('properties');
  });

  it('remove_components requires componentNames', () => {
    const tool = TOOL_DEFINITIONS.find(t => t.name === 'remove_components');
    expect(tool.inputSchema.required).toContain('componentNames');
  });

  it('modify_block requires blockId, fieldName, newValue', () => {
    const tool = TOOL_DEFINITIONS.find(t => t.name === 'modify_block');
    expect(tool.inputSchema.required).toEqual(['blockId', 'fieldName', 'newValue']);
  });

  it('no duplicate tool names', () => {
    const unique = new Set(toolNames);
    expect(unique.size).toBe(toolNames.length);
  });
});
