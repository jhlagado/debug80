import type { MemoryPanel } from './memory-panel';

type MemoryPanelSnapshotPayload = Parameters<MemoryPanel['handleSnapshot']>[0];

export function handleMemoryPanelMessage(
  message: ({ type?: unknown; message?: unknown } & Partial<MemoryPanelSnapshotPayload>),
  memoryPanel: MemoryPanel | null | undefined
): boolean {
  if (message.type === 'snapshot') {
    memoryPanel?.handleSnapshot(message);
    return true;
  }
  if (message.type === 'snapshotError') {
    memoryPanel?.handleSnapshotError(typeof message.message === 'string' ? message.message : '');
    return true;
  }
  return false;
}
