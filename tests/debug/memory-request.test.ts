import { describe, expect, it, vi } from 'vitest';
import type { DebugProtocol } from '@vscode/debugprotocol';
import { handleMemorySnapshotRequest } from '../../src/debug/requests/memory-request';
import { createZ80Runtime } from '../../src/z80/runtime';

describe('memory-request', () => {
  it('forwards running state so the webview can enable paused memory editing', () => {
    const runtime = createZ80Runtime({
      memory: new Uint8Array(0x10000),
      startAddress: 0,
    });
    const response = {} as DebugProtocol.Response;
    const sendResponse = vi.fn();

    handleMemorySnapshotRequest(
      response,
      {
        views: [{ id: 'a', view: 'pc', after: 8 }],
      },
      {
        getRuntime: () => runtime,
        getRunning: () => false,
        getSymbolAnchors: () => [],
        getLookupAnchors: () => [],
        getSymbolList: () => [],
        sendResponse,
        sendErrorResponse: vi.fn(),
      }
    );

    expect(response.body).toMatchObject({
      running: false,
    });
    expect(sendResponse).toHaveBeenCalledWith(response);
  });
});
