/**
 * @file Message routing tests for the Debug80 platform view webview.
 */

import { describe, expect, it, vi } from 'vitest';
import { handlePlatformViewMessage } from '../../src/extension/platform-view-messages';

function createDependencies(platform: 'simple' | 'tec1' | 'tec1g' | undefined) {
  return {
    currentPlatform: vi.fn(() => platform),
    handleStartDebug: vi.fn(() => undefined),
    handleSerialSendFile: vi.fn(() => undefined),
    handleSerialSave: vi.fn(() => undefined),
    clearSerialBuffer: vi.fn(() => undefined),
    handlePlatformMessage: vi.fn(() => undefined),
  };
}

describe('platform-view message routing', () => {
  it('routes control messages to the expected handlers', async () => {
    const deps = createDependencies('simple');

    await handlePlatformViewMessage({ type: 'startDebug' }, deps);
    await handlePlatformViewMessage({ type: 'serialSendFile' }, deps);
    await handlePlatformViewMessage({ type: 'serialSave', text: 'hello' }, deps);

    expect(deps.handleStartDebug).toHaveBeenCalledTimes(1);
    expect(deps.handleSerialSendFile).toHaveBeenCalledTimes(1);
    expect(deps.handleSerialSave).toHaveBeenCalledWith('hello');
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
