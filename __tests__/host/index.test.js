import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readNativeMessage, writeNativeMessage, createMessageBuffer } from '../../extension/host/native-messaging.js';
import { Readable, Writable } from 'stream';

function createReadableFromBuffers(buffers) {
  let index = 0;
  return new Readable({
    read() {
      if (index < buffers.length) {
        this.push(buffers[index++]);
      } else {
        this.push(null);
      }
    }
  });
}

function createWritableCollector() {
  const chunks = [];
  const writable = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk);
      callback();
    }
  });
  writable.getChunks = () => chunks;
  return writable;
}

describe('native-messaging', () => {
  describe('readNativeMessage', () => {
    it('reads a length-prefixed message from stdin', async () => {
      const msg = { jsonrpc: '2.0', id: 1, method: 'initialize' };
      const jsonBuf = Buffer.from(JSON.stringify(msg));
      const lengthBuf = Buffer.alloc(4);
      lengthBuf.writeUInt32LE(jsonBuf.length, 0);

      const stdin = createReadableFromBuffers([Buffer.concat([lengthBuf, jsonBuf])]);
      const result = await readNativeMessage(stdin);

      expect(result).toEqual(msg);
    });

    it('handles messages split across multiple chunks', async () => {
      const msg = { test: 'split message' };
      const jsonBuf = Buffer.from(JSON.stringify(msg));
      const lengthBuf = Buffer.alloc(4);
      lengthBuf.writeUInt32LE(jsonBuf.length, 0);

      const full = Buffer.concat([lengthBuf, jsonBuf]);
      const mid = Math.floor(full.length / 2);

      const stdin = createReadableFromBuffers([full.subarray(0, mid), full.subarray(mid)]);
      const result = await readNativeMessage(stdin);

      expect(result).toEqual(msg);
    });

    it('returns null on stream end', async () => {
      const stdin = createReadableFromBuffers([]);
      const result = await readNativeMessage(stdin);

      expect(result).toBeNull();
    });
  });

  describe('writeNativeMessage', () => {
    it('writes a length-prefixed message to stdout', () => {
      const stdout = createWritableCollector();
      const msg = { jsonrpc: '2.0', id: 1, result: { success: true } };

      writeNativeMessage(stdout, msg);

      const written = Buffer.concat(stdout.getChunks());
      const length = written.readUInt32LE(0);
      const json = written.subarray(4, 4 + length).toString('utf8');

      expect(JSON.parse(json)).toEqual(msg);
    });

    it('writes correct length prefix for small messages', () => {
      const stdout = createWritableCollector();
      const msg = { ok: true };

      writeNativeMessage(stdout, msg);

      const written = Buffer.concat(stdout.getChunks());
      const declaredLength = written.readUInt32LE(0);
      const actualJsonLength = Buffer.from(JSON.stringify(msg)).length;

      expect(declaredLength).toBe(actualJsonLength);
    });

    it('writes correct length prefix for large messages', () => {
      const stdout = createWritableCollector();
      const msg = { data: 'x'.repeat(10000) };

      writeNativeMessage(stdout, msg);

      const written = Buffer.concat(stdout.getChunks());
      const declaredLength = written.readUInt32LE(0);
      const actualJsonLength = Buffer.from(JSON.stringify(msg)).length;

      expect(declaredLength).toBe(actualJsonLength);
    });
  });

  describe('createMessageBuffer', () => {
    it('creates a buffer with 4-byte LE length prefix + JSON', () => {
      const msg = { hello: 'world' };
      const buf = createMessageBuffer(msg);

      expect(buf.readUInt32LE(0)).toBe(Buffer.from(JSON.stringify(msg)).length);
      expect(JSON.parse(buf.subarray(4).toString('utf8'))).toEqual(msg);
    });
  });
});
