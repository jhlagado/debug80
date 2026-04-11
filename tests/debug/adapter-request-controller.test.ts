import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));

import { AdapterRequestController } from '../../src/debug/adapter-request-controller';
import { createSessionState } from '../../src/debug/session-state';
import * as runtimeControl from '../../src/debug/runtime-control';

function createController() {
  const sessionState = createSessionState();
  const deps = {
    threadId: 1,
    breakpointManager: {
      setPending: vi.fn(),
      applyForSource: vi.fn(),
      rebuild: vi.fn(),
      hasAddress: vi.fn(() => false),
    },
    sourceState: {} as never,
    sessionState,
    platformState: { active: 'simple' },
    variableService: {
      createScopes: vi.fn(),
      resolveVariables: vi.fn(),
    } as never,
    commandRouter: {
      handle: vi.fn(() => false),
    } as never,
    platformRegistry: {
      clear: vi.fn(),
      getHandler: vi.fn(),
    } as never,
    sendResponse: vi.fn(),
    sendErrorResponse: vi.fn(),
    sendEvent: vi.fn(),
    getRuntimeControlContext: vi.fn(() => ({
      getRuntime: () => sessionState.runtime,
      getRuntimeCapabilities: () => undefined,
      getActivePlatform: () => 'simple',
      getCallDepth: () => 0,
      setCallDepth: () => undefined,
      getPauseRequested: () => false,
      setPauseRequested: () => undefined,
      getRunning: () => false,
      setRunning: () => undefined,
      getSkipBreakpointOnce: () => null,
      setSkipBreakpointOnce: () => undefined,
      getHaltNotified: () => false,
      setHaltNotified: () => undefined,
      setLastStopReason: () => undefined,
      setLastBreakpointAddress: () => undefined,
      isBreakpointAddress: () => false,
      handleHaltStop: () => undefined,
      sendEvent: () => undefined,
    })),
  };
  return { controller: new AdapterRequestController(deps as never), deps, sessionState };
}

describe('adapter-request-controller startup sequencing', () => {
  it('defers auto-run until launch is complete when configurationDone arrives early', () => {
    const runUntilStopSpy = vi
      .spyOn(runtimeControl, 'runUntilStopAsync')
      .mockResolvedValue(undefined);
    const { controller, sessionState, deps } = createController();

    sessionState.runState.stopOnEntry = false;
    controller.configurationDoneRequest({} as never, {} as never);

    expect(deps.sendResponse).toHaveBeenCalledTimes(1);
    expect(sessionState.runState.configurationDone).toBe(true);
    expect(runUntilStopSpy).not.toHaveBeenCalled();

    sessionState.runtime = {
      getPC: () => 0,
      step: () => ({ halted: false, cycles: 1 }),
    } as never;

    controller.markLaunchComplete();
    controller.startConfiguredExecutionIfReady();

    expect(runUntilStopSpy).toHaveBeenCalledTimes(1);
  });

  it('does not auto-run after early configurationDone when stopOnEntry is enabled', () => {
    const runUntilStopSpy = vi
      .spyOn(runtimeControl, 'runUntilStopAsync')
      .mockResolvedValue(undefined);
    const { controller, sessionState } = createController();

    sessionState.runState.stopOnEntry = true;
    controller.configurationDoneRequest({} as never, {} as never);
    controller.markLaunchComplete();
    controller.startConfiguredExecutionIfReady();

    expect(runUntilStopSpy).not.toHaveBeenCalled();
  });
});
