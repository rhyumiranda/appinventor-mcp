import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMessage, MCP_PROTOCOL_VERSION, TOOL_DEFINITIONS } from '../../extension/lib/mcp-handler.js';

describe('mcp-handler', () => {
  let mockToolExecutor;

  beforeEach(() => {
    mockToolExecutor = vi.fn().mockResolvedValue({ success: true });
  });

  describe('initialize', () => {
    it('returns protocol version and server info', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          clientInfo: { name: 'claude-code', version: '1.0.0' },
          capabilities: {}
        }
      };

      const response = await handleMessage(request, mockToolExecutor);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
      expect(response.result.serverInfo).toEqual({
        name: 'appinventor-mcp-bridge',
        version: '0.1.0'
      });
      expect(response.result.capabilities).toBeDefined();
      expect(response.result.capabilities.tools).toBeDefined();
    });

    it('includes resources capability', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 2,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          clientInfo: { name: 'test', version: '1.0.0' },
          capabilities: {}
        }
      };

      const response = await handleMessage(request, mockToolExecutor);
      expect(response.result.capabilities.resources).toBeDefined();
    });
  });

  describe('tools/list', () => {
    it('returns all 15 tool definitions', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/list',
        params: {}
      };

      const response = await handleMessage(request, mockToolExecutor);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(3);
      expect(response.result.tools).toHaveLength(15);
    });

    it('each tool has name, description, and inputSchema', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/list',
        params: {}
      };

      const response = await handleMessage(request, mockToolExecutor);

      for (const tool of response.result.tools) {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool.inputSchema.type).toBe('object');
      }
    });

    it('includes expected tool names', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/list',
        params: {}
      };

      const response = await handleMessage(request, mockToolExecutor);
      const toolNames = response.result.tools.map(t => t.name);

      expect(toolNames).toContain('get_project_info');
      expect(toolNames).toContain('get_component_tree');
      expect(toolNames).toContain('add_components');
      expect(toolNames).toContain('add_blocks');
      expect(toolNames).toContain('get_blocks');
      expect(toolNames).toContain('take_screenshot');
    });
  });

  describe('tools/call', () => {
    it('routes to correct tool handler', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'get_project_info',
          arguments: {}
        }
      };

      await handleMessage(request, mockToolExecutor);

      expect(mockToolExecutor).toHaveBeenCalledWith('get_project_info', {});
    });

    it('returns tool result as content', async () => {
      mockToolExecutor.mockResolvedValue({
        success: true,
        projectId: '123',
        projectName: 'TestApp'
      });

      const request = {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'get_project_info',
          arguments: {}
        }
      };

      const response = await handleMessage(request, mockToolExecutor);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(7);
      expect(response.result.content).toBeDefined();
      expect(response.result.content[0].type).toBe('text');
      const parsed = JSON.parse(response.result.content[0].text);
      expect(parsed.projectId).toBe('123');
    });

    it('passes arguments to tool executor', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'add_components',
          arguments: {
            screenName: 'Screen1',
            components: [{ type: 'Button', name: 'Button1' }]
          }
        }
      };

      await handleMessage(request, mockToolExecutor);

      expect(mockToolExecutor).toHaveBeenCalledWith('add_components', {
        screenName: 'Screen1',
        components: [{ type: 'Button', name: 'Button1' }]
      });
    });

    it('handles tool executor error as error content', async () => {
      mockToolExecutor.mockResolvedValue({
        success: false,
        error: 'Component not found'
      });

      const request = {
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: {
          name: 'get_component_tree',
          arguments: {}
        }
      };

      const response = await handleMessage(request, mockToolExecutor);

      expect(response.result.isError).toBe(true);
      expect(response.result.content[0].type).toBe('text');
      const parsed = JSON.parse(response.result.content[0].text);
      expect(parsed.error).toBe('Component not found');
    });
  });

  describe('error responses', () => {
    it('returns error for unknown method', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 10,
        method: 'unknown/method',
        params: {}
      };

      const response = await handleMessage(request, mockToolExecutor);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(10);
      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32601); // Method not found
    });

    it('returns error for unknown tool name', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'nonexistent_tool',
          arguments: {}
        }
      };

      const response = await handleMessage(request, mockToolExecutor);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32602); // Invalid params
    });

    it('returns error for missing tool name in tools/call', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 12,
        method: 'tools/call',
        params: {}
      };

      const response = await handleMessage(request, mockToolExecutor);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32602);
    });

    it('returns error for invalid JSON-RPC (missing jsonrpc field)', async () => {
      const request = {
        id: 13,
        method: 'initialize',
        params: {}
      };

      const response = await handleMessage(request, mockToolExecutor);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32600); // Invalid Request
    });

    it('returns error for missing method field', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 14,
        params: {}
      };

      const response = await handleMessage(request, mockToolExecutor);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32600);
    });
  });
});
