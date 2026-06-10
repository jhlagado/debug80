import { describe, expect, it, vi } from 'vitest';
import { createTec1MessageHandler } from '../../webview/tec1/message-handler';

function createHandler() {
  const applyProjectStatus = vi.fn();
  const setSessionStatus = vi.fn();
  const setRegisterRefreshActive = vi.fn();
  const setProviderTab = vi.fn();
  const applyUpdate = vi.fn();
  const handleSnapshot = vi.fn();
  const handleSnapshotError = vi.fn();

  const handleMessage = createTec1MessageHandler({
    applyProjectStatus,
    setSessionStatus,
    setRegisterRefreshActive,
    setProviderTab,
    applyUpdate,
    handleSnapshot,
    handleSnapshotError,
  });

  return {
    applyProjectStatus,
    setSessionStatus,
    setRegisterRefreshActive,
    setProviderTab,
    applyUpdate,
    handleSnapshot,
    handleSnapshotError,
    handleMessage,
  };
}

describe('TEC-1 webview message handler', () => {
  it('ignores empty and non-object messages', () => {
    const handler = createHandler();

    handler.handleMessage(null);
    handler.handleMessage(undefined);
    handler.handleMessage('update');

    expect(handler.applyUpdate).not.toHaveBeenCalled();
    expect(handler.applyProjectStatus).not.toHaveBeenCalled();
  });

  it('routes project, session, tab, snapshot, and snapshot-error messages', () => {
    const handler = createHandler();

    const projectMessage = { type: 'projectStatus', rootPath: '/tmp/project' };
    const snapshotMessage = { type: 'snapshot', views: [] };
    handler.handleMessage(projectMessage);
    handler.handleMessage({ type: 'sessionStatus', status: 'running' });
    handler.handleMessage({ type: 'sessionStatus', status: 'not running' });
    handler.handleMessage({ type: 'selectTab', tab: 'memory' });
    handler.handleMessage(snapshotMessage);
    handler.handleMessage({ type: 'snapshotError', message: 'bad snapshot' });

    expect(handler.applyProjectStatus).toHaveBeenCalledWith(projectMessage);
    expect(handler.setSessionStatus).toHaveBeenNthCalledWith(1, 'running');
    expect(handler.setSessionStatus).toHaveBeenNthCalledWith(2, 'not running');
    expect(handler.setRegisterRefreshActive).toHaveBeenNthCalledWith(1, true);
    expect(handler.setRegisterRefreshActive).toHaveBeenNthCalledWith(2, false);
    expect(handler.setProviderTab).toHaveBeenCalledWith('memory', false);
    expect(handler.handleSnapshot).toHaveBeenCalledWith(snapshotMessage);
    expect(handler.handleSnapshotError).toHaveBeenCalledWith('bad snapshot');
  });

  it('applies current update revisions and ignores stale update revisions', () => {
    const handler = createHandler();

    const firstUpdate = { type: 'update', uiRevision: 4, digits: [1] };
    const staleUpdate = { type: 'update', uiRevision: 3, digits: [2] };
    const sameRevisionUpdate = { type: 'update', uiRevision: 4, digits: [3] };
    const unversionedUpdate = { type: 'update', digits: [4] };

    handler.handleMessage(firstUpdate);
    handler.handleMessage(staleUpdate);
    handler.handleMessage(sameRevisionUpdate);
    handler.handleMessage(unversionedUpdate);

    expect(handler.applyUpdate).toHaveBeenCalledTimes(3);
    expect(handler.applyUpdate).toHaveBeenNthCalledWith(1, firstUpdate);
    expect(handler.applyUpdate).toHaveBeenNthCalledWith(2, sameRevisionUpdate);
    expect(handler.applyUpdate).toHaveBeenNthCalledWith(3, unversionedUpdate);
  });
});
