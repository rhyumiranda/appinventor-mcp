export function buildEventHandler({ componentType, instanceName, eventName, body, x = 50, y = 50 }) {
  let xml = `<block type="component_event" x="${x}" y="${y}">`;
  xml += `<mutation component_type="${componentType}" instance_name="${instanceName}" event_name="${eventName}"></mutation>`;
  xml += `<field name="COMPONENT_SELECTOR">${instanceName}</field>`;
  if (body) {
    xml += `<statement name="DO">${body}</statement>`;
  }
  xml += '</block>';
  return xml;
}

export function buildSetProperty({ componentType, instanceName, propertyName, value }) {
  let xml = '<block type="component_set_get">';
  xml += `<mutation component_type="${componentType}" set_or_get="set" property_name="${propertyName}" is_generic="false" instance_name="${instanceName}"></mutation>`;
  xml += `<field name="COMPONENT_SELECTOR">${instanceName}</field>`;
  xml += `<field name="PROP">${propertyName}</field>`;
  if (value) {
    xml += `<value name="VALUE">${value}</value>`;
  }
  xml += '</block>';
  return xml;
}

export function buildGetProperty({ componentType, instanceName, propertyName }) {
  let xml = '<block type="component_set_get">';
  xml += `<mutation component_type="${componentType}" set_or_get="get" property_name="${propertyName}" is_generic="false" instance_name="${instanceName}"></mutation>`;
  xml += `<field name="COMPONENT_SELECTOR">${instanceName}</field>`;
  xml += `<field name="PROP">${propertyName}</field>`;
  xml += '</block>';
  return xml;
}

export function buildCallMethod({ componentType, instanceName, methodName, args = [] }) {
  let xml = '<block type="component_method">';
  xml += `<mutation component_type="${componentType}" method_name="${methodName}" instance_name="${instanceName}" is_generic="false"></mutation>`;
  xml += `<field name="COMPONENT_SELECTOR">${instanceName}</field>`;
  args.forEach((arg, i) => {
    xml += `<value name="ARG${i}">${arg}</value>`;
  });
  xml += '</block>';
  return xml;
}

export function buildTextBlock(text) {
  return `<block type="text"><field name="TEXT">${text}</field></block>`;
}

export function buildNumberBlock(num) {
  return `<block type="math_number"><field name="NUM">${num}</field></block>`;
}

export function buildBooleanBlock(val) {
  return `<block type="logic_boolean"><field name="BOOL">${val ? 'TRUE' : 'FALSE'}</field></block>`;
}

export function blocksToXml(blocks) {
  return `<xml xmlns="https://developers.google.com/blockly/xml">${blocks.join('')}</xml>`;
}
