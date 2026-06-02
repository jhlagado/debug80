/**
 * @file Message routing tests for the Debug80 platform view webview.
 */

import { describe, expect, it, vi } from 'vitest';
import { handlePlatformViewMessage } from '../../src/extension/platform-view-messages';

function createDependencies(platform: 'simple' | 'tec1' | 'tec1g' | undefined) {
  return {
    handleCreateProject: vi.fn(() => undefined),
    handleOpenWorkspaceFolder: vi.fn(() => undefined),
    handleSelectProject: vi.fn(() => undefined),
    handleConfigureProject: vi.fn(() => undefined),
    handleSaveProjectConfig: vi.fn(() => undefined),
    handleSetStopOnEntry: vi.fn(() => undefined),
    handleSetAzmOptions: vi.fn(() => undefined),
    handleSelectTarget: vi.fn(() => undefined),
    handleTestCoolTermConnection: vi.fn(() => undefined),
    handleSendHexViaCoolTerm: vi.fn(() => undefined),
    handleRestartDebug: vi.fn(() => undefined),
    handleSetEntrySource: vi.fn(() => undefined),
    currentPlatform: vi.fn(() => platform),
    handleStartDebug: vi.fn(() => undefined),
    handleSerialSendFile: vi.fn(() => undefined),
    handleSerialSave: vi.fn(() => undefined),
    clearSerialBuffer: vi.fn(() => undefined),
    handleRequestProjectStatus: vi.fn(() => undefined),
    handlePlatformMessage: vi.fn(() => undefined),
  };
}

describe('platform-view message routing', () => {
  it('routes control messages to the expected handlers', async () => {
    const deps = createDependencies('simple');

    await handlePlatformViewMessage(
      { type: 'createProject', rootPath: '/workspace/a', platform: 'tec1g' },
      deps
    );
    await handlePlatformViewMessage({ type: 'selectProject', rootPath: '/workspace/a' }, deps);
    await handlePlatformViewMessage(
      { type: 'selectTarget', rootPath: '/workspace/a', targetName: 'app' },
      deps
    );
    await handlePlatformViewMessage({ type: 'restartDebug' }, deps);
    await handlePlatformViewMessage({ type: 'setEntrySource' }, deps);
    await handlePlatformViewMessage({ type: 'startDebug', rootPath: '/workspace/a' }, deps);
    await handlePlatformViewMessage({ type: 'openWorkspaceFolder' }, deps);
    await handlePlatformViewMessage({ type: 'requestProjectStatus' }, deps);
    await handlePlatformViewMessage({ type: 'configureProject' }, deps);
    await handlePlatformViewMessage({ type: 'setStopOnEntry', stopOnEntry: true }, deps);
    await handlePlatformViewMessage(
      { type: 'setAzmOptions', registerCareMode: 'audit', contractUpdateMode: 'never' },
      deps
    );
    await handlePlatformViewMessage(
      { type: 'sendHexViaCoolTerm', rootPath: '/workspace/a', targetName: 'app' },
      deps
    );
    await handlePlatformViewMessage({ type: 'testCoolTermConnection' }, deps);
    await handlePlatformViewMessage({ type: 'serialSendFile' }, deps);
    await handlePlatformViewMessage({ type: 'serialSave', text: 'hello' }, deps);

    expect(deps.handleCreateProject).toHaveBeenCalledWith({
      rootPath: '/workspace/a',
      platform: 'tec1g',
    });
    expect(deps.handleSelectProject).toHaveBeenCalledWith({ rootPath: '/workspace/a' });
    expect(deps.handleSelectTarget).toHaveBeenCalledWith({
      rootPath: '/workspace/a',
      targetName: 'app',
    });
    expect(deps.handleRestartDebug).toHaveBeenCalledTimes(1);
    expect(deps.handleSetEntrySource).toHaveBeenCalledTimes(1);
    expect(deps.handleStartDebug).toHaveBeenCalledWith({ rootPath: '/workspace/a' });
    expect(deps.handleOpenWorkspaceFolder).toHaveBeenCalledTimes(1);
    expect(deps.handleRequestProjectStatus).toHaveBeenCalledTimes(1);
    expect(deps.handleConfigureProject).toHaveBeenCalledTimes(1);
    expect(deps.handleSetStopOnEntry).toHaveBeenCalledWith(true);
    expect(deps.handleSetAzmOptions).toHaveBeenCalledWith('audit', 'never');
    expect(deps.handleSendHexViaCoolTerm).toHaveBeenCalledWith({
      rootPath: '/workspace/a',
      targetName: 'app',
    });
    expect(deps.handleTestCoolTermConnection).toHaveBeenCalledTimes(1);
    expect(deps.handleSerialSendFile).toHaveBeenCalledTimes(1);
    expect(deps.handleSerialSave).toHaveBeenCalledWith('hello');
  });

  it('swallows malformed project control messages instead of delegating them', async () => {
    const deps = createDependencies('tec1g');

    await handlePlatformViewMessage({ type: 'setAzmOptions', registerCareMode: 'strict' }, deps);
    await handlePlatformViewMessage({ type: 'saveProjectConfig', platform: 12 }, deps);

    expect(deps.handleSetAzmOptions).not.toHaveBeenCalled();
    expect(deps.handleSaveProjectConfig).not.toHaveBeenCalled();
    expect(deps.handlePlatformMessage).not.toHaveBeenCalled();
  });

  it('preserves platform fallback for malformed serial payloads', async () => {
    const deps = createDependencies('tec1g');
    const msg = { type: 'serialSave', text: 12 };

    await handlePlatformViewMessage(msg, deps);

    expect(deps.handleSerialSave).not.toHaveBeenCalled();
    expect(deps.handlePlatformMessage).toHaveBeenCalledWith('tec1g', msg);
  });

  it('clears the active serial buffer for TEC-1 and TEC-1G', async () => {
    const tec1Deps = createDependencies('tec1');
    const tec1gDeps = createDependencies('tec1g');

    await handlePlatformViewMessage({ type: 'serialClear' }, tec1Deps);
    await handlePlatformViewMessage({ type: 'serialClear' }, tec1gDeps);

    expect(tec1Deps.clearSerialBuffer).toHaveBeenCalledWith('tec1');
    expect(tec1gDeps.clearSerialBuffer).toHaveBeenCalledWith('tec1g');
  });

  it('routes platform payloads to the active platform handler', async () => {
    const tec1Deps = createDependencies('tec1');
    const tec1gDeps = createDependencies('tec1g');

    const tec1Message = { type: 'update' };
    const tec1gMessage = { type: 'update' };

    await handlePlatformViewMessage(tec1Message, tec1Deps);
    await handlePlatformViewMessage(tec1gMessage, tec1gDeps);

    expect(tec1Deps.handlePlatformMessage).toHaveBeenCalledWith('tec1', tec1Message);
    expect(tec1gDeps.handlePlatformMessage).toHaveBeenCalledWith('tec1g', tec1gMessage);
  });

  it('ignores serialClear for idle simple view state', async () => {
    const deps = createDependencies('simple');

    await handlePlatformViewMessage({ type: 'serialClear' }, deps);

    expect(deps.clearSerialBuffer).not.toHaveBeenCalled();
  });
});
