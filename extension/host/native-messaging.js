export function createMessageBuffer(msg) {
  const json = JSON.stringify(msg);
  const jsonBuf = Buffer.from(json, 'utf8');
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32LE(jsonBuf.length, 0);
  return Buffer.concat([lengthBuf, jsonBuf]);
}

export function writeNativeMessage(stdout, msg) {
  stdout.write(createMessageBuffer(msg));
}

export function readNativeMessage(stdin) {
  return new Promise((resolve) => {
    let buffer = Buffer.alloc(0);
    let messageLength = null;

    function onData(chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      tryParse();
    }

    function tryParse() {
      if (messageLength === null && buffer.length >= 4) {
        messageLength = buffer.readUInt32LE(0);
        buffer = buffer.subarray(4);
      }

      if (messageLength !== null && buffer.length >= messageLength) {
        const json = buffer.subarray(0, messageLength).toString('utf8');
        cleanup();
        resolve(JSON.parse(json));
      }
    }

    function onEnd() {
      cleanup();
      resolve(null);
    }

    function cleanup() {
      stdin.removeListener('data', onData);
      stdin.removeListener('end', onEnd);
    }

    stdin.on('data', onData);
    stdin.on('end', onEnd);

    // If stream already ended
    if (stdin.readableEnded) {
      cleanup();
      resolve(null);
    }
  });
}
