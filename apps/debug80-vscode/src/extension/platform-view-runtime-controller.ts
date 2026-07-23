import type { DebugSessionStatus } from '../debug/session/session-status';
import type { PlatformId } from '../contracts/platform-view';
import type { PlatformViewRegistry, PlatformViewBundle } from './platform-view-registry';
import type { PlatformViewSessionState } from './platform-view-session-state';
import {
  buildPlatformViewSessionStatusMessage,
  clearPlatformViewSession,
  isCurrentPlatformViewSession,
  setPlatformViewSessionStatus,
  shouldAcceptPlatformViewSession,
} from './platform-view-session-state';
import {
  applyPlatformRuntimeUpdate,
  buildPlatformRuntimeClearMessage,
  clearPlatformRuntimeState,
} from './platform-view-runtime-state';
import { appendPlatformSerial, clearPlatformSerial } from './platform-view-serial-state';

export interface PlatformViewRuntimeController {
  appendSerial(platform: PlatformId, text: string, sessionId?: string): void;
  clear(): void;
  handleSessionTerminated(sessionId: string): void;
  setSessionStatus(status: DebugSessionStatus): void;
  update(platform: PlatformId, payload: unknown, sessionId?: string): void;
}

export function createPlatformViewRuntimeController(options: {
  sessionState: PlatformViewSessionState;
  registry: PlatformViewRegistry;
  getCurrentPlatform: () => PlatformId | undefined;
  getActiveBundle: (platform: string) => PlatformViewBundle | undefined;
  nextRevision: () => number;
  postMessage: (message: Record<string, unknown>) => void;
  stopAllPlatformRefresh: () => void;
}): PlatformViewRuntimeController {
  function setSessionStatus(status: DebugSessionStatus): void {
    setPlatformViewSessionStatus(options.sessionState, status);
    if (options.getCurrentPlatform() !== undefined) {
      options.postMessage(buildPlatformViewSessionStatusMessage(options.sessionState));
    }
  }

  function update(platform: PlatformId, payload: unknown, sessionId?: string): void {
    if (
      !shouldAcceptPlatformViewSession(options.sessionState, sessionId) ||
      options.getCurrentPlatform() !== platform
    ) {
      return;
    }
    const bundle = options.getActiveBundle(platform);
    if (bundle === undefined) {
      return;
    }
    options.postMessage(
      applyPlatformRuntimeUpdate(bundle.modules, bundle.state, payload, options.nextRevision())
    );
  }

  function appendSerial(platform: PlatformId, text: string, sessionId?: string): void {
    if (!shouldAcceptPlatformViewSession(options.sessionState, sessionId)) {
      return;
    }
    const bundle = options.getActiveBundle(platform);
    if (bundle === undefined) {
      return;
    }
    const message = appendPlatformSerial(bundle.state.serialBuffer, text, {
      platform,
      currentPlatform: options.getCurrentPlatform(),
    });
    if (message !== undefined) {
      options.postMessage(message);
    }
  }

  function clear(): void {
    options.registry.forEachState((_id, state, modules) => {
      if (modules !== undefined) {
        clearPlatformRuntimeState(modules, state);
      } else {
        clearPlatformSerial(state.serialBuffer);
      }
    });
    const platform = options.getCurrentPlatform();
    const bundle = platform !== undefined ? options.getActiveBundle(platform) : undefined;
    if (bundle === undefined) {
      return;
    }
    options.postMessage(
      buildPlatformRuntimeClearMessage(bundle.modules, bundle.state, options.nextRevision())
    );
    options.postMessage({ type: 'serialClear' });
  }

  function handleSessionTerminated(sessionId: string): void {
    if (!isCurrentPlatformViewSession(options.sessionState, sessionId)) {
      return;
    }
    clearPlatformViewSession(options.sessionState);
    setSessionStatus('not running');
    options.stopAllPlatformRefresh();
    clear();
  }

  return { appendSerial, clear, handleSessionTerminated, setSessionStatus, update };
}
