// Content script — injected into App Inventor pages
// Bridges: background.js (chrome.runtime) <-> page-bridge.js (window.postMessage)

const BRIDGE_PREFIX = 'appinventor-mcp-';
const CACHE_KEY = 'mcpSessionParams';
const pendingRequests = new Map();

// --- Wake background service worker on load ---
chrome.runtime.sendMessage({ type: 'wake' }).catch(() => {});

// Listen for tool calls from background service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ping') {
    sendResponse({ pong: true });
    return false;
  }
  if (message.type !== 'tool_call') return false;

  const { requestId, tool, params } = message;

  // Forward to page-bridge.js via postMessage
  window.postMessage({
    type: `${BRIDGE_PREFIX}request`,
    requestId,
    tool,
    params
  }, '*');

  // Store the response callback
  pendingRequests.set(requestId, sendResponse);

  // Return true to keep the message channel open for async response
  return true;
});

// Listen for responses from page-bridge.js
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data || !event.data.type) return;

  const { type } = event.data;

  // --- Tool call responses ---
  if (type === `${BRIDGE_PREFIX}response`) {
    const { requestId, result } = event.data;
    const sendResponse = pendingRequests.get(requestId);
    if (sendResponse) {
      pendingRequests.delete(requestId);
      sendResponse(result);
    }
    return;
  }

  // --- Cache write: page-bridge wants to persist session params ---
  if (type === `${BRIDGE_PREFIX}cache-write`) {
    chrome.storage.local.set({ [CACHE_KEY]: event.data.data }, () => {
      console.log('[MCP Bridge] Session params cached');
    });
    return;
  }

  // --- Cache read: page-bridge wants to load cached session params ---
  if (type === `${BRIDGE_PREFIX}cache-read`) {
    chrome.storage.local.get(CACHE_KEY, (result) => {
      window.postMessage({
        type: `${BRIDGE_PREFIX}cache-data`,
        data: result[CACHE_KEY] || null
      }, '*');
    });
    return;
  }
});

// Inject page-bridge.js into the MAIN world so it can access App Inventor globals
const script = document.createElement('script');
script.src = chrome.runtime.getURL('page-bridge.js');
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);

console.log('[MCP Bridge] Content script loaded');
