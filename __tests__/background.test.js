import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleNativeMessage,
  handleContentResponse,
  getActiveTabId,
  setActiveTabId
} from '../extension/lib/message-router.js';

describe('message-router (background)', () => {
  let mockChrome;

  beforeEach(() => {
    mockChrome = {
      tabs: {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
        query: vi.fn().mockResolvedValue([{ id: 42, url: 'https://ai2a.appinventor.mit.edu/ya/editapp' }])
      },
      runtime: {
        lastError: null
      }
    };
  });

  describe('handleNativeMessage', () => {
    it('routes native host message to content script via tabs.sendMessage', async () => {
      setActiveTabId(42);
      const message = { type: 'MCP_TOOL_CALL', tool: 'get_project_info', params: {}, requestId: 'r1' };

      const sendFn = vi.fn().mockResolvedValue({ success: true, projectId: '123' });
      const result = await handleNativeMessage(message, sendFn);

      expect(sendFn).toHaveBeenCalledWith(42, message);
    });

    it('returns error when no active tab is set', async () => {
      setActiveTabId(null);
      const message = { type: 'MCP_TOOL_CALL', tool: 'get_project_info', params: {}, requestId: 'r2' };

      const sendFn = vi.fn();
      const result = await handleNativeMessage(message, sendFn);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No App Inventor tab');
    });

    it('returns the content script response', async () => {
      setActiveTabId(42);
      const message = { type: 'MCP_TOOL_CALL', tool: 'get_project_info', params: {}, requestId: 'r3' };

      const sendFn = vi.fn().mockResolvedValue({ success: true, projectName: 'MyApp' });
      const result = await handleNativeMessage(message, sendFn);

      expect(result.success).toBe(true);
      expect(result.projectName).toBe('MyApp');
    });
  });

  describe('handleContentResponse', () => {
    it('passes response back from content script', () => {
      const response = { success: true, data: 'test' };
      const result = handleContentResponse(response);

      expect(result).toEqual(response);
    });
  });

  describe('activeTabId management', () => {
    it('stores and retrieves active tab ID', () => {
      setActiveTabId(99);
      expect(getActiveTabId()).toBe(99);
    });

    it('defaults to null', () => {
      setActiveTabId(null);
      expect(getActiveTabId()).toBeNull();
    });
  });
});
