import { describe, expect, it, vi } from 'vitest';
import type { DebugProtocol } from '@vscode/debugprotocol';
import type { LaunchRequestArguments } from '../../src/debug/session/types';

const { assembleIfRequested } = vi.hoisted(() => ({
  assembleIfRequested: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../src/debug/launch/launch-pipeline', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/debug/launch/launch-pipeline')>()),
  assembleIfRequested,
}));

vi.mock('vscode', () => ({
  workspace: { workspaceFolders: [] },
}));

import { handleWarmRebuildRequest } from '../../src/debug/requests/rebuild-request';

describe('warm rebuild requests', () => {
  it.each([
    ['AZM', 'game.asm'],
    ['Glimmer', 'game.glim'],
  ])('passes normalized Simple binary bounds to %s rebuilds', async (_name, sourceFile) => {
    assembleIfRequested.mockClear();
    const launchArgs: LaunchRequestArguments = {
      platform: 'simple',
      asm: sourceFile,
      outputDir: 'missing-build',
      simple: { binFrom: 0x4000, binTo: 0x40ff },
    };
    const sendResponse = vi.fn();

    await handleWarmRebuildRequest({} as DebugProtocol.Response, {
      logger: {} as never,
      sessionState: {
        launchArgs,
        runtime: {} as never,
        baseDir: '/tmp/debug80-warm-rebuild-test',
      } as never,
      sourceState: {} as never,
      breakpointManager: {} as never,
      platformState: { active: 'simple' },
      sendEvent: vi.fn(),
      sendResponse,
      sendErrorResponse: vi.fn(),
    });

    expect(assembleIfRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'simple',
        simpleConfig: expect.objectContaining({ binFrom: 0x4000, binTo: 0x40ff }),
      })
    );
    expect(sendResponse).toHaveBeenCalledTimes(1);
  });
});
