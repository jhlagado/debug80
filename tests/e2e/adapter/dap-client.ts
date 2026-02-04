import { Readable, Writable } from 'stream';

type DapMessage = {
  seq: number;
  type: 'request' | 'response' | 'event';
  command?: string;
  event?: string;
  request_seq?: number;
  success?: boolean;
  message?: string;
  body?: unknown;
};

type PendingRequest = {
  resolve: (value: DapMessage) => void;
  reject: (reason?: Error) => void;
  timer?: NodeJS.Timeout;
};

type PendingEvent = {
  event: string;
  predicate?: (payload: DapMessage) => boolean;
  resolve: (value: DapMessage) => void;
  reject: (reason?: Error) => void;
  timer?: NodeJS.Timeout;
};

export class DapClient {
  private readonly input: Writable;
  private readonly output: Readable;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly eventWaiters: PendingEvent[] = [];
  private readonly eventQueue: DapMessage[] = [];
  private buffer = Buffer.alloc(0);
  private seq = 1;

  constructor(input: Writable, output: Readable) {
    this.input = input;
    this.output = output;
    this.output.on('data', (chunk) => this.onData(chunk));
  }

  async sendRequest<T = DapMessage>(
    command: string,
    args?: Record<string, unknown>,
    timeoutMs = 5000
  ): Promise<T> {
    const seq = this.seq++;
    const request: DapMessage & { arguments?: Record<string, unknown> } = {
      seq,
      type: 'request',
      command,
      ...(args ? { arguments: args } : {}),
    };
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(seq);
        reject(new Error(`Timeout waiting for response to ${command}`));
      }, timeoutMs);
      this.pending.set(seq, {
        resolve: (msg) => resolve(msg as T),
        reject,
        timer,
      });
      try {
        this.writeMessage(request);
      } catch (err) {
        if (timer) {
          clearTimeout(timer);
        }
        this.pending.delete(seq);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  waitForEvent<T = DapMessage>(
    event: string,
    predicate?: (payload: DapMessage) => boolean,
    timeoutMs = 5000
  ): Promise<T> {
    const existingIndex = this.eventQueue.findIndex((msg) => {
      if (msg.type !== 'event' || msg.event !== event) {
        return false;
      }
      return predicate ? predicate(msg) : true;
    });
    if (existingIndex >= 0) {
      const [msg] = this.eventQueue.splice(existingIndex, 1);
      return Promise.resolve(msg as T);
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.eventWaiters.indexOf(waiter);
        if (idx >= 0) {
          this.eventWaiters.splice(idx, 1);
        }
        reject(new Error(`Timeout waiting for event ${event}`));
      }, timeoutMs);
      const waiter: PendingEvent = {
        event,
        predicate,
        resolve: (msg) => resolve(msg as T),
        reject,
        timer,
      };
      this.eventWaiters.push(waiter);
    });
  }

  dispose(): void {
    for (const [, pending] of this.pending) {
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      pending.reject(new Error('Client disposed'));
    }
    this.pending.clear();
    for (const waiter of this.eventWaiters) {
      if (waiter.timer) {
        clearTimeout(waiter.timer);
      }
      waiter.reject(new Error('Client disposed'));
    }
    this.eventWaiters.splice(0, this.eventWaiters.length);
  }

  private writeMessage(message: DapMessage & { arguments?: unknown }): void {
    const json = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n`;
    this.input.write(header + json, 'utf8');
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        return;
      }
      const header = this.buffer.slice(0, headerEnd).toString('utf8');
      const match = /Content-Length: (\d+)/i.exec(header);
      if (!match) {
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }
      const length = Number.parseInt(match[1] ?? '0', 10);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (this.buffer.length < bodyEnd) {
        return;
      }
      const body = this.buffer.slice(bodyStart, bodyEnd).toString('utf8');
      this.buffer = this.buffer.slice(bodyEnd);
      const message = JSON.parse(body) as DapMessage;
      this.handleMessage(message);
    }
  }

  private handleMessage(message: DapMessage): void {
    if (message.type === 'response') {
      const requestSeq = message.request_seq;
      if (requestSeq === undefined) {
        return;
      }
      const pending = this.pending.get(requestSeq);
      if (!pending) {
        return;
      }
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      this.pending.delete(requestSeq);
      if (message.success === false) {
        pending.reject(new Error(message.message ?? 'DAP error response'));
      } else {
        pending.resolve(message);
      }
      return;
    }

    if (message.type === 'event') {
      const waiterIndex = this.eventWaiters.findIndex((waiter) => {
        if (waiter.event !== message.event) {
          return false;
        }
        return waiter.predicate ? waiter.predicate(message) : true;
      });
      if (waiterIndex >= 0) {
        const waiter = this.eventWaiters.splice(waiterIndex, 1)[0];
        if (waiter.timer) {
          clearTimeout(waiter.timer);
        }
        waiter.resolve(message);
        return;
      }
      this.eventQueue.push(message);
    }
  }
}
