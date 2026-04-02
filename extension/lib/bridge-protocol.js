export const BRIDGE_PREFIX = 'appinventor-mcp-';

let counter = 0;

export function generateRequestId() {
  return `mcp-${Date.now()}-${++counter}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createBridgeMessage(direction, payload, requestId) {
  return {
    type: `${BRIDGE_PREFIX}${direction}`,
    requestId: requestId || generateRequestId(),
    payload
  };
}

export function parseBridgeMessage(data) {
  if (!data || typeof data.type !== 'string' || !data.type.startsWith(BRIDGE_PREFIX)) {
    return null;
  }

  return {
    direction: data.type.slice(BRIDGE_PREFIX.length),
    requestId: data.requestId,
    payload: data.payload
  };
}

export function isValidBridgeMessage(data) {
  if (!data || typeof data.type !== 'string') return false;
  return data.type.startsWith(BRIDGE_PREFIX);
}
