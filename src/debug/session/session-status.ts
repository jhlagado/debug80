import { Event as DapEvent } from '@vscode/debugadapter';

export type DebugSessionStatus = 'starting' | 'running' | 'paused' | 'not running';

export function emitDebugSessionStatus(
  sendEvent: (event: unknown) => void,
  status: DebugSessionStatus
): void {
  sendEvent(new DapEvent('debug80/sessionStatus', { status }));
}
