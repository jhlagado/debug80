/**
 * @file Regression tests for platform view serial file workflows.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const showOpenDialog = vi.fn();
  const showSaveDialog = vi.fn();
  const showErrorMessage = vi.fn();
  const showWarningMessage = vi.fn();
  const showInformationMessage = vi.fn();
  const readFile = vi.fn();
  const writeFile = vi.fn();
  const withProgress = vi.fn();
  const customRequest = vi.fn(() => Promise.resolve(undefined));
  return {
    showOpenDialog,
    showSaveDialog,
    showErrorMessage,
    showWarningMessage,
    showInformationMessage,
    readFile,
    writeFile,
    withProgress,
    activeDebugSession: { type: 'z80', customRequest },
    customRequest,
  };
});

vi.mock('vscode', () => ({
  ProgressLocation: { Notification: 1 },
  debug: { activeDebugSession: mocks.activeDebugSession },
  window: {
    showOpenDialog: mocks.showOpenDialog,
    showSaveDialog: mocks.showSaveDialog,
    showErrorMessage: mocks.showErrorMessage,
    showWarningMessage: mocks.showWarningMessage,
    showInformationMessage: mocks.showInformationMessage,
    withProgress: mocks.withProgress,
  },
  workspace: {
    fs: {
      readFile: mocks.readFile,
      writeFile: mocks.writeFile,
    },
  },
}));

import {
  handlePlatformSerialSave,
  handlePlatformSerialSendFile,
} from '../../src/extension/platform-view-serial-actions';

describe('platform-view serial actions', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mocks.customRequest.mockClear();
    vi.restoreAllMocks();
  });

  it('streams selected file bytes to the TEC-1 serial input', async () => {
    const fileUri = { path: '/tmp/send.txt' };
    mocks.showOpenDialog.mockResolvedValueOnce([fileUri]);
    mocks.readFile.mockResolvedValueOnce(new TextEncoder().encode('AB'));
    mocks.withProgress.mockImplementationOnce(async (_opts, callback: (progress: { report: (value: unknown) => void }, token: { isCancellationRequested: boolean }) => Promise<void> | void) => {
      await callback(
        {
          report: vi.fn<(value: unknown) => void>(),
        },
        {
          isCancellationRequested: false,
        }
      );
    });
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: TimerHandler) => {
      if (typeof callback === 'function') {
        callback();
      }
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    await handlePlatformSerialSendFile({
      getSession: () => mocks.activeDebugSession,
      getPlatform: () => 'tec1',
    });

    expect(mocks.customRequest).toHaveBeenCalledWith('debug80/tec1SerialInput', {
      text: 'A',
    });
    expect(mocks.customRequest).toHaveBeenCalledWith('debug80/tec1SerialInput', {
      text: 'B',
    });
    expect(mocks.customRequest).toHaveBeenCalledWith('debug80/tec1SerialInput', {
      text: '\r',
    });
    expect(mocks.showInformationMessage).toHaveBeenCalledWith('Debug80: Sent 3 characters.');
  });

  it('saves serial text using HEX filters when the buffer looks like Intel HEX', async () => {
    mocks.showSaveDialog.mockResolvedValueOnce({ path: '/tmp/out.hex' });
    await handlePlatformSerialSave(':00000001FF\n');

    expect(mocks.showSaveDialog).toHaveBeenCalledWith({
      filters: { 'Intel HEX': ['hex'], 'Text Files': ['txt'] },
      title: 'Save serial output',
    });
    expect(mocks.writeFile).toHaveBeenCalledTimes(1);
  });

  it('warns when the serial buffer is empty', async () => {
    await handlePlatformSerialSave('');

    expect(mocks.showWarningMessage).toHaveBeenCalledWith('Debug80: Serial buffer is empty.');
    expect(mocks.showSaveDialog).not.toHaveBeenCalled();
  });
});
