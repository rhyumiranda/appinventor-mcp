import { describe, it, expect } from 'vitest';
import { buildSave2Request, projectIdToBase36 } from '../../extension/lib/gwt-rpc.js';

describe('gwt-rpc', () => {
  describe('projectIdToBase36', () => {
    it('converts project ID to uppercase base36', () => {
      expect(projectIdToBase36('3766081')).toMatch(/^[0-9A-Z]+$/);
    });

    it('converts numeric string correctly', () => {
      // 3766081 in base36
      const result = projectIdToBase36('3766081');
      expect(parseInt(result, 36)).toBe(3766081);
    });

    it('returns uppercase', () => {
      const result = projectIdToBase36('100');
      expect(result).toBe(result.toUpperCase());
    });
  });

  describe('buildSave2Request', () => {
    const params = {
      baseUrl: 'https://ai2a.appinventor.mit.edu/ode/',
      gwtPermutationHash: '0195E0E0D969E698C5729B8D61F5A680',
      sessionUuid: 'd19dc537-2a11-423f-bb8c-e22abad36f71',
      filePath: 'src/appinventor/ai_test/MyApp/Screen1.scm',
      scmContent: '#\\!\n$JSON\n{"test":"value"}\n\\!#',
      projectId: '3766081'
    };

    it('builds a pipe-delimited RPC body', () => {
      const body = buildSave2Request(params);
      expect(body).toContain('|');
      expect(body.startsWith('7|0|10|')).toBe(true);
    });

    it('includes the GWT service class', () => {
      const body = buildSave2Request(params);
      expect(body).toContain('com.google.appinventor.shared.rpc.project.ProjectService');
    });

    it('includes save2 method name', () => {
      const body = buildSave2Request(params);
      expect(body).toContain('|save2|');
    });

    it('includes the permutation hash', () => {
      const body = buildSave2Request(params);
      expect(body).toContain(params.gwtPermutationHash);
    });

    it('includes the session UUID', () => {
      const body = buildSave2Request(params);
      expect(body).toContain(params.sessionUuid);
    });

    it('includes the file path', () => {
      const body = buildSave2Request(params);
      expect(body).toContain(params.filePath);
    });

    it('includes the SCM content', () => {
      const body = buildSave2Request(params);
      expect(body).toContain(params.scmContent);
    });

    it('includes base36 project ID', () => {
      const body = buildSave2Request(params);
      const base36 = projectIdToBase36(params.projectId);
      expect(body).toContain(base36);
    });

    it('ends with the correct static suffix', () => {
      const body = buildSave2Request(params);
      expect(body).toMatch(/\|9\|0\|10\|$/);
    });
  });
});
