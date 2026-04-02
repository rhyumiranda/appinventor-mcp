// Background service worker — bridges WebSocket (host) <-> content script (page)

const WS_URL = 'ws://localhost:8765';
let ws = null;
let activeTabId = null;
let reconnectDelay = 1000; // exponential backoff: starts at 1s
const MAX_RECONNECT_DELAY = 30000; // cap at 30s

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  if (ws && ws.readyState === WebSocket.CONNECTING) return;

  try { if (ws) ws.close(); } catch {}
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('[MCP Bridge] Connected to host');
    reconnectDelay = 1000; // reset backoff on success
  };

  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'tool_call') {
      if (!activeTabId) {
        const tabs = await chrome.tabs.query({ url: '*://*.appinventor.mit.edu/*' });
        if (tabs.length > 0) {
          activeTabId = tabs[0].id;
        } else {
          ws.send(JSON.stringify({
            requestId: msg.requestId,
            result: { success: false, error: 'No App Inventor tab found. Open ai2a.appinventor.mit.edu in Chrome.' }
          }));
          return;
        }
      }

      try {
        const response = await sendToContentScript(activeTabId, {
          type: 'tool_call',
          requestId: msg.requestId,
          tool: msg.tool,
          params: msg.params
        });

        ws.send(JSON.stringify({
          requestId: msg.requestId,
          result: response
        }));
      } catch (err) {
        ws.send(JSON.stringify({
          requestId: msg.requestId,
          result: { success: false, error: `Content script error: ${err.message}` }
        }));
      }
    }
  };

  ws.onclose = () => {
    console.log(`[MCP Bridge] Disconnected, retry in ${reconnectDelay / 1000}s`);
    ws = null;
    setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
      connect();
    }, reconnectDelay);
  };

  ws.onerror = () => {
    console.log('[MCP Bridge] WebSocket error');
  };
}

// Programmatically inject content script if not already present
async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'ping' });
  } catch {
    console.log('[MCP Bridge] Injecting content script into tab', tabId);
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    await new Promise(r => setTimeout(r, 500));
  }
}

async function sendToContentScript(tabId, message) {
  await ensureContentScript(tabId);
  return chrome.tabs.sendMessage(tabId, message);
}

// Track active App Inventor tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url && tab.url.includes('appinventor.mit.edu')) {
    activeTabId = tabId;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) activeTabId = null;
});

// --- Auto-connect: wake on message from content script ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'wake' || message.type === 'ping') {
    connect();
    sendResponse({ connected: ws && ws.readyState === WebSocket.OPEN });
    return false;
  }
});

// --- Alarms-based keep-alive (survives worker restarts) ---
chrome.alarms.create('keepAlive', { periodInMinutes: 1 / 3 }); // ~20s

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    } else {
      connect();
    }
  }
});

// Auto-connect on install/startup
chrome.runtime.onInstalled.addListener(() => connect());
chrome.runtime.onStartup.addListener(() => connect());

// Initial connect
connect();
