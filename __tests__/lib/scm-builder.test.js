import { describe, it, expect } from 'vitest';
import {
  buildScmTree,
  mergeComponents,
  wrapScmContent,
  getMaxUuid,
  assignUuids
} from '../../extension/lib/scm-builder.js';

describe('scm-builder', () => {
  describe('buildScmTree', () => {
    it('builds a minimal SCM tree with Form and one Button', () => {
      const tree = buildScmTree('Screen1', 'MyApp', [
        { type: 'Button', name: 'Button1', properties: { Text: 'Click Me' } }
      ]);

      expect(tree.Source).toBe('Form');
      expect(tree.Properties.$Name).toBe('Screen1');
      expect(tree.Properties.$Type).toBe('Form');
      expect(tree.Properties.Uuid).toBe('0');
      expect(tree.Properties.$Components).toHaveLength(1);
      expect(tree.Properties.$Components[0].$Name).toBe('Button1');
      expect(tree.Properties.$Components[0].$Type).toBe('Button');
      expect(tree.Properties.$Components[0].Text).toBe('Click Me');
    });

    it('builds nested components (Button inside VerticalArrangement inside Form)', () => {
      const tree = buildScmTree('Screen1', 'MyApp', [
        {
          type: 'VerticalArrangement',
          name: 'VA1',
          children: [
            { type: 'Button', name: 'Button1', properties: { Text: 'Nested' } }
          ]
        }
      ]);

      const va = tree.Properties.$Components[0];
      expect(va.$Type).toBe('VerticalArrangement');
      expect(va.$Components).toHaveLength(1);
      expect(va.$Components[0].$Name).toBe('Button1');
      expect(va.$Components[0].Text).toBe('Nested');
    });

    it('includes YaVersion and authURL', () => {
      const tree = buildScmTree('Screen1', 'App', []);
      expect(tree.YaVersion).toBeDefined();
      expect(tree.authURL).toBeDefined();
    });

    it('sets AppName on the Form', () => {
      const tree = buildScmTree('Screen1', 'TestApp', []);
      expect(tree.Properties.AppName).toBe('TestApp');
    });
  });

  describe('UUID auto-assignment', () => {
    it('assigns incrementing UUIDs starting from 1 for new trees', () => {
      const tree = buildScmTree('Screen1', 'App', [
        { type: 'Button', name: 'B1' },
        { type: 'Label', name: 'L1' }
      ]);

      const uuids = tree.Properties.$Components.map(c => c.Uuid);
      expect(parseInt(uuids[0])).toBeGreaterThan(0);
      expect(parseInt(uuids[1])).toBeGreaterThan(parseInt(uuids[0]));
    });

    it('assigns UUIDs to nested children', () => {
      const tree = buildScmTree('Screen1', 'App', [
        {
          type: 'VerticalArrangement',
          name: 'VA1',
          children: [
            { type: 'Button', name: 'B1' },
            { type: 'Label', name: 'L1' }
          ]
        }
      ]);

      const va = tree.Properties.$Components[0];
      expect(va.Uuid).toBeDefined();
      expect(va.$Components[0].Uuid).toBeDefined();
      expect(va.$Components[1].Uuid).toBeDefined();

      // All UUIDs unique
      const allUuids = [va.Uuid, va.$Components[0].Uuid, va.$Components[1].Uuid];
      expect(new Set(allUuids).size).toBe(3);
    });
  });

  describe('getMaxUuid', () => {
    it('returns 0 for Form-only tree', () => {
      const tree = {
        Properties: { Uuid: '0', $Components: [] }
      };
      expect(getMaxUuid(tree.Properties)).toBe(0);
    });

    it('finds max UUID in flat tree', () => {
      const tree = {
        Properties: {
          Uuid: '0',
          $Components: [
            { Uuid: '5' },
            { Uuid: '10' },
            { Uuid: '3' }
          ]
        }
      };
      expect(getMaxUuid(tree.Properties)).toBe(10);
    });

    it('finds max UUID in nested tree', () => {
      const tree = {
        Properties: {
          Uuid: '0',
          $Components: [
            {
              Uuid: '5',
              $Components: [
                { Uuid: '42' }
              ]
            }
          ]
        }
      };
      expect(getMaxUuid(tree.Properties)).toBe(42);
    });
  });

  describe('mergeComponents', () => {
    it('merges new components into existing SCM tree', () => {
      const existing = {
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

      const newComponents = [
        { type: 'Label', name: 'Label1', properties: { Text: 'Hello' } }
      ];

      const merged = mergeComponents(existing, newComponents);

      expect(merged.Properties.$Components).toHaveLength(2);
      expect(merged.Properties.$Components[1].$Name).toBe('Label1');
      expect(parseInt(merged.Properties.$Components[1].Uuid)).toBeGreaterThan(1);
    });

    it('preserves existing components during merge', () => {
      const existing = {
        authURL: ['ai2a.appinventor.mit.edu'],
        YaVersion: '233',
        Source: 'Form',
        Properties: {
          $Name: 'Screen1',
          $Type: 'Form',
          $Version: '31',
          Uuid: '0',
          $Components: [
            { $Name: 'Button1', $Type: 'Button', $Version: '7', Text: 'Original', Uuid: '5' }
          ]
        }
      };

      const merged = mergeComponents(existing, [
        { type: 'Label', name: 'Label1' }
      ]);

      expect(merged.Properties.$Components[0].Text).toBe('Original');
      expect(merged.Properties.$Components[0].Uuid).toBe('5');
    });
  });

  describe('wrapScmContent', () => {
    it('wraps JSON in SCM content format', () => {
      const scm = { Source: 'Form', Properties: { $Name: 'Screen1' } };
      const wrapped = wrapScmContent(scm);

      expect(wrapped).toMatch(/^#\\\!\n\$JSON\n/);
      expect(wrapped).toMatch(/\n\\!#$/);
    });

    it('contains valid JSON between delimiters', () => {
      const scm = { test: 'value' };
      const wrapped = wrapScmContent(scm);

      const lines = wrapped.split('\n');
      // lines[0] = '#\!', lines[1] = '$JSON', lines[2] = json, lines[3] = '\!#'
      const json = lines[2];
      expect(JSON.parse(json)).toEqual(scm);
    });
  });
});
