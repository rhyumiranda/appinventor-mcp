import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectSessionExpiry,
  detectNotOnPage,
  createErrorResponse
} from '../../extension/lib/error-handler.js';

describe('error-handler', () => {
  describe('detectSessionExpiry', () => {
    it('detects 401 as session_expired', () => {
      const result = detectSessionExpiry({ status: 401 });
      expect(result).toBe(true);
    });

    it('detects 403 as session_expired', () => {
      const result = detectSessionExpiry({ status: 403 });
      expect(result).toBe(true);
    });

    it('returns false for 200', () => {
      const result = detectSessionExpiry({ status: 200 });
      expect(result).toBe(false);
    });

    it('returns false for null', () => {
      const result = detectSessionExpiry(null);
      expect(result).toBe(false);
    });
  });

  describe('detectNotOnPage', () => {
    it('detects missing App Inventor globals', () => {
      const result = detectNotOnPage({ hasBlocklyPanel: false, hasBlockly: false });
      expect(result).toBe(true);
    });

    it('returns false when globals present', () => {
      const result = detectNotOnPage({ hasBlocklyPanel: true, hasBlockly: true });
      expect(result).toBe(false);
    });
  });

  describe('createErrorResponse', () => {
    it('creates structured error with success false', () => {
      const err = createErrorResponse('session_expired', 'Login required');
      expect(err.success).toBe(false);
      expect(err.error).toBe('Login required');
      expect(err.code).toBe('session_expired');
    });

    it('creates error from Error object', () => {
      const err = createErrorResponse('internal_error', new Error('something broke'));
      expect(err.success).toBe(false);
      expect(err.error).toBe('something broke');
      expect(err.code).toBe('internal_error');
    });
  });
});
