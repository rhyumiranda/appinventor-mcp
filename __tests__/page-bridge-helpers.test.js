import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// page-bridge.js is an IIFE — extract pure functions for testing
// We eval the helpers in isolation
const pageBridgeSrc = readFileSync(resolve(import.meta.dirname, '../extension/page-bridge.js'), 'utf-8');

// Extract and eval individual helper functions from the IIFE
function extractFunction(src, name) {
  // Match function declarations like: function name(...) { ... }
  const regex = new RegExp(`function ${name}\\b[^]*?\\n  \\}`, 'm');
  const match = src.match(regex);
  if (!match) throw new Error(`Could not extract function: ${name}`);
  return match[0];
}

// Build a mini module with the helpers we want to test
const helperCode = `
  const COMPONENT_VERSIONS = {
    Form: '31', Button: '7', Label: '5', TextBox: '6',
    VerticalArrangement: '4', HorizontalArrangement: '4',
    Map: '7', Marker: '4', LocationSensor: '4', CloudDB: '2', Clock: '4',
    Notifier: '6', Image: '5'
  };

  ${extractFunction(pageBridgeSrc, 'buildComponentNodes')}
  ${extractFunction(pageBridgeSrc, 'countComponents')}
  ${extractFunction(pageBridgeSrc, 'collectNames')}
  ${extractFunction(pageBridgeSrc, 'getMaxUuid')}
  ${extractFunction(pageBridgeSrc, 'findComponentInTree')}
  ${extractFunction(pageBridgeSrc, 'removeComponentsFromTree')}
  ${extractFunction(pageBridgeSrc, 'escapeXml')}
  ${extractFunction(pageBridgeSrc, 'structuredToXml')}
`;

// Create a function scope to eval the helpers
const helpers = new Function(helperCode + `
  return {
    buildComponentNodes,
    countComponents,
    collectNames,
    getMaxUuid,
    findComponentInTree,
    removeComponentsFromTree,
    escapeXml,
    structuredToXml
  };
`)();

// --- Tests ---

describe('buildComponentNodes', () => {
  it('builds a simple component', () => {
    const nodes = helpers.buildComponentNodes([
      { type: 'Button', name: 'btn1', properties: { Text: 'Click me' } }
    ], 1);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].$Name).toBe('btn1');
    expect(nodes[0].$Type).toBe('Button');
    expect(nodes[0].$Version).toBe('7');
    expect(nodes[0].Uuid).toBe('1');
    expect(nodes[0].Text).toBe('Click me');
  });

  it('builds multiple components with incrementing UUIDs', () => {
    const nodes = helpers.buildComponentNodes([
      { type: 'Button', name: 'btn1' },
      { type: 'Label', name: 'lbl1' }
    ], 10);
    expect(nodes[0].Uuid).toBe('10');
    expect(nodes[1].Uuid).toBe('11');
  });

  it('builds nested components (children)', () => {
    const nodes = helpers.buildComponentNodes([
      {
        type: 'VerticalArrangement', name: 'va1',
        children: [
          { type: 'Button', name: 'btn1' },
          { type: 'Label', name: 'lbl1' }
        ]
      }
    ], 1);
    expect(nodes[0].$Components).toHaveLength(2);
    expect(nodes[0].$Components[0].$Name).toBe('btn1');
    expect(nodes[0].$Components[1].$Name).toBe('lbl1');
  });

  it('converts property values to strings', () => {
    const nodes = helpers.buildComponentNodes([
      { type: 'Button', name: 'btn1', properties: { FontSize: 24, FontBold: true } }
    ], 1);
    expect(nodes[0].FontSize).toBe('24');
    expect(nodes[0].FontBold).toBe('true');
  });

  it('uses version 1 for unknown component types', () => {
    const nodes = helpers.buildComponentNodes([
      { type: 'FancyWidget', name: 'fw1' }
    ], 1);
    expect(nodes[0].$Version).toBe('1');
  });
});

describe('countComponents', () => {
  it('counts flat components', () => {
    expect(helpers.countComponents([
      { type: 'Button', name: 'a' },
      { type: 'Label', name: 'b' }
    ])).toBe(2);
  });

  it('counts nested components', () => {
    expect(helpers.countComponents([
      {
        type: 'VA', name: 'a',
        children: [
          { type: 'Button', name: 'b' },
          { type: 'Label', name: 'c' }
        ]
      }
    ])).toBe(3);
  });
});

describe('collectNames', () => {
  it('collects flat names', () => {
    const names = helpers.collectNames([
      { name: 'btn1' }, { name: 'lbl1' }
    ]);
    expect(names).toEqual(['btn1', 'lbl1']);
  });

  it('collects nested names', () => {
    const names = helpers.collectNames([
      { name: 'va1', children: [{ name: 'btn1' }, { name: 'lbl1' }] }
    ]);
    expect(names).toEqual(['va1', 'btn1', 'lbl1']);
  });
});

describe('getMaxUuid', () => {
  it('returns uuid from a single node', () => {
    expect(helpers.getMaxUuid({ Uuid: '5' })).toBe(5);
  });

  it('finds max uuid in nested tree', () => {
    const tree = {
      Uuid: '0',
      $Components: [
        { Uuid: '3' },
        { Uuid: '7', $Components: [{ Uuid: '15' }] },
        { Uuid: '2' }
      ]
    };
    expect(helpers.getMaxUuid(tree)).toBe(15);
  });

  it('handles missing Uuid', () => {
    expect(helpers.getMaxUuid({})).toBe(0);
  });
});

describe('findComponentInTree', () => {
  const tree = {
    $Name: 'Screen1',
    $Components: [
      { $Name: 'btn1' },
      {
        $Name: 'va1',
        $Components: [
          { $Name: 'lbl1' },
          { $Name: 'txtInput' }
        ]
      }
    ]
  };

  it('finds root component', () => {
    expect(helpers.findComponentInTree(tree, 'Screen1').$Name).toBe('Screen1');
  });

  it('finds top-level child', () => {
    expect(helpers.findComponentInTree(tree, 'btn1').$Name).toBe('btn1');
  });

  it('finds deeply nested child', () => {
    expect(helpers.findComponentInTree(tree, 'txtInput').$Name).toBe('txtInput');
  });

  it('returns null for non-existent component', () => {
    expect(helpers.findComponentInTree(tree, 'nonexistent')).toBeNull();
  });
});

describe('removeComponentsFromTree', () => {
  it('removes a top-level component', () => {
    const tree = {
      $Name: 'Screen1',
      $Components: [
        { $Name: 'btn1' },
        { $Name: 'btn2' },
        { $Name: 'lbl1' }
      ]
    };
    helpers.removeComponentsFromTree(tree, ['btn2']);
    expect(tree.$Components).toHaveLength(2);
    expect(tree.$Components.map(c => c.$Name)).toEqual(['btn1', 'lbl1']);
  });

  it('removes multiple components', () => {
    const tree = {
      $Name: 'Screen1',
      $Components: [
        { $Name: 'btn1' },
        { $Name: 'btn2' },
        { $Name: 'lbl1' }
      ]
    };
    helpers.removeComponentsFromTree(tree, ['btn1', 'lbl1']);
    expect(tree.$Components).toHaveLength(1);
    expect(tree.$Components[0].$Name).toBe('btn2');
  });

  it('removes nested components', () => {
    const tree = {
      $Name: 'Screen1',
      $Components: [
        {
          $Name: 'va1',
          $Components: [
            { $Name: 'btn1' },
            { $Name: 'lbl1' }
          ]
        }
      ]
    };
    helpers.removeComponentsFromTree(tree, ['btn1']);
    expect(tree.$Components[0].$Components).toHaveLength(1);
    expect(tree.$Components[0].$Components[0].$Name).toBe('lbl1');
  });

  it('handles empty componentNames', () => {
    const tree = { $Name: 'Screen1', $Components: [{ $Name: 'btn1' }] };
    helpers.removeComponentsFromTree(tree, []);
    expect(tree.$Components).toHaveLength(1);
  });
});

describe('escapeXml', () => {
  it('escapes ampersands', () => {
    expect(helpers.escapeXml('a & b')).toBe('a &amp; b');
  });

  it('escapes angle brackets', () => {
    expect(helpers.escapeXml('<div>')).toBe('&lt;div&gt;');
  });

  it('escapes quotes', () => {
    expect(helpers.escapeXml('say "hi"')).toBe('say &quot;hi&quot;');
  });

  it('handles empty string', () => {
    expect(helpers.escapeXml('')).toBe('');
  });

  it('converts non-strings', () => {
    expect(helpers.escapeXml(42)).toBe('42');
  });
});

describe('structuredToXml', () => {
  describe('primitives', () => {
    it('converts text block', () => {
      const xml = helpers.structuredToXml({ type: 'text', value: 'hello' });
      expect(xml).toContain('<block type="text">');
      expect(xml).toContain('<field name="TEXT">hello</field>');
    });

    it('escapes text values', () => {
      const xml = helpers.structuredToXml({ type: 'text', value: 'a & b' });
      expect(xml).toContain('a &amp; b');
    });

    it('converts number block', () => {
      const xml = helpers.structuredToXml({ type: 'number', value: 42 });
      expect(xml).toContain('<block type="math_number">');
      expect(xml).toContain('<field name="NUM">42</field>');
    });

    it('converts boolean block', () => {
      const xml = helpers.structuredToXml({ type: 'boolean', value: true });
      expect(xml).toContain('<field name="BOOL">TRUE</field>');
      const xmlFalse = helpers.structuredToXml({ type: 'boolean', value: false });
      expect(xmlFalse).toContain('<field name="BOOL">FALSE</field>');
    });
  });

  describe('event_handler', () => {
    it('generates component_event block', () => {
      const xml = helpers.structuredToXml({
        type: 'event_handler',
        componentType: 'Button',
        component: 'btnBook',
        event: 'Click'
      });
      expect(xml).toContain('<block type="component_event"');
      expect(xml).toContain('component_type="Button"');
      expect(xml).toContain('instance_name="btnBook"');
      expect(xml).toContain('event_name="Click"');
    });

    it('includes body statements', () => {
      const xml = helpers.structuredToXml({
        type: 'event_handler',
        componentType: 'Button',
        component: 'btn1',
        event: 'Click',
        body: [
          { type: 'set_property', componentType: 'Label', component: 'lbl1', property: 'Text', value: { type: 'text', value: 'clicked' } }
        ]
      });
      expect(xml).toContain('<statement name="DO">');
      expect(xml).toContain('set_or_get="set"');
    });
  });

  describe('set_property', () => {
    it('generates set block with value', () => {
      const xml = helpers.structuredToXml({
        type: 'set_property',
        componentType: 'Label',
        component: 'lblStatus',
        property: 'Text',
        value: { type: 'text', value: 'waiting' }
      });
      expect(xml).toContain('set_or_get="set"');
      expect(xml).toContain('property_name="Text"');
      expect(xml).toContain('<value name="VALUE">');
    });
  });

  describe('get_property', () => {
    it('generates get block', () => {
      const xml = helpers.structuredToXml({
        type: 'get_property',
        componentType: 'Label',
        component: 'lblStatus',
        property: 'Text'
      });
      expect(xml).toContain('set_or_get="get"');
      expect(xml).toContain('property_name="Text"');
    });
  });

  describe('call_method', () => {
    it('generates method call with args', () => {
      const xml = helpers.structuredToXml({
        type: 'call_method',
        componentType: 'CloudDB',
        component: 'CloudDB1',
        method: 'StoreValue',
        args: [
          { type: 'text', value: 'status' },
          { type: 'text', value: 'waiting' }
        ]
      });
      expect(xml).toContain('method_name="StoreValue"');
      expect(xml).toContain('<value name="ARG0">');
      expect(xml).toContain('<value name="ARG1">');
    });
  });

  describe('global_declaration', () => {
    it('generates global variable declaration', () => {
      const xml = helpers.structuredToXml({
        type: 'global_declaration',
        name: 'customerLat',
        value: { type: 'number', value: 0 }
      });
      expect(xml).toContain('<block type="global_declaration"');
      expect(xml).toContain('<field name="NAME">customerLat</field>');
      expect(xml).toContain('<value name="VALUE">');
    });
  });

  describe('variable_get / variable_set', () => {
    it('generates variable get', () => {
      const xml = helpers.structuredToXml({ type: 'variable_get', name: 'global customerLat' });
      expect(xml).toContain('<block type="lexical_variable_get">');
      expect(xml).toContain('<field name="VAR">global customerLat</field>');
    });

    it('generates variable set with value', () => {
      const xml = helpers.structuredToXml({
        type: 'variable_set',
        name: 'global customerLat',
        value: { type: 'number', value: 14.5 }
      });
      expect(xml).toContain('<block type="lexical_variable_set">');
      expect(xml).toContain('<field name="VAR">global customerLat</field>');
      expect(xml).toContain('<value name="VALUE">');
    });
  });

  describe('controls_if', () => {
    it('generates simple if block', () => {
      const xml = helpers.structuredToXml({
        type: 'controls_if',
        condition: { type: 'boolean', value: true },
        then: [{ type: 'text', value: 'yes' }]
      });
      expect(xml).toContain('<block type="controls_if">');
      expect(xml).toContain('elseif="0"');
      expect(xml).toContain('else="0"');
      expect(xml).toContain('<value name="IF0">');
      expect(xml).toContain('<statement name="DO0">');
    });

    it('generates if-else block', () => {
      const xml = helpers.structuredToXml({
        type: 'controls_if',
        condition: { type: 'boolean', value: true },
        then: [{ type: 'text', value: 'yes' }],
        else: [{ type: 'text', value: 'no' }]
      });
      expect(xml).toContain('else="1"');
      expect(xml).toContain('<statement name="ELSE">');
    });

    it('generates if-elseif-else block', () => {
      const xml = helpers.structuredToXml({
        type: 'controls_if',
        condition: { type: 'boolean', value: true },
        then: [{ type: 'text', value: 'a' }],
        elseif: [
          { condition: { type: 'boolean', value: false }, then: [{ type: 'text', value: 'b' }] }
        ],
        else: [{ type: 'text', value: 'c' }]
      });
      expect(xml).toContain('elseif="1"');
      expect(xml).toContain('else="1"');
      expect(xml).toContain('<value name="IF1">');
      expect(xml).toContain('<statement name="DO1">');
    });
  });

  describe('controls_forRange', () => {
    it('generates for range block', () => {
      const xml = helpers.structuredToXml({
        type: 'controls_forRange',
        variable: 'i',
        from: { type: 'number', value: 1 },
        to: { type: 'number', value: 10 },
        by: { type: 'number', value: 1 },
        body: [{ type: 'text', value: 'loop' }]
      });
      expect(xml).toContain('<block type="controls_forRange">');
      expect(xml).toContain('<field name="VAR">i</field>');
      expect(xml).toContain('<value name="START">');
      expect(xml).toContain('<value name="END">');
      expect(xml).toContain('<value name="STEP">');
    });
  });

  describe('controls_forEach', () => {
    it('generates for each block', () => {
      const xml = helpers.structuredToXml({
        type: 'controls_forEach',
        variable: 'item',
        list: { type: 'variable_get', name: 'global myList' },
        body: [{ type: 'text', value: 'loop' }]
      });
      expect(xml).toContain('<block type="controls_forEach">');
      expect(xml).toContain('<field name="VAR">item</field>');
    });
  });

  describe('controls_while', () => {
    it('generates while block', () => {
      const xml = helpers.structuredToXml({
        type: 'controls_while',
        condition: { type: 'boolean', value: true },
        body: [{ type: 'text', value: 'loop' }]
      });
      expect(xml).toContain('<block type="controls_while">');
      expect(xml).toContain('<value name="TEST">');
    });
  });

  describe('logic blocks', () => {
    it('generates logic_compare', () => {
      const xml = helpers.structuredToXml({
        type: 'logic_compare',
        op: 'EQ',
        a: { type: 'text', value: 'hello' },
        b: { type: 'text', value: 'hello' }
      });
      expect(xml).toContain('<block type="logic_compare">');
      expect(xml).toContain('<field name="OP">EQ</field>');
    });

    it('generates logic_operation', () => {
      const xml = helpers.structuredToXml({
        type: 'logic_operation',
        op: 'AND',
        a: { type: 'boolean', value: true },
        b: { type: 'boolean', value: false }
      });
      expect(xml).toContain('<block type="logic_operation">');
      expect(xml).toContain('<field name="OP">AND</field>');
    });

    it('generates logic_negate', () => {
      const xml = helpers.structuredToXml({
        type: 'logic_negate',
        value: { type: 'boolean', value: true }
      });
      expect(xml).toContain('<block type="logic_negate">');
    });
  });

  describe('math blocks', () => {
    it('generates math_arithmetic', () => {
      const xml = helpers.structuredToXml({
        type: 'math_arithmetic',
        op: 'ADD',
        a: { type: 'number', value: 1 },
        b: { type: 'number', value: 2 }
      });
      expect(xml).toContain('<block type="math_arithmetic">');
      expect(xml).toContain('<field name="OP">ADD</field>');
    });

    it('generates math_compare', () => {
      const xml = helpers.structuredToXml({
        type: 'math_compare',
        op: 'GT',
        a: { type: 'number', value: 5 },
        b: { type: 'number', value: 3 }
      });
      expect(xml).toContain('<block type="math_compare">');
      expect(xml).toContain('<field name="OP">GT</field>');
    });
  });

  describe('text_join', () => {
    it('generates text join with items', () => {
      const xml = helpers.structuredToXml({
        type: 'text_join',
        items: [
          { type: 'text', value: 'hello' },
          { type: 'text', value: ' world' }
        ]
      });
      expect(xml).toContain('<block type="text_join">');
      expect(xml).toContain('items="2"');
      expect(xml).toContain('<value name="ADD0">');
      expect(xml).toContain('<value name="ADD1">');
    });
  });

  describe('lists', () => {
    it('generates lists_create_with', () => {
      const xml = helpers.structuredToXml({
        type: 'lists_create_with',
        items: [
          { type: 'number', value: 1 },
          { type: 'number', value: 2 }
        ]
      });
      expect(xml).toContain('<block type="lists_create_with">');
      expect(xml).toContain('items="2"');
    });
  });

  describe('procedures', () => {
    it('generates procedure definition without return', () => {
      const xml = helpers.structuredToXml({
        type: 'procedures_defnoreturn',
        name: 'resetBooking',
        body: [{ type: 'text', value: 'done' }]
      });
      expect(xml).toContain('<block type="procedures_defnoreturn"');
      expect(xml).toContain('<field name="NAME">resetBooking</field>');
      expect(xml).toContain('<statement name="STACK">');
    });

    it('generates procedure call without return', () => {
      const xml = helpers.structuredToXml({
        type: 'procedures_callnoreturn',
        name: 'resetBooking'
      });
      expect(xml).toContain('<block type="procedures_callnoreturn">');
      expect(xml).toContain('name="resetBooking"');
    });

    it('generates procedure call with args', () => {
      const xml = helpers.structuredToXml({
        type: 'procedures_callnoreturn',
        name: 'setStatus',
        args: [{ name: 'status', value: { type: 'text', value: 'idle' } }]
      });
      expect(xml).toContain('name="setStatus"');
      expect(xml).toContain('<arg name="status">');
      expect(xml).toContain('<value name="ARG0">');
    });
  });

  describe('next block chaining', () => {
    it('chains blocks with next', () => {
      const xml = helpers.structuredToXml({
        type: 'set_property',
        componentType: 'Label',
        component: 'lbl1',
        property: 'Text',
        value: { type: 'text', value: 'a' },
        next: {
          type: 'set_property',
          componentType: 'Label',
          component: 'lbl2',
          property: 'Text',
          value: { type: 'text', value: 'b' }
        }
      });
      expect(xml).toContain('<next>');
      expect(xml).toContain('lbl1');
      expect(xml).toContain('lbl2');
    });
  });

  describe('rawType passthrough', () => {
    it('generates block from rawType', () => {
      const xml = helpers.structuredToXml({
        type: 'raw',
        rawType: 'custom_block',
        fields: { MODE: 'advanced' },
        values: { INPUT: { type: 'number', value: 5 } }
      });
      expect(xml).toContain('<block type="custom_block">');
      expect(xml).toContain('<field name="MODE">advanced</field>');
      expect(xml).toContain('<value name="INPUT">');
    });
  });

  describe('unknown type', () => {
    it('returns empty string for unknown block type', () => {
      const xml = helpers.structuredToXml({ type: 'totally_unknown' });
      expect(xml).toBe('');
    });
  });
});
