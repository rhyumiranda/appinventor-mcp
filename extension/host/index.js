#!/usr/bin/env node

import { handleMessage } from '../lib/mcp-handler.js';
import { createInterface } from 'readline';
import { WebSocketServer } from 'ws';

const WS_PORT = 8765;
const stdout = process.stdout;
const stderr = process.stderr;

// Track ALL connected sockets — broadcast to all, first response wins
const connectedSockets = new Set();
const pendingRequests = new Map();
let requestCounter = 0;

// --- WebSocket server for Chrome extension ---
const wss = new WebSocketServer({ port: WS_PORT });

wss.on('listening', () => {
  stderr.write(`MCP Bridge WS server on port ${WS_PORT}\n`);
});

wss.on('connection', (ws) => {
  stderr.write(`Chrome connection opened (total: ${connectedSockets.size + 1})\n`);
  connectedSockets.add(ws);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'ping') return; // ignore keepalive
      // Response from extension for a pending request
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
    stderr.write(`Chrome connection closed (remaining: ${connectedSockets.size})\n`);
  });
});

wss.on('error', (err) => {
  stderr.write(`WS server error: ${err.message}\n`);
});

// --- Tool executor: broadcasts to ALL connections, first response wins ---
async function toolExecutor(toolName, args) {
  const liveSockets = [...connectedSockets].filter(ws => ws.readyState === 1);
  if (liveSockets.length === 0) {
    return { success: false, error: 'Chrome extension not connected. Open App Inventor in Chrome with the extension enabled.' };
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
      try { ws.send(payload); } catch {}
    }
  });
}

// --- MCP stdio transport: newline-delimited JSON ---
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

process.on('SIGTERM', () => { wss.close(); process.exit(0); });
process.on('SIGINT', () => { wss.close(); process.exit(0); });
