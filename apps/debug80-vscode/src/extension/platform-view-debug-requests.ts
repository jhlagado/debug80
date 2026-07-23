import type * as vscode from 'vscode';
import type { PlatformId } from '../contracts/platform-view';
import type { Logger } from '../util/logger';
import type { buildMemorySnapshotPayload } from './platform-view-memory-refresh';
import {
  resolvePlatformViewDebugSession,
  type PlatformViewSessionState,
} from './platform-view-session-state';

export function releaseTec1gPanelInputs(options: {
  currentPlatform: PlatformId | undefined;
  sessionState: PlatformViewSessionState;
  activeSession: vscode.DebugSession | undefined;
  logger: Logger;
}): void {
  if (options.currentPlatform !== 'tec1g') {
    return;
  }
  const session = resolvePlatformViewDebugSession(options.sessionState, options.activeSession);
  if (session?.type !== 'z80') {
    return;
  }
  void Promise.resolve(session.customRequest('debug80/tec1gReleaseInputs')).catch(
    (error: unknown) => {
      options.logger.warn('Debug80 failed to release TEC-1G panel inputs', {
        error: String(error),
      });
    }
  );
}

export async function requestPlatformViewMemorySnapshot(options: {
  viewAvailable: boolean;
  sessionState: PlatformViewSessionState;
  activeSession: vscode.DebugSession | undefined;
  command: 'debug80/memorySnapshot';
  payload: ReturnType<typeof buildMemorySnapshotPayload>;
  postMessage: (message: Record<string, unknown>) => void;
}): Promise<void> {
  if (!options.viewAvailable) {
    throw new Error('Debug80: view unavailable');
  }
  const target = resolvePlatformViewDebugSession(options.sessionState, options.activeSession);
  if (target?.type !== 'z80') {
    throw new Error('Debug80: No active z80 session.');
  }
  const snapshot = (await target.customRequest(options.command, {
    before: 16,
    rowSize: 16,
    views: options.payload.views,
  })) as unknown;
  if (snapshot === null || snapshot === undefined || typeof snapshot !== 'object') {
    throw new Error('Debug80: Invalid snapshot payload.');
  }
  options.postMessage({ type: 'snapshot', ...(snapshot as Record<string, unknown>) });
}
