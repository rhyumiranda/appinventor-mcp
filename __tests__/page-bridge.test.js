import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createBridgeMessage,
  parseBridgeMessage,
  isValidBridgeMessage,
  BRIDGE_PREFIX,
  generateRequestId
} from '../extension/lib/bridge-protocol.js';

describe('bridge-protocol (content <-> page)', () => {
  describe('BRIDGE_PREFIX', () => {
    it('uses appinventor-mcp- prefix', () => {
      expect(BRIDGE_PREFIX).toBe('appinventor-mcp-');
    });
  });

  describe('createBridgeMessage', () => {
    it('creates a message with the bridge prefix type', () => {
      const msg = createBridgeMessage('request', { tool: 'get_project_info', params: {} });

      expect(msg.type).toBe('appinventor-mcp-request');
      expect(msg.payload.tool).toBe('get_project_info');
    });

    it('includes a requestId', () => {
      const msg = createBridgeMessage('request', { tool: 'test' });
      expect(msg.requestId).toBeDefined();
      expect(typeof msg.requestId).toBe('string');
    });

    it('uses provided requestId if given', () => {
      const msg = createBridgeMessage('response', { data: 'ok' }, 'custom-id');
      expect(msg.requestId).toBe('custom-id');
    });
  });

  describe('parseBridgeMessage', () => {
    it('parses a valid bridge message', () => {
      const raw = {
        type: 'appinventor-mcp-response',
        requestId: 'r1',
        payload: { success: true }
      };

      const parsed = parseBridgeMessage(raw);
      expect(parsed.direction).toBe('response');
      expect(parsed.payload.success).toBe(true);
      expect(parsed.requestId).toBe('r1');
    });

    it('returns null for non-bridge messages', () => {
      const raw = { type: 'some-other-message', data: {} };
      expect(parseBridgeMessage(raw)).toBeNull();
    });

    it('returns null for messages without type', () => {
      expect(parseBridgeMessage({ data: 'test' })).toBeNull();
    });
  });

  describe('isValidBridgeMessage', () => {
    it('validates messages with correct prefix', () => {
      expect(isValidBridgeMessage({ type: 'appinventor-mcp-request' })).toBe(true);
      expect(isValidBridgeMessage({ type: 'appinventor-mcp-response' })).toBe(true);
    });

    it('rejects messages without prefix', () => {
      expect(isValidBridgeMessage({ type: 'other-message' })).toBe(false);
    });

    it('rejects null/undefined', () => {
      expect(isValidBridgeMessage(null)).toBe(false);
      expect(isValidBridgeMessage(undefined)).toBe(false);
    });
  });

  describe('generateRequestId', () => {
    it('generates unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateRequestId()));
      expect(ids.size).toBe(100);
    });
  });
});
