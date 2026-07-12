import * as net from 'net';

const PREAMBLE = 0x1f;
const ACK_SUCCESS = 0xff;

const OP_PING = 0;
const OP_CONNECT = 40;
const OP_DISCONNECT = 41;
const OP_POLL = 54;
const OP_READ_ALL = 56;
const OP_SEND_TEXTFILE = 90;

export type CoolTermRemoteClientOptions = {
  host?: string;
  port?: number;
  timeoutMs?: number;
};

type CoolTermPacket = {
  pid: number;
  ack: number;
  data: string;
};

class CoolTermRemoteError extends Error {
  constructor(
    message: string,
    public readonly ack?: number
  ) {
    super(message);
    this.name = 'CoolTermRemoteError';
  }
}

export class CoolTermRemoteClient {
  private socket: net.Socket | undefined;
  private nextPid = 1;
  private readonly host: string;
  private readonly port: number;
  private readonly timeoutMs: number;

  constructor(options: CoolTermRemoteClientOptions = {}) {
    this.host = options.host ?? '127.0.0.1';
    this.port = options.port ?? 51413;
    this.timeoutMs = options.timeoutMs ?? 3000;
  }

  async ping(): Promise<void> {
    await this.command(OP_PING);
  }

  async connectSerialPort(): Promise<boolean> {
    return (await this.command(OP_CONNECT)).trim() === 'True';
  }

  async disconnectSerialPort(): Promise<void> {
    await this.command(OP_DISCONNECT);
  }

  async sendTextFile(filePath: string): Promise<boolean> {
    return (await this.command(OP_SEND_TEXTFILE, filePath)).trim() === 'True';
  }

  async poll(): Promise<void> {
    await this.command(OP_POLL);
  }

  async readAll(): Promise<string> {
    return this.command(OP_READ_ALL);
  }

  dispose(): void {
    this.socket?.destroy();
    this.socket = undefined;
  }

  private async command(op: number, data = '', terminalId = 0): Promise<string> {
    const pid = this.allocatePid();
    const packet = encodePacket(pid, op, terminalId, data);
    const response = await this.sendPacket(packet);
    if (response.pid !== pid) {
      throw new CoolTermRemoteError(
        `CoolTerm returned packet id ${response.pid}, expected ${pid}.`
      );
    }
    if (response.ack !== ACK_SUCCESS) {
      throw new CoolTermRemoteError(
        `CoolTerm rejected command ${op} with ACK ${response.ack}.`,
        response.ack
      );
    }
    return response.data;
  }

  private allocatePid(): number {
    const pid = this.nextPid;
    this.nextPid = this.nextPid === 0xff ? 1 : this.nextPid + 1;
    return pid;
  }

  private async ensureSocket(): Promise<net.Socket> {
    if (this.socket !== undefined && !this.socket.destroyed) {
      return this.socket;
    }
    this.socket = await new Promise<net.Socket>((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(
          new CoolTermRemoteError(`Timed out connecting to CoolTerm at ${this.host}:${this.port}.`)
        );
      }, this.timeoutMs);
      socket.once('connect', () => {
        clearTimeout(timer);
        resolve(socket);
      });
      socket.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    return this.socket;
  }

  private async sendPacket(packet: Buffer): Promise<CoolTermPacket> {
    const socket = await this.ensureSocket();
    return new Promise<CoolTermPacket>((resolve, reject) => {
      let buffer = Buffer.alloc(0);
      const timer = setTimeout(() => {
        cleanup();
        reject(new CoolTermRemoteError('Timed out waiting for CoolTerm response.'));
      }, this.timeoutMs);
      const cleanup = (): void => {
        clearTimeout(timer);
        socket.off('data', onData);
        socket.off('error', onError);
      };
      const onError = (err: Error): void => {
        cleanup();
        reject(err);
      };
      const onData = (chunk: Buffer): void => {
        buffer = Buffer.concat([buffer, chunk]);
        const parsed = tryDecodePacket(buffer);
        if (parsed === undefined) {
          return;
        }
        cleanup();
        resolve(parsed);
      };
      socket.on('data', onData);
      socket.once('error', onError);
      socket.write(packet);
    });
  }
}

function encodePacket(pid: number, op: number, terminalId: number, data: string): Buffer {
  const dataBuffer = Buffer.from(data, 'utf8');
  const packet = Buffer.alloc(6 + dataBuffer.length);
  packet[0] = PREAMBLE;
  packet.writeUInt16LE(dataBuffer.length, 1);
  packet[3] = pid;
  packet[4] = op;
  packet[5] = terminalId;
  dataBuffer.copy(packet, 6);
  return packet;
}

function tryDecodePacket(buffer: Buffer): CoolTermPacket | undefined {
  if (buffer.length < 6) {
    return undefined;
  }
  if (buffer[0] !== PREAMBLE) {
    throw new CoolTermRemoteError('CoolTerm response had an invalid preamble.');
  }
  const dataLength = buffer.readUInt16LE(1);
  const packetLength = 6 + dataLength;
  if (buffer.length < packetLength) {
    return undefined;
  }
  return {
    pid: buffer[3]!,
    ack: buffer[4]!,
    data: buffer.subarray(6, packetLength).toString('utf8'),
  };
}
