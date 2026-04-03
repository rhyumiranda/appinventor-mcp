import { describe, it, expect, vi } from 'vitest';
import { handleMessage } from '../../extension/lib/mcp-handler.js';

describe('MCP resources', () => {
  const mockToolExecutor = vi.fn();

  describe('resources/list', () => {
    it('returns all 6 resource URIs', async () => {
      const response = await handleMessage({
        jsonrpc: '2.0', id: 1, method: 'resources/list', params: {}
      }, mockToolExecutor);

      expect(response.result.resources).toHaveLength(6);
      const uris = response.result.resources.map(r => r.uri);
      expect(uris).toContain('appinventor://component-catalog');
      expect(uris).toContain('appinventor://block-types');
      expect(uris).toContain('appinventor://scm-format');
      expect(uris).toContain('appinventor://bky-format');
      expect(uris).toContain('appinventor://current-project');
      expect(uris).toContain('appinventor://agent-guide');
    });

    it('each resource has uri, name, and description', async () => {
      const response = await handleMessage({
        jsonrpc: '2.0', id: 2, method: 'resources/list', params: {}
      }, mockToolExecutor);

      for (const resource of response.result.resources) {
        expect(resource).toHaveProperty('uri');
        expect(resource).toHaveProperty('name');
        expect(resource).toHaveProperty('description');
      }
    });
  });

  describe('resources/read', () => {
    it('returns content for component-catalog', async () => {
      const response = await handleMessage({
        jsonrpc: '2.0', id: 3, method: 'resources/read',
        params: { uri: 'appinventor://component-catalog' }
      }, mockToolExecutor);

      expect(response.result.contents).toBeDefined();
      expect(response.result.contents[0].uri).toBe('appinventor://component-catalog');
      expect(response.result.contents[0].text).toBeDefined();
    });

    it('returns content for block-types', async () => {
      const response = await handleMessage({
        jsonrpc: '2.0', id: 4, method: 'resources/read',
        params: { uri: 'appinventor://block-types' }
      }, mockToolExecutor);

      expect(response.result.contents[0].text).toBeDefined();
    });

    it('returns content for scm-format', async () => {
      const response = await handleMessage({
        jsonrpc: '2.0', id: 5, method: 'resources/read',
        params: { uri: 'appinventor://scm-format' }
      }, mockToolExecutor);

      expect(response.result.contents[0].text).toContain('SCM');
    });

    it('returns content for bky-format', async () => {
      const response = await handleMessage({
        jsonrpc: '2.0', id: 6, method: 'resources/read',
        params: { uri: 'appinventor://bky-format' }
      }, mockToolExecutor);

      expect(response.result.contents[0].text).toContain('BKY');
    });

    it('returns content for current-project', async () => {
      const response = await handleMessage({
        jsonrpc: '2.0', id: 7, method: 'resources/read',
        params: { uri: 'appinventor://current-project' }
      }, mockToolExecutor);

      expect(response.result.contents[0].text).toBeDefined();
    });

    it('returns content for agent-guide', async () => {
      const response = await handleMessage({
        jsonrpc: '2.0', id: 8, method: 'resources/read',
        params: { uri: 'appinventor://agent-guide' }
      }, mockToolExecutor);

      expect(response.result.contents[0].text).toBeDefined();
    });

    it('returns error for unknown resource URI', async () => {
      const response = await handleMessage({
        jsonrpc: '2.0', id: 9, method: 'resources/read',
        params: { uri: 'appinventor://nonexistent' }
      }, mockToolExecutor);

      expect(response.error).toBeDefined();
    });
  });
});
