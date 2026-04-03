// Background service worker — bridges WebSocket (host) <-> content script (page)

const WS_URL = 'ws://localhost:8765';
let ws = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30000;

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  if (ws && ws.readyState === WebSocket.CONNECTING) return;
  try { if (ws) ws.close(); } catch {}
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('[MCP Bridge] Connected to host');
    reconnectDelay = 1000;
  };

  ws.onmessage = async (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    if (msg.type !== 'tool_call') return;

    // Find App Inventor tab
    const allTabs = await chrome.tabs.query({});
    const tabs = allTabs.filter(t => t.url && t.url.includes('appinventor.mit.edu'));
    if (tabs.length === 0) {
      ws.send(JSON.stringify({ requestId: msg.requestId, result: { success: false, error: 'No App Inventor tab found.' } }));
      return;
    }

    const tabId = tabs[0].id;

    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: 'tool_call',
        requestId: msg.requestId,
        tool: msg.tool,
        params: msg.params
      });
      ws.send(JSON.stringify({ requestId: msg.requestId, result: response }));
    } catch (err) {
      ws.send(JSON.stringify({ requestId: msg.requestId, result: { success: false, error: `Content script error: ${err.message}` } }));
    }
  };

  ws.onclose = () => {
    ws = null;
    setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
      connect();
    }, reconnectDelay);
  };

  ws.onerror = () => {};
}

// Keep-alive
chrome.alarms.create('keepAlive', { periodInMinutes: 1 / 3 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    } else {
      connect();
    }
  }
});

chrome.runtime.onInstalled.addListener(() => connect());
chrome.runtime.onStartup.addListener(() => connect());
connect();
