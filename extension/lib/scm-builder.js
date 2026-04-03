const DEFAULT_YA_VERSION = '233';
const DEFAULT_AUTH_URL = ['ai2a.appinventor.mit.edu'];
const DEFAULT_FORM_VERSION = '31';

// Default versions for common component types
const COMPONENT_VERSIONS = {
  // UI
  Form: '31', Button: '7', Label: '5', TextBox: '6', PasswordTextBox: '5',
  CheckBox: '3', Switch: '2', Slider: '2', Spinner: '2', ListPicker: '9',
  DatePicker: '4', TimePicker: '4', Image: '5', ListView: '6', WebViewer: '10',
  // Layout
  VerticalArrangement: '4', HorizontalArrangement: '4', TableArrangement: '2',
  // Media
  Camcorder: '2', Camera: '4', ImagePicker: '6', Player: '7', Sound: '4',
  SpeechRecognizer: '3', TextToSpeech: '5', VideoPlayer: '7',
  // Drawing & Animation
  Canvas: '14',
  // Maps
  Map: '7', Marker: '4', Circle: '2', LineString: '2', Polygon: '2', Rectangle: '2',
  // Sensors
  AccelerometerSensor: '5', LocationSensor: '4', OrientationSensor: '2',
  BarcodeScannerComponent: '2', NearField: '2', Pedometer: '3', ProximitySensor: '2',
  Clock: '4',
  // Social
  ContactPicker: '6', EmailPicker: '4', PhoneCall: '3', PhoneNumberPicker: '5',
  Sharing: '2', Texting: '5', Twitter: '5',
  // Storage
  TinyDB: '2', File: '4', CloudDB: '2', FirebaseDB: '3', FusiontablesControl: '4',
  // Connectivity
  Web: '7', ActivityStarter: '7', BluetoothClient: '8', BluetoothServer: '5',
  // Non-visible
  Notifier: '6'
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
