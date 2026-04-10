// Content script — injected into App Inventor pages
// Bridges: background.js (chrome.runtime) <-> page-bridge.js (window.postMessage)

const BRIDGE_PREFIX = 'appinventor-mcp-';
const CACHE_KEY = 'mcpSessionParams';
const pendingRequests = new Map();
const TOOL_RESPONSE_MS = 25000;

function injectPageBridge() {
  const root = document.documentElement;
  const loading = document.querySelector('script[data-aimcp-page-bridge]');
  if (root?.hasAttribute('data-aimcp-page-bridge') || loading) {
    return;
  }
  const script = document.createElement('script');
  script.dataset.aimcpPageBridge = '1';
  script.src = chrome.runtime.getURL('page-bridge.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

// Register once per frame: manifest + programmatic inject must not stack listeners or skip reinjection.
if (!globalThis.__AIMCP_LISTENERS_ATTACHED) {
  globalThis.__AIMCP_LISTENERS_ATTACHED = true;

  chrome.runtime.sendMessage({ type: 'wake' }).catch(() => {});

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'ping') {
      sendResponse({ pong: true });
      return false;
    }
    if (message.type !== 'tool_call') return false;

    const { requestId, tool, params } = message;

    injectPageBridge();

    window.postMessage(
      {
        type: `${BRIDGE_PREFIX}request`,
        requestId,
        tool,
        params
      },
      '*'
    );

    const timeoutId = setTimeout(() => {
      if (!pendingRequests.has(requestId)) return;
      pendingRequests.delete(requestId);
      sendResponse({
        success: false,
        error:
          'Page bridge did not respond in time. The editor may still be loading; try again in a few seconds.'
      });
    }, TOOL_RESPONSE_MS);

    pendingRequests.set(requestId, (result) => {
      clearTimeout(timeoutId);
      sendResponse(result);
    });

    return true;
  });

  window.addEventListener('message', (event) => {
    // Same-window bridge traffic; do not require event.source === window (isolated vs main world).
    if (!event.data || typeof event.data.type !== 'string') return;
    if (!event.data.type.startsWith(BRIDGE_PREFIX)) return;

    const { type } = event.data;

    if (type === `${BRIDGE_PREFIX}response`) {
      const { requestId, result } = event.data;
      const finish = pendingRequests.get(requestId);
      if (finish) {
        pendingRequests.delete(requestId);
        finish(result);
      }
      return;
    }

    if (type === `${BRIDGE_PREFIX}cache-write`) {
      chrome.storage.local.set({ [CACHE_KEY]: event.data.data }, () => {
        console.log('[MCP Bridge] Session params cached');
      });
      return;
    }

    if (type === `${BRIDGE_PREFIX}cache-read`) {
      chrome.storage.local.get(CACHE_KEY, (result) => {
        window.postMessage(
          {
            type: `${BRIDGE_PREFIX}cache-data`,
            data: result[CACHE_KEY] || null
          },
          '*'
        );
      });
      return;
    }
  });
}

injectPageBridge();
console.log('[MCP Bridge] Content script loaded');
