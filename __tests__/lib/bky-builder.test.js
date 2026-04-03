import { describe, it, expect } from 'vitest';
import {
  buildEventHandler,
  buildSetProperty,
  buildCallMethod,
  blocksToXml
} from '../../extension/lib/bky-builder.js';

describe('bky-builder', () => {
  describe('buildEventHandler', () => {
    it('generates event handler block XML', () => {
      const xml = buildEventHandler({
        componentType: 'Button',
        instanceName: 'Button1',
        eventName: 'Click'
      });

      expect(xml).toContain('type="component_event"');
      expect(xml).toContain('component_type="Button"');
      expect(xml).toContain('instance_name="Button1"');
      expect(xml).toContain('event_name="Click"');
      expect(xml).toContain('<field name="COMPONENT_SELECTOR">Button1</field>');
    });

    it('includes statement DO for body blocks', () => {
      const xml = buildEventHandler({
        componentType: 'Button',
        instanceName: 'Button1',
        eventName: 'Click',
        body: '<block type="text"><field name="TEXT">test</field></block>'
      });

      expect(xml).toContain('<statement name="DO">');
      expect(xml).toContain('</statement>');
    });

    it('mutation comes before field', () => {
      const xml = buildEventHandler({
        componentType: 'Button',
        instanceName: 'Button1',
        eventName: 'Click'
      });

      const mutationIdx = xml.indexOf('<mutation');
      const fieldIdx = xml.indexOf('<field');
      expect(mutationIdx).toBeLessThan(fieldIdx);
    });
  });

  describe('buildSetProperty', () => {
    it('generates set property block XML', () => {
      const xml = buildSetProperty({
        componentType: 'Label',
        instanceName: 'Label1',
        propertyName: 'Text',
        value: '<block type="text"><field name="TEXT">Hello</field></block>'
      });

      expect(xml).toContain('type="component_set_get"');
      expect(xml).toContain('set_or_get="set"');
      expect(xml).toContain('property_name="Text"');
      expect(xml).toContain('instance_name="Label1"');
      expect(xml).toContain('<field name="PROP">Text</field>');
      expect(xml).toContain('<value name="VALUE">');
    });

    it('mutation comes before field elements', () => {
      const xml = buildSetProperty({
        componentType: 'Label',
        instanceName: 'Label1',
        propertyName: 'Text',
        value: '<block type="text"><field name="TEXT">x</field></block>'
      });

      const mutationIdx = xml.indexOf('<mutation');
      const fieldIdx = xml.indexOf('<field');
      expect(mutationIdx).toBeLessThan(fieldIdx);
    });
  });

  describe('buildCallMethod', () => {
    it('generates call method block XML', () => {
      const xml = buildCallMethod({
        componentType: 'Notifier',
        instanceName: 'Notifier1',
        methodName: 'ShowAlert',
        args: ['<block type="text"><field name="TEXT">Hi</field></block>']
      });

      expect(xml).toContain('type="component_method"');
      expect(xml).toContain('method_name="ShowAlert"');
      expect(xml).toContain('instance_name="Notifier1"');
      expect(xml).toContain('<value name="ARG0">');
    });

    it('handles multiple arguments', () => {
      const xml = buildCallMethod({
        componentType: 'Web',
        instanceName: 'Web1',
        methodName: 'PostText',
        args: [
          '<block type="text"><field name="TEXT">url</field></block>',
          '<block type="text"><field name="TEXT">data</field></block>'
        ]
      });

      expect(xml).toContain('<value name="ARG0">');
      expect(xml).toContain('<value name="ARG1">');
    });

    it('handles zero arguments', () => {
      const xml = buildCallMethod({
        componentType: 'Clock',
        instanceName: 'Clock1',
        methodName: 'SystemTime',
        args: []
      });

      expect(xml).not.toContain('<value name="ARG');
    });

    it('mutation comes before field', () => {
      const xml = buildCallMethod({
        componentType: 'Notifier',
        instanceName: 'Notifier1',
        methodName: 'ShowAlert',
        args: []
      });

      const mutationIdx = xml.indexOf('<mutation');
      const fieldIdx = xml.indexOf('<field');
      expect(mutationIdx).toBeLessThan(fieldIdx);
    });
  });

  describe('blocksToXml', () => {
    it('wraps blocks in xml root element', () => {
      const xml = blocksToXml(['<block type="text"><field name="TEXT">hi</field></block>']);

      expect(xml).toContain('<xml xmlns="https://developers.google.com/blockly/xml">');
      expect(xml).toContain('</xml>');
    });

    it('includes all provided blocks', () => {
      const blocks = [
        '<block type="text"><field name="TEXT">a</field></block>',
        '<block type="text"><field name="TEXT">b</field></block>'
      ];
      const xml = blocksToXml(blocks);

      expect(xml).toContain('TEXT">a</field>');
      expect(xml).toContain('TEXT">b</field>');
    });
  });

  describe('structured block description -> XML', () => {
    it('converts event_handler description to XML', () => {
      const xml = buildEventHandler({
        componentType: 'Button',
        instanceName: 'Button1',
        eventName: 'Click',
        body: buildSetProperty({
          componentType: 'Label',
          instanceName: 'Label1',
          propertyName: 'Text',
          value: '<block type="text"><field name="TEXT">Clicked!</field></block>'
        })
      });

      expect(xml).toContain('component_event');
      expect(xml).toContain('component_set_get');
      expect(xml).toContain('Clicked!');
    });
  });
});
