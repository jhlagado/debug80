import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));

import { Handles } from '@vscode/debugadapter';
import { AdapterRequestController } from '../../src/debug/requests/adapter-request-controller';
import { createSessionState } from '../../src/debug/session/session-state';
import * as runtimeControl from '../../src/debug/session/runtime-control';
import { VariableService } from '../../src/debug/requests/variable-service';
import { createZ80Runtime } from '../../src/z80/runtime';

afterEach(() => {
  vi.restoreAllMocks();
});

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
      getCallDepth: () => sessionState.runState.callDepth,
      setCallDepth: (depth: number) => {
        sessionState.runState.callDepth = depth;
      },
      getPauseRequested: () => false,
      setPauseRequested: (value: boolean) => {
        sessionState.runState.pauseRequested = value;
      },
      getRunning: () => sessionState.runState.isRunning,
      setRunning: (value: boolean) => {
        sessionState.runState.isRunning = value;
      },
      getSkipBreakpointOnce: () => sessionState.runState.skipBreakpointOnce,
      setSkipBreakpointOnce: (address: number | null) => {
        sessionState.runState.skipBreakpointOnce = address;
      },
      getHaltNotified: () => sessionState.runState.haltNotified,
      setHaltNotified: (value: boolean) => {
        sessionState.runState.haltNotified = value;
      },
      setLastStopReason: (reason: string) => {
        sessionState.runState.lastStopReason = reason;
      },
      setLastBreakpointAddress: (address: number | null) => {
        sessionState.runState.lastBreakpointAddress = address;
      },
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

describe('AdapterRequestController single-step flow', () => {
  it('sends the next response before the stopped event for a plain step', () => {
    const { controller, deps, sessionState } = createController();
    sessionState.runtime = {
      getPC: () => 0,
      step: ({ trace }: { trace: { taken: boolean } }) => {
        trace.taken = false;
        return { halted: false, cycles: 1 };
      },
    } as never;

    controller.nextRequest({} as never, {} as never);

    expect(deps.sendResponse).toHaveBeenCalledTimes(1);
    expect(deps.sendEvent).toHaveBeenCalledTimes(1);
    expect(deps.sendResponse.mock.invocationCallOrder[0]).toBeLessThan(
      deps.sendEvent.mock.invocationCallOrder[0] ?? 0
    );
    expect(sessionState.runState.isRunning).toBe(false);
    expect(sessionState.runState.lastStopReason).toBe('step');
  });

  it('sends the next response before starting step-over continuation', () => {
    const runUntilStopSpy = vi
      .spyOn(runtimeControl, 'runUntilStopAsync')
      .mockResolvedValue(undefined);
    const { controller, deps, sessionState } = createController();
    sessionState.runState.stepOverMaxInstructions = 123;
    sessionState.runtime = {
      getPC: () => 0,
      step: ({ trace }: { trace: { kind?: string; taken: boolean; returnAddress?: number } }) => {
        trace.kind = 'call';
        trace.taken = true;
        trace.returnAddress = 0x3456;
        return { halted: false, cycles: 1 };
      },
    } as never;

    controller.nextRequest({} as never, {} as never);

    expect(deps.sendResponse).toHaveBeenCalledTimes(1);
    expect(runUntilStopSpy).toHaveBeenCalledWith(expect.anything(), {
      extraBreakpoints: new Set([0x3456]),
      maxInstructions: 123,
      limitLabel: 'step over',
    });
    expect(deps.sendResponse.mock.invocationCallOrder[0]).toBeLessThan(
      runUntilStopSpy.mock.invocationCallOrder[0] ?? 0
    );
    expect(deps.sendEvent).not.toHaveBeenCalled();
    expect(sessionState.runState.isRunning).toBe(true);
    expect(sessionState.runState.callDepth).toBe(1);
  });

  it('sends the step-in response before the stopped event for a plain step', () => {
    const { controller, deps, sessionState } = createController();
    sessionState.runtime = {
      getPC: () => 0,
      step: ({ trace }: { trace: { taken: boolean } }) => {
        trace.taken = false;
        return { halted: false, cycles: 1 };
      },
    } as never;

    controller.stepInRequest({} as never, {} as never);

    expect(deps.sendResponse).toHaveBeenCalledTimes(1);
    expect(deps.sendEvent).toHaveBeenCalledTimes(1);
    expect(deps.sendResponse.mock.invocationCallOrder[0]).toBeLessThan(
      deps.sendEvent.mock.invocationCallOrder[0] ?? 0
    );
    expect(sessionState.runState.isRunning).toBe(false);
    expect(sessionState.runState.lastStopReason).toBe('step');
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

  it('writes AF through setVariable', () => {
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
      value: '0xA5C3',
    });

    expect(deps.sendErrorResponse).not.toHaveBeenCalled();
    expect(deps.sendResponse).toHaveBeenCalledTimes(1);
    const cpu = sessionState.runtime.getRegisters();
    expect(cpu.a).toBe(0xa5);
    expect(cpu.flags.S).toBe(1);
    expect(cpu.flags.Z).toBe(1);
    expect(cpu.flags.N).toBe(1);
    expect(cpu.flags.C).toBe(1);
  });
});
