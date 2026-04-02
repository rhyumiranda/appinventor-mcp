const DEFAULT_YA_VERSION = '233';
const DEFAULT_AUTH_URL = ['ai2a.appinventor.mit.edu'];
const DEFAULT_FORM_VERSION = '31';

// Default versions for common component types
const COMPONENT_VERSIONS = {
  Form: '31',
  Button: '7',
  Label: '5',
  TextBox: '6',
  VerticalArrangement: '4',
  HorizontalArrangement: '4',
  Image: '5',
  ListView: '6',
  Notifier: '6',
  Canvas: '14',
  Clock: '4',
  TinyDB: '2',
  Web: '7',
  Spinner: '2',
  CheckBox: '3',
  DatePicker: '4',
  TimePicker: '4',
  Slider: '2',
  Switch: '2',
  PasswordTextBox: '5'
};

function getComponentVersion(type) {
  return COMPONENT_VERSIONS[type] || '1';
}

export function getMaxUuid(node) {
  let max = parseInt(node.Uuid) || 0;
  if (node.$Components) {
    for (const child of node.$Components) {
      max = Math.max(max, getMaxUuid(child));
    }
  }
  return max;
}

function buildComponentNode(spec, uuidCounter) {
  const node = {
    $Name: spec.name,
    $Type: spec.type,
    $Version: getComponentVersion(spec.type),
    Uuid: String(uuidCounter.next++)
  };

  if (spec.properties) {
    for (const [key, value] of Object.entries(spec.properties)) {
      node[key] = String(value);
    }
  }

  if (spec.children && spec.children.length > 0) {
    node.$Components = spec.children.map(child => buildComponentNode(child, uuidCounter));
  }

  return node;
}

export function buildScmTree(screenName, appName, components) {
  const uuidCounter = { next: 1 };

  const tree = {
    authURL: DEFAULT_AUTH_URL,
    YaVersion: DEFAULT_YA_VERSION,
    Source: 'Form',
    Properties: {
      $Name: screenName,
      $Type: 'Form',
      $Version: DEFAULT_FORM_VERSION,
      ActionBar: 'True',
      AppName: appName,
      Title: screenName,
      Uuid: '0',
      $Components: components.map(spec => buildComponentNode(spec, uuidCounter))
    }
  };

  return tree;
}

export function mergeComponents(existingScm, newComponents) {
  const maxUuid = getMaxUuid(existingScm.Properties);
  const uuidCounter = { next: maxUuid + 1 };

  if (!existingScm.Properties.$Components) {
    existingScm.Properties.$Components = [];
  }

  for (const spec of newComponents) {
    existingScm.Properties.$Components.push(buildComponentNode(spec, uuidCounter));
  }

  return existingScm;
}

export function wrapScmContent(scm) {
  return '#\\!\n$JSON\n' + JSON.stringify(scm) + '\n\\!#';
}

export function assignUuids(components, startFrom = 1) {
  const uuidCounter = { next: startFrom };
  return components.map(spec => buildComponentNode(spec, uuidCounter));
}
