import * as net from 'net';
import { afterEach, describe, expect, it } from 'vitest';

import { CoolTermRemoteClient } from '../../src/extension/coolterm/coolterm-remote-client';

const ACK_SUCCESS = 0xff;
const COOLTERM_PACKET_MAGIC = 0x1f;
const FIRST_PACKET_ID = 0x01;
const OP_SEND_TEXTFILE = 90;
const TEST_HOST = '127.0.0.1';
const TEST_TIMEOUT_MS = 500;

async function withServer(
  handler: (socket: net.Socket) => void,
  test: (port: number) => Promise<void>
): Promise<void> {
  const server = net.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, TEST_HOST, resolve));
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
  packet[0] = COOLTERM_PACKET_MAGIC;
  packet.writeUInt16LE(dataBuffer.length, 1);
  packet[3] = pid;
  packet[4] = ACK_SUCCESS;
  packet[5] = 0xff;
  dataBuffer.copy(packet, 6);
  return packet;
}

function createClient(port: number): CoolTermRemoteClient {
  return new CoolTermRemoteClient({ host: TEST_HOST, port, timeoutMs: TEST_TIMEOUT_MS });
}

function expectPacketHeader(data: Buffer, pid: number, payloadLength: number): void {
  expect([...data.subarray(0, 6)]).toEqual([
    COOLTERM_PACKET_MAGIC,
    payloadLength & 0xff,
    (payloadLength >> 8) & 0xff,
    pid,
    0x00,
    0x00,
  ]);
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
          expectPacketHeader(data, FIRST_PACKET_ID, 0);
          socket.write(response(FIRST_PACKET_ID));
        });
      },
      async (port) => {
        const client = createClient(port);
        await client.ping();
        client.dispose();
      }
    );
  });

  it('sends a text file path with OP_SEND_TEXTFILE', async () => {
    await withServer(
      (socket) => {
        socket.once('data', (data) => {
          expect(data[4]).toBe(OP_SEND_TEXTFILE);
          expect(data.subarray(6).toString('utf8')).toBe('/tmp/out.hex');
          socket.write(response(data[3], 'True'));
        });
      },
      async (port) => {
        const client = createClient(port);
        await expect(client.sendTextFile('/tmp/out.hex')).resolves.toBe(true);
        client.dispose();
      }
    );
  });
});
