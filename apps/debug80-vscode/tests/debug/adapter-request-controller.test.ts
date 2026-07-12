import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));

import { Handles } from '@vscode/debugadapter';
import type { DebugProtocol } from '@vscode/debugprotocol';
import { AdapterRequestController } from '../../src/debug/requests/adapter-request-controller';
import { createSessionState } from '../../src/debug/session/session-state';
import * as runtimeControl from '../../src/debug/session/runtime-control';
import { VariableService } from '../../src/debug/requests/variable-service';
import { createZ80Runtime } from '@jhlagado/debug80-runtime/z80/runtime';

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
      getCondition: vi.fn(() => undefined),
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
      getSkipBreakpointAddressSpace: () => sessionState.runState.skipBreakpointAddressSpace,
      setSkipBreakpointAddressSpace: (addressSpace) => {
        sessionState.runState.skipBreakpointAddressSpace = addressSpace;
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
      setLastBreakpointAddressSpace: (addressSpace) => {
        sessionState.runState.lastBreakpointAddressSpace = addressSpace;
      },
      getAddressSpace: () => undefined,
      getBreakpointAddressSpace: () => undefined,
      isBreakpointAddress: () => false,
      handleHaltStop: () => undefined,
      sendEvent: () => undefined,
    })),
  };
  return { controller: new AdapterRequestController(deps as never), deps, sessionState };
}

function createSetVariableController() {
  const sessionState = createSessionState();
  sessionState.runtime = createTestRuntime();
  sessionState.runState.isRunning = false;

  const handles = new Handles<string>();
  const variableService = new VariableService(handles);
  const registersRef = handles.create('registers');

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

  return {
    controller: new AdapterRequestController(deps as never),
    deps,
    registersRef,
    sessionState,
  };
}

function createTestRuntime() {
  return createZ80Runtime({
    memory: new Uint8Array(0x10000),
    startAddress: 0,
  });
}

function enableBreakpoint(
  fixture: ReturnType<typeof createController>,
  address: number,
  condition?: string
) {
  fixture.sessionState.runtime = createTestRuntime();
  fixture.deps.breakpointManager.hasAddress.mockImplementation(
    (candidate: number) => candidate === address
  );
  if (condition !== undefined) {
    fixture.deps.breakpointManager.getCondition.mockReturnValue(condition);
  }
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

describe('adapter-request-controller conditional breakpoints', () => {
  it('stops when a breakpoint has no condition', () => {
    const { controller, deps } = createController();
    deps.breakpointManager.hasAddress.mockImplementation((address: number) => address === 0x1234);

    expect(controller.shouldStopAtBreakpoint(0x1234)).toBe(true);
  });

  it('matches TEC-1G expansion breakpoints against the active physical bank', () => {
    const { controller, deps, sessionState } = createController();
    deps.platformState.active = 'tec1g';
    sessionState.tec1gRuntime = {
      state: {
        system: {
          expandEnabled: true,
          memoryExpansionPhysicalBank: 0,
        },
      },
    } as never;
    deps.breakpointManager.hasAddress.mockImplementation(
      (_address: number, addressSpace?: { kind: string; physicalBank: number }) =>
        addressSpace?.kind === 'tec1g-expansion' && addressSpace.physicalBank === 0
    );

    expect(controller.shouldStopAtBreakpoint(0x8000)).toBe(true);

    sessionState.tec1gRuntime.state.system.memoryExpansionPhysicalBank = 3;

    expect(controller.shouldStopAtBreakpoint(0x8000)).toBe(false);
  });

  it('sets breakpoint skip after continuing from a TEC-1G expansion bank breakpoint', () => {
    const runUntilStopSpy = vi
      .spyOn(runtimeControl, 'runUntilStopAsync')
      .mockResolvedValue(undefined);
    const { controller, deps, sessionState } = createController();
    deps.platformState.active = 'tec1g';
    sessionState.runtime = createTestRuntime();
    sessionState.runtime.cpu.pc = 0x8000;
    sessionState.runState.lastStopReason = 'breakpoint';
    sessionState.runState.lastBreakpointAddress = 0x8000;
    sessionState.runState.lastBreakpointAddressSpace = {
      kind: 'tec1g-expansion',
      physicalBank: 0,
    };
    sessionState.tec1gRuntime = {
      state: {
        system: {
          expandEnabled: true,
          memoryExpansionPhysicalBank: 0,
        },
      },
    } as never;
    deps.breakpointManager.hasAddress.mockImplementation(
      (_address: number, addressSpace?: { kind: string; physicalBank: number }) =>
        addressSpace?.kind === 'tec1g-expansion' && addressSpace.physicalBank === 0
    );

    controller.continueRequest({} as never, {} as never);

    expect(sessionState.runState.skipBreakpointOnce).toBe(0x8000);
    expect(runUntilStopSpy).toHaveBeenCalledTimes(1);
  });

  it('evaluates breakpoint conditions with the watch expression language', () => {
    const fixture = createController();
    const { controller, deps, sessionState } = fixture;
    enableBreakpoint(fixture, 0x1234, 'zero and A eq $20');
    sessionState.runtime.cpu.a = 0x20;
    sessionState.runtime.cpu.flags.Z = 1;

    expect(controller.shouldStopAtBreakpoint(0x1234)).toBe(true);

    deps.breakpointManager.getCondition.mockReturnValue('carry');

    expect(controller.shouldStopAtBreakpoint(0x1234)).toBe(false);
  });

  it('skips and reports a helpful diagnostic when a breakpoint condition cannot be evaluated', () => {
    const fixture = createController();
    const { controller, deps } = fixture;
    enableBreakpoint(fixture, 0x1234, 'UNKNOWN_SYMBOL eq 1');

    expect(controller.shouldStopAtBreakpoint(0x1234)).toBe(false);
    expect(deps.sendEvent).toHaveBeenCalledTimes(1);
    const event = deps.sendEvent.mock.calls[0]?.[0] as { body?: { output?: string } };
    expect(event.body?.output).toContain(
      'Debug80: Invalid conditional breakpoint expression "UNKNOWN_SYMBOL eq 1".'
    );
    expect(event.body?.output).toContain('Use registers, flags, symbols');
  });

  it('reports each invalid breakpoint condition only once while treating it as no breakpoint', () => {
    const fixture = createController();
    const { controller, deps } = fixture;
    enableBreakpoint(fixture, 0x1234, 'resetting');

    expect(controller.shouldStopAtBreakpoint(0x1234)).toBe(false);
    expect(controller.shouldStopAtBreakpoint(0x1234)).toBe(false);
    expect(deps.sendEvent).toHaveBeenCalledTimes(1);
    const event = deps.sendEvent.mock.calls[0]?.[0] as { body?: { output?: string } };
    expect(event.body?.output).toContain(
      'Debug80: Invalid conditional breakpoint expression "resetting".'
    );
  });

  it('clears stale invalid-condition reports when breakpoints are reapplied', () => {
    const fixture = createController();
    const { controller, deps } = fixture;
    enableBreakpoint(fixture, 0x1234, 'resetting');

    expect(controller.shouldStopAtBreakpoint(0x1234)).toBe(false);
    expect(controller.shouldStopAtBreakpoint(0x1234)).toBe(false);

    controller.setBreakPointsRequest(
      {} as never,
      {
        source: { path: '/workspace/src/main.asm' },
        breakpoints: [{ line: 4, condition: 'resetting' }],
      } as never
    );

    expect(controller.shouldStopAtBreakpoint(0x1234)).toBe(false);
    expect(deps.sendEvent).toHaveBeenCalledTimes(2);
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
      extraBreakpoints: [{ address: 0x3456 }],
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

describe('AdapterRequestController Run to Cursor flow', () => {
  it('resolves goto targets from the source map and runs to a temporary address', () => {
    const runUntilStopSpy = vi
      .spyOn(runtimeControl, 'runUntilStopAsync')
      .mockResolvedValue(undefined);
    const { controller, deps, sessionState } = createController();
    sessionState.baseDir = '/workspace';
    sessionState.mappingIndex = {
      segmentsByAddress: [],
      segmentsByFileLine: new Map([
        [
          'src/main.z80',
          new Map([
            [
              8,
              [
                {
                  start: 0x4100,
                  end: 0x4103,
                  loc: { file: 'src/main.z80', line: 8 },
                  context: { line: 20, text: 'CALL TEST' },
                  confidence: 'HIGH',
                  addressSpace: { kind: 'tec1g-expansion', physicalBank: 0 },
                },
              ],
            ],
          ]),
        ],
      ]),
      anchorsByFile: new Map(),
    };
    sessionState.runtime = { getPC: () => 0x4000 } as never;

    const targetsResponse = {} as DebugProtocol.GotoTargetsResponse;
    controller.gotoTargetsRequest(targetsResponse, {
      source: { path: '/workspace/src/main.z80' },
      line: 8,
      column: 1,
    });

    expect(targetsResponse.body?.targets).toEqual([{ id: 1, label: '$4100', line: 8 }]);

    controller.gotoRequest({} as never, { threadId: 1, targetId: 1 });

    expect(deps.sendResponse).toHaveBeenCalledTimes(2);
    expect(runUntilStopSpy).toHaveBeenCalledWith(expect.anything(), {
      extraBreakpoints: [
        { address: 0x4100, addressSpace: { kind: 'tec1g-expansion', physicalBank: 0 } },
      ],
      limitLabel: 'run to cursor',
    });
  });

  it('runs to a selected mapped stack frame return address', () => {
    const runUntilStopSpy = vi
      .spyOn(runtimeControl, 'runUntilStopAsync')
      .mockResolvedValue(undefined);
    const { controller, deps, sessionState } = createController();
    const memory = new Uint8Array(0x10000);
    memory[0xff00] = 0x00;
    memory[0xff01] = 0x41;
    sessionState.mappingIndex = {
      segmentsByAddress: [
        {
          start: 0x4100,
          end: 0x4103,
          loc: { file: 'src/main.z80', line: 8 },
          context: { line: 20, text: 'RET target' },
          confidence: 'HIGH',
        },
      ],
      segmentsByFileLine: new Map(),
      anchorsByFile: new Map(),
    };
    sessionState.runtime = {
      getPC: () => 0x4000,
      getRegisters: () => ({ sp: 0xff00 }),
      hardware: { memory },
    } as never;

    controller.runToStackFrameRequest({} as DebugProtocol.Response, { frameId: 1 });

    expect(deps.sendResponse).toHaveBeenCalledTimes(1);
    expect(runUntilStopSpy).toHaveBeenCalledWith(expect.anything(), {
      extraBreakpoints: [{ address: 0x4100 }],
      limitLabel: 'stack frame return',
    });
  });
});

describe('AdapterRequestController setVariableRequest', () => {
  it('updates a writable register and returns the formatted value', () => {
    const { controller, deps, registersRef, sessionState } = createSetVariableController();
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
    const { controller, deps, registersRef, sessionState } = createSetVariableController();
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
