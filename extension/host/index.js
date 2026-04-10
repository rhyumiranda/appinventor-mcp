#!/usr/bin/env node

import { handleMessage } from '../lib/mcp-handler.js';
import { createInterface } from 'readline';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';

const WS_PORT = 8765;
const stdout = process.stdout;
const stderr = process.stderr;

// Track WebSocket peers (Chrome extension + optional stdio-proxy clients)
const connectedSockets = new Set();
const pendingRequests = new Map();
let requestCounter = 0;

function extensionSockets() {
  return [...connectedSockets].filter(
    (ws) => ws.readyState === 1 && ws.bridgeRole === 'extension'
  );
}

// --- Tool executor: broadcasts to extension connections only (not stdio-proxy peers) ---
async function toolExecutor(toolName, args) {
  const liveSockets = extensionSockets();
  if (liveSockets.length === 0) {
    return {
      success: false,
      error:
        'Chrome extension not connected. Open App Inventor in Chrome with the extension enabled.'
    };
  }

  const requestId = `req-${++requestCounter}`;
  stderr.write(`Broadcasting ${toolName} to ${liveSockets.length} connection(s)\n`);

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve({ success: false, error: 'Extension request timed out (30s)' });
    }, 30000);

    pendingRequests.set(requestId, (result) => {
      clearTimeout(timeout);
      resolve(result);
    });

    const payload = JSON.stringify({
      type: 'tool_call',
      requestId,
      tool: toolName,
      params: args
    });

    for (const ws of liveSockets) {
      try {
        ws.send(payload);
      } catch {}
    }
  });
}

function attachConnectionHandler(wss) {
  wss.on('connection', (ws, req) => {
    let role = 'extension';
    try {
      const u = new URL(req.url || '/', 'http://localhost');
      if (u.searchParams.get('role') === 'stdio-proxy') role = 'stdio-proxy';
    } catch {
      /* keep extension */
    }

    ws.bridgeRole = role;
    connectedSockets.add(ws);

    if (role === 'stdio-proxy') {
      stderr.write('stdio-proxy WebSocket peer connected\n');
      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type !== 'stdio_proxy') return;

          let request;
          try {
            request = JSON.parse(msg.line);
          } catch (e) {
            ws.send(
              JSON.stringify({
                type: 'stdio_proxy_response',
                correlationId: msg.correlationId,
                error: `Invalid JSON in line: ${e.message}`
              })
            );
            return;
          }

          try {
            const response = await handleMessage(request, toolExecutor);
            ws.send(
              JSON.stringify({
                type: 'stdio_proxy_response',
                correlationId: msg.correlationId,
                line: JSON.stringify(response)
              })
            );
          } catch (e) {
            ws.send(
              JSON.stringify({
                type: 'stdio_proxy_response',
                correlationId: msg.correlationId,
                error: e.message
              })
            );
          }
        } catch (err) {
          stderr.write(`stdio proxy message error: ${err.message}\n`);
        }
      });
      ws.on('close', () => {
        connectedSockets.delete(ws);
        stderr.write('stdio-proxy WebSocket peer closed\n');
      });
      return;
    }

    stderr.write(
      `Chrome connection opened (extensions: ${extensionSockets().length})\n`
    );

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'ping') return;
        const resolve = pendingRequests.get(msg.requestId);
        if (resolve) {
          pendingRequests.delete(msg.requestId);
          resolve(msg.result);
        }
      } catch (err) {
        stderr.write(`WS parse error: ${err.message}\n`);
      }
    });

    ws.on('close', () => {
      connectedSockets.delete(ws);
      stderr.write(
        `Chrome connection closed (remaining peers: ${connectedSockets.size})\n`
      );
    });
  });
}

function startStdioReadline(wss) {
  const rl = createInterface({ input: process.stdin });

  rl.on('line', async (line) => {
    if (!line.trim()) return;

    try {
      const message = JSON.parse(line);
      const response = await handleMessage(message, toolExecutor);
      stdout.write(JSON.stringify(response) + '\n');
    } catch (err) {
      stderr.write(`MCP parse error: ${err.message}\n`);
    }
  });

  rl.on('close', () => {
    wss.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    wss.close();
    process.exit(0);
  });
  process.on('SIGINT', () => {
    wss.close();
    process.exit(0);
  });
}

/** When port 8765 is already owned by another bridge process, forward MCP stdio over WS. */
function startStdioProxyClient() {
  const upstream = new WebSocket(`ws://127.0.0.1:${WS_PORT}/?role=stdio-proxy`);
  const pending = new Map();

  upstream.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type !== 'stdio_proxy_response') return;
      const entry = pending.get(msg.correlationId);
      if (!entry) return;
      pending.delete(msg.correlationId);
      if (msg.error) entry.reject(new Error(msg.error));
      else entry.resolve(msg.line);
    } catch (err) {
      stderr.write(`stdio proxy response error: ${err.message}\n`);
    }
  });

  upstream.on('open', () => {
    stderr.write(`stdio proxy attached to bridge on port ${WS_PORT}\n`);
    const rl = createInterface({ input: process.stdin });

    rl.on('line', async (line) => {
      if (!line.trim()) return;

      const correlationId = randomUUID();
      try {
        const out = await new Promise((resolve, reject) => {
          const t = setTimeout(() => {
            pending.delete(correlationId);
            reject(new Error('stdio proxy request timed out (60s)'));
          }, 60000);
          pending.set(correlationId, {
            resolve: (l) => {
              clearTimeout(t);
              resolve(l);
            },
            reject: (e) => {
              clearTimeout(t);
              reject(e);
            }
          });
          upstream.send(JSON.stringify({ type: 'stdio_proxy', correlationId, line }));
        });
        stdout.write(out + '\n');
      } catch (err) {
        stderr.write(`${err.message}\n`);
      }
    });

    rl.on('close', () => {
      upstream.close();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      upstream.close();
      process.exit(0);
    });
    process.on('SIGINT', () => {
      upstream.close();
      process.exit(0);
    });
  });

  upstream.on('error', (err) => {
    stderr.write(
      `stdio proxy WebSocket error: ${err.message}. Is another MCP bridge running on port ${WS_PORT}?\n`
    );
    process.exit(1);
  });
}

const wss = new WebSocketServer({ port: WS_PORT });
attachConnectionHandler(wss);

wss.on('listening', () => {
  stderr.write(`MCP Bridge WS server on port ${WS_PORT}\n`);
  startStdioReadline(wss);
});

wss.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    try {
      wss.close();
    } catch {
      /* ignore */
    }
    stderr.write(
      `Port ${WS_PORT} in use — stdio proxy mode (forwarding MCP to the running bridge)\n`
    );
    startStdioProxyClient();
  } else {
    stderr.write(`WS server error: ${err.message}\n`);
  }
});
