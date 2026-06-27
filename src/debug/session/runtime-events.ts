import { BreakpointEvent, OutputEvent, StoppedEvent } from '@vscode/debugadapter';
import type { DebugProtocol } from '@vscode/debugprotocol';
import type { StopReason } from './session-state';
import type { RuntimeControlContext } from './runtime-control';
import { emitDebugSessionStatus } from './session-status';
import type { SourceAddressSpace } from '../../mapping/types';

export function emitRuntimeRunning(context: RuntimeControlContext): void {
  emitDebugSessionStatus(context.sendEvent, 'running');
}

export function markRuntimeStopped(
  context: RuntimeControlContext,
  reason: StopReason,
  breakpointAddress: number | null,
  breakpointAddressSpace?: SourceAddressSpace
): void {
  context.setHaltNotified(false);
  context.setRunning(false);
  context.setLastStopReason(reason);
  context.setLastBreakpointAddress(breakpointAddress);
  context.setLastBreakpointAddressSpace(breakpointAddressSpace);
}

export function emitRuntimeStopped(context: RuntimeControlContext, reason: string): void {
  emitDebugSessionStatus(context.sendEvent, 'paused');
  context.sendEvent(new StoppedEvent(reason, 1));
}

export function stopRuntimeAndEmit(
  context: RuntimeControlContext,
  stateReason: StopReason,
  eventReason: string,
  breakpointAddress: number | null,
  breakpointAddressSpace?: SourceAddressSpace
): void {
  markRuntimeStopped(context, stateReason, breakpointAddress, breakpointAddressSpace);
  emitRuntimeStopped(context, eventReason);
}

export function emitRuntimeLimitStopped(context: RuntimeControlContext, message: string): void {
  markRuntimeStopped(context, 'step', null);
  emitDebugSessionStatus(context.sendEvent, 'paused');
  context.sendEvent(new OutputEvent(message));
  context.sendEvent(new StoppedEvent('step', 1));
}

export function emitChangedBreakpoints(
  sendEvent: (event: DebugProtocol.Event) => void,
  breakpoints: DebugProtocol.Breakpoint[]
): void {
  for (const breakpoint of breakpoints) {
    sendEvent(new BreakpointEvent('changed', breakpoint));
  }
}
