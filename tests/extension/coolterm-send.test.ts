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

import {
  sendHexViaCoolTerm,
  testCoolTermConnection,
} from '../../src/extension/coolterm/coolterm-send';

function collectStatuses(): {
  statuses: string[];
  status: (message: string) => void;
} {
  const statuses: string[] = [];
  return {
    statuses,
    status: (message) => statuses.push(message),
  };
}

function foundHexArtifact(path: string): { kind: 'found'; path: string } {
  return { kind: 'found', path };
}

function missingHexArtifact(path: string): { kind: 'missing'; path: string } {
  return { kind: 'missing', path };
}

function passThroughProgress(): void {
  mocks.withProgress.mockImplementationOnce(async (_options, callback) => {
    const result = callback();
    await Promise.resolve(result);
    return result as boolean;
  });
}

describe('sendHexViaCoolTerm', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('completes after CoolTerm sends the HEX file without waiting for serial PASS text', async () => {
    const { statuses, status } = collectStatuses();
    mocks.resolveCoolTermHexArtifact.mockReturnValueOnce(
      foundHexArtifact('/workspace/build/demo.hex')
    );
    mocks.ping.mockResolvedValueOnce(undefined);
    mocks.connectSerialPort.mockResolvedValueOnce(true);
    mocks.sendTextFile.mockResolvedValueOnce(true);
    passThroughProgress();

    await expect(
      sendHexViaCoolTerm({
        rootPath: '/workspace',
        targetName: 'demo',
        status,
      })
    ).resolves.toBe(true);

    expect(mocks.sendTextFile).toHaveBeenCalledWith('/workspace/build/demo.hex');
    expect(mocks.poll).not.toHaveBeenCalled();
    expect(mocks.readAll).not.toHaveBeenCalled();
    expect(statuses).toContain('Sending demo.hex to the serial port...');
    expect(statuses.at(-1)).toBe('Sent demo.hex. Check the board display for PASS or ERROR.');
    expect(mocks.showInformationMessage).toHaveBeenCalledWith(
      'Debug80: demo.hex sent. Check the board display for PASS or ERROR.'
    );
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });

  it('reports a missing HEX artifact by file name only', async () => {
    const { statuses, status } = collectStatuses();
    mocks.resolveCoolTermHexArtifact.mockReturnValueOnce(
      missingHexArtifact('/workspace/build/demo.hex')
    );

    await expect(
      sendHexViaCoolTerm({
        rootPath: '/workspace',
        targetName: 'demo',
        status,
      })
    ).resolves.toBe(false);

    expect(statuses).toEqual(['HEX file demo.hex was not found. Build the selected target first.']);
    expect(mocks.showWarningMessage).toHaveBeenCalledWith(
      'Debug80: HEX file demo.hex was not found. Build the selected target first.'
    );
    expect(mocks.CoolTermRemoteClient).not.toHaveBeenCalled();
  });

  it('tests CoolTerm connectivity with an explicit ping', async () => {
    const { statuses, status } = collectStatuses();
    mocks.ping.mockResolvedValueOnce(undefined);

    await expect(
      testCoolTermConnection({
        status,
      })
    ).resolves.toBe(true);

    expect(statuses).toEqual([
      'Checking CoolTerm remote socket...',
      'Connected to CoolTerm remote socket.',
    ]);
    expect(mocks.showInformationMessage).toHaveBeenCalledWith(
      'Debug80: Connected to CoolTerm remote socket.'
    );
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });

  it('reports failed CoolTerm connectivity without sending a file', async () => {
    const { statuses, status } = collectStatuses();
    mocks.ping.mockRejectedValueOnce(new Error('connection refused'));

    await expect(
      testCoolTermConnection({
        status,
      })
    ).resolves.toBe(false);

    expect(statuses).toEqual([
      'Checking CoolTerm remote socket...',
      'CoolTerm is not available. Start CoolTerm and enable Remote Control Socket.',
    ]);
    expect(mocks.sendTextFile).not.toHaveBeenCalled();
    expect(mocks.showErrorMessage).toHaveBeenCalledWith(
      'Debug80: CoolTerm is not available. Start CoolTerm and enable Preferences > Scripting > Remote Control Socket on port 51413.'
    );
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });
});
