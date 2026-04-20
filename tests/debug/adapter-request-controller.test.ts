import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));

import { Handles } from '@vscode/debugadapter';
import { AdapterRequestController } from '../../src/debug/requests/adapter-request-controller';
import { createSessionState } from '../../src/debug/session/session-state';
import * as runtimeControl from '../../src/debug/session/runtime-control';
import { VariableService } from '../../src/debug/requests/variable-service';
import { createZ80Runtime } from '../../src/z80/runtime';

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

describe('AdapterRequestController setVariableRequest', () => {
  it('updates a writable register and returns the formatted value', () => {
    const sessionState = createSessionState();
    sessionState.runtime = createZ80Runtime({
      memory: new Uint8Array(0x10000),
      startAddress: 0,
    });
    sessionState.runState.isRunning = false;

    const handles = new Handles<string>();
    const variableService = new VariableService(handles);
    const registersRef = variableService.createScopes()[0]?.variablesReference ?? 0;

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
      variableService,
      commandRouter: { handle: vi.fn(() => false) } as never,
      platformRegistry: { clear: vi.fn(), getHandler: vi.fn() } as never,
      sendResponse: vi.fn(),
      sendErrorResponse: vi.fn(),
      sendEvent: vi.fn(),
      getRuntimeControlContext: vi.fn(),
    };

    const controller = new AdapterRequestController(deps as never);
    controller.setVariableRequest({} as never, {
      variablesReference: registersRef,
      name: 'DE',
      value: '0x0102',
    });

    expect(deps.sendErrorResponse).not.toHaveBeenCalled();
    expect(deps.sendResponse).toHaveBeenCalledTimes(1);
    const responseArg = deps.sendResponse.mock.calls[0]?.[0] as { body?: { value?: string } };
    expect(responseArg.body?.value).toBe('0x0102');
    const cpu = sessionState.runtime.getRegisters();
    expect(cpu.d).toBe(0x01);
    expect(cpu.e).toBe(0x02);
  });

  it('rejects setVariable for read-only register names', () => {
    const sessionState = createSessionState();
    sessionState.runtime = createZ80Runtime({
      memory: new Uint8Array(0x10000),
      startAddress: 0,
    });
    sessionState.runState.isRunning = false;

    const handles = new Handles<string>();
    const variableService = new VariableService(handles);
    const registersRef = variableService.createScopes()[0]?.variablesReference ?? 0;

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
      variableService,
      commandRouter: { handle: vi.fn(() => false) } as never,
      platformRegistry: { clear: vi.fn(), getHandler: vi.fn() } as never,
      sendResponse: vi.fn(),
      sendErrorResponse: vi.fn(),
      sendEvent: vi.fn(),
      getRuntimeControlContext: vi.fn(),
    };

    const controller = new AdapterRequestController(deps as never);
    controller.setVariableRequest({} as never, {
      variablesReference: registersRef,
      name: 'AF',
      value: '0x0000',
    });

    expect(deps.sendResponse).not.toHaveBeenCalled();
    expect(deps.sendErrorResponse).toHaveBeenCalledTimes(1);
  });
});
