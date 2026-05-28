import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const ping = vi.fn();
  const connectSerialPort = vi.fn();
  const sendTextFile = vi.fn();
  const poll = vi.fn();
  const readAll = vi.fn();
  const dispose = vi.fn();
  const showInformationMessage = vi.fn();
  const showErrorMessage = vi.fn();
  const showWarningMessage = vi.fn();
  const withProgress = vi.fn();
  const resolveCoolTermHexArtifact = vi.fn();
  const CoolTermRemoteClient = vi.fn(function MockCoolTermRemoteClient() {
    return {
      ping,
      connectSerialPort,
      sendTextFile,
      poll,
      readAll,
      dispose,
    };
  });
  return {
    CoolTermRemoteClient,
    connectSerialPort,
    dispose,
    ping,
    poll,
    readAll,
    resolveCoolTermHexArtifact,
    sendTextFile,
    showErrorMessage,
    showInformationMessage,
    showWarningMessage,
    withProgress,
  };
});

vi.mock('vscode', () => ({
  ProgressLocation: { Notification: 1 },
  window: {
    showErrorMessage: mocks.showErrorMessage,
    showInformationMessage: mocks.showInformationMessage,
    showWarningMessage: mocks.showWarningMessage,
    withProgress: mocks.withProgress,
  },
}));

vi.mock('../../src/extension/coolterm/coolterm-hex-artifact', () => ({
  resolveCoolTermHexArtifact: mocks.resolveCoolTermHexArtifact,
}));

vi.mock('../../src/extension/coolterm/coolterm-remote-client', () => ({
  CoolTermRemoteClient: mocks.CoolTermRemoteClient,
}));

import { sendHexViaCoolTerm } from '../../src/extension/coolterm/coolterm-send';

describe('sendHexViaCoolTerm', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('completes after CoolTerm sends the HEX file without waiting for serial PASS text', async () => {
    const statuses: string[] = [];
    mocks.resolveCoolTermHexArtifact.mockReturnValueOnce({
      kind: 'found',
      path: '/workspace/build/demo.hex',
    });
    mocks.ping.mockResolvedValueOnce(undefined);
    mocks.connectSerialPort.mockResolvedValueOnce(true);
    mocks.sendTextFile.mockResolvedValueOnce(true);
    mocks.withProgress.mockImplementationOnce(async (_options, callback) => {
      const result = callback();
      await Promise.resolve(result);
      return result as boolean;
    });

    await expect(
      sendHexViaCoolTerm({
        rootPath: '/workspace',
        targetName: 'demo',
        status: (message) => statuses.push(message),
      })
    ).resolves.toBe(true);

    expect(mocks.sendTextFile).toHaveBeenCalledWith('/workspace/build/demo.hex');
    expect(mocks.poll).not.toHaveBeenCalled();
    expect(mocks.readAll).not.toHaveBeenCalled();
    expect(statuses.at(-1)).toBe('Sent demo.hex. Check the board display for PASS or ERROR.');
    expect(mocks.showInformationMessage).toHaveBeenCalledWith(
      'Debug80: demo.hex sent. Check the board display for PASS or ERROR.'
    );
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });
});
