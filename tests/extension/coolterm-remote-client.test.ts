import * as net from 'net';
import { afterEach, describe, expect, it } from 'vitest';

import { CoolTermRemoteClient } from '../../src/extension/coolterm/coolterm-remote-client';

const ACK_SUCCESS = 0xff;

async function withServer(
  handler: (socket: net.Socket) => void,
  test: (port: number) => Promise<void>
): Promise<void> {
  const server = net.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected TCP test server address');
  }
  try {
    await test(address.port);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

function response(pid: number, data = ''): Buffer {
  const dataBuffer = Buffer.from(data, 'utf8');
  const packet = Buffer.alloc(6 + dataBuffer.length);
  packet[0] = 0x1f;
  packet.writeUInt16LE(dataBuffer.length, 1);
  packet[3] = pid;
  packet[4] = ACK_SUCCESS;
  packet[5] = 0xff;
  dataBuffer.copy(packet, 6);
  return packet;
}

describe('CoolTermRemoteClient', () => {
  afterEach(() => {
    // Keep tests from hanging on any leaked timers in failed socket flows.
    process.removeAllListeners('uncaughtException');
  });

  it('sends a CoolTerm ping packet and accepts ACK_SUCCESS', async () => {
    await withServer(
      (socket) => {
        socket.once('data', (data) => {
          expect([...data]).toEqual([0x1f, 0x00, 0x00, 0x01, 0x00, 0x00]);
          socket.write(response(0x01));
        });
      },
      async (port) => {
        const client = new CoolTermRemoteClient({ host: '127.0.0.1', port, timeoutMs: 500 });
        await client.ping();
        client.dispose();
      }
    );
  });

  it('sends a text file path with OP_SEND_TEXTFILE', async () => {
    await withServer(
      (socket) => {
        socket.once('data', (data) => {
          expect(data[4]).toBe(90);
          expect(data.subarray(6).toString('utf8')).toBe('/tmp/out.hex');
          socket.write(response(data[3], 'True'));
        });
      },
      async (port) => {
        const client = new CoolTermRemoteClient({ host: '127.0.0.1', port, timeoutMs: 500 });
        await expect(client.sendTextFile('/tmp/out.hex')).resolves.toBe(true);
        client.dispose();
      }
    );
  });
});
