// Background service worker — bridges WebSocket (host) <-> content script (page)

const WS_URL = 'ws://localhost:8765';
let ws = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30000;

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getTab(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tab);
    });
  });
}

function isRecoverableSendMessageError(err) {
  const m = err?.message || String(err);
  return (
    m.includes('Receiving end does not exist') ||
    m.includes('Could not establish connection') ||
    m.includes('The message port closed before a response was received')
  );
}

/** Prefer the App Inventor tab the user is looking at, else first match. */
async function pickAppInventorTabId() {
  const appTabs = await chrome.tabs.query({
    url: ['*://*.appinventor.mit.edu/*']
  });
  if (appTabs.length === 0) return null;

  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active?.id != null) {
    const hit = appTabs.find((t) => t.id === active.id);
    if (hit) return hit.id;
  }

  return appTabs[0].id;
}

async function injectContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });
}

function pingTab(tabId, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Ping timeout')), ms);
    chrome.tabs.sendMessage(tabId, { type: 'ping' }, (response) => {
      clearTimeout(t);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (tab.status === 'complete') {
        resolve();
        return;
      }
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Tab load timeout'));
      }, 90000);
      function listener(id, info) {
        if (id === tabId && info.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

/**
 * Ping + inject only (no reload). Safe for tab focus / onUpdated warming.
 */
async function warmBridgePingOrInject(tabId) {
  try {
    await pingTab(tabId, 4000);
    return;
  } catch {
    /* try inject */
  }
  try {
    await injectContentScript(tabId);
    await delay(280);
    await pingTab(tabId, 6000);
  } catch {
    /* page may still be loading; tool path will retry harder */
  }
}

/**
 * Full recovery for MCP tools: ping → inject → reload if still dead.
 * Reload runs only here so focusing a slow tab does not force-refresh the page.
 */
async function ensureAppInventorTabReady(tabId) {
  try {
    await pingTab(tabId, 4000);
    return;
  } catch {
    /* try inject */
  }

  try {
    await injectContentScript(tabId);
    await delay(280);
    await pingTab(tabId, 6000);
    return;
  } catch {
    /* try reload */
  }

  const t = await getTab(tabId);
  if (t.status !== 'complete') {
    await waitForTabComplete(tabId);
    await delay(500);
    try {
      await injectContentScript(tabId);
      await delay(320);
      await pingTab(tabId, 15000);
      return;
    } catch (e) {
      throw e;
    }
  }

  await new Promise((resolve, reject) => {
    chrome.tabs.reload(tabId, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
  await waitForTabComplete(tabId);
  await delay(900);
  try {
    await injectContentScript(tabId);
  } catch {
    /* manifest may have injected */
  }
  await delay(320);
  await pingTab(tabId, 20000);
}

/**
 * Deliver a message to the content script, recovering from a missing receiver by injecting
 * content.js and retrying (manifest injection alone is not always present until refresh).
 */
async function sendMessageWithRecovery(tabId, message, attempt = 0) {
  try {
    return await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  } catch (err) {
    if (!isRecoverableSendMessageError(err) || attempt >= 2) {
      throw err;
    }
    try {
      await injectContentScript(tabId);
    } catch (injectErr) {
      throw new Error(
        `Inject failed: ${injectErr.message}. Original: ${err.message}`
      );
    }
    await delay(attempt === 0 ? 80 : 220);
    return sendMessageWithRecovery(tabId, message, attempt + 1);
  }
}

/** Warm the bridge when a tab finishes loading or gains focus — ping/inject only, no reload. */
async function warmBridgeIfAppInventor(tabId) {
  try {
    const tab = await getTab(tabId);
    if (!tab.url?.includes('appinventor.mit.edu')) return;
    await warmBridgePingOrInject(tabId);
  } catch {
    /* tab may be loading or restricted */
  }
}

async function warmAllAppInventorTabs() {
  const tabs = await chrome.tabs.query({
    url: ['*://*.appinventor.mit.edu/*']
  });
  for (const t of tabs) {
    if (t.id != null) {
      warmBridgeIfAppInventor(t.id);
    }
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    warmBridgeIfAppInventor(tabId);
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  warmBridgeIfAppInventor(tabId);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'wake') {
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  if (ws && ws.readyState === WebSocket.CONNECTING) return;
  try {
    if (ws) ws.close();
  } catch {
    /* ignore */
  }
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('[MCP Bridge] Connected to host');
    reconnectDelay = 1000;
    warmAllAppInventorTabs();
  };

  ws.onmessage = async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.type !== 'tool_call') return;

    const tabId = await pickAppInventorTabId();
    if (tabId == null) {
      ws.send(
        JSON.stringify({
          requestId: msg.requestId,
          result: { success: false, error: 'No App Inventor tab found.' }
        })
      );
      return;
    }

    try {
      await ensureAppInventorTabReady(tabId);
      const response = await sendMessageWithRecovery(tabId, {
        type: 'tool_call',
        requestId: msg.requestId,
        tool: msg.tool,
        params: msg.params
      });
      ws.send(JSON.stringify({ requestId: msg.requestId, result: response }));
    } catch (err) {
      ws.send(
        JSON.stringify({
          requestId: msg.requestId,
          result: {
            success: false,
            error: `Content script error: ${err.message}`
          }
        })
      );
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
