import { describe, it, expect } from 'vitest';
import {
  extractPermutationHash,
  extractSessionUuid
} from '../../extension/lib/param-extractor.js';

describe('param-extractor', () => {
  describe('extractPermutationHash', () => {
    it('extracts hash from script tag src', () => {
      const html = '<script src="ode/0195E0E0D969E698C5729B8D61F5A680.cache.js"></script>';
      const hash = extractPermutationHash(html);
      expect(hash).toBe('0195E0E0D969E698C5729B8D61F5A680');
    });

    it('extracts hash from multiple script tags', () => {
      const html = `
        <script src="other.js"></script>
        <script src="ode/ABCDEF1234567890ABCDEF1234567890.cache.js"></script>
      `;
      const hash = extractPermutationHash(html);
      expect(hash).toBe('ABCDEF1234567890ABCDEF1234567890');
    });

    it('returns null when no cache.js found', () => {
      const html = '<script src="main.js"></script>';
      const hash = extractPermutationHash(html);
      expect(hash).toBeNull();
    });
  });

  describe('extractSessionUuid', () => {
    it('extracts UUID from intercepted XHR body', () => {
      const body = '7|0|10|https://ai2a.appinventor.mit.edu/ode/|HASH|com.google.appinventor.shared.rpc.project.ProjectService|save2|java.lang.String/2004016611|J|Z|d19dc537-2a11-423f-bb8c-e22abad36f71|filepath|content|1|2|3|4|5|5|6|5|7|5|8|ID|9|0|10|';
      const uuid = extractSessionUuid(body);
      expect(uuid).toBe('d19dc537-2a11-423f-bb8c-e22abad36f71');
    });

    it('returns null when no UUID pattern found', () => {
      const body = 'not a gwt-rpc body';
      const uuid = extractSessionUuid(body);
      expect(uuid).toBeNull();
    });
  });
});
