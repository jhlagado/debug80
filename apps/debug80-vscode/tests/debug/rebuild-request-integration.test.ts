import { describe, expect, it, vi } from 'vitest';
import type { DebugProtocol } from '@vscode/debugprotocol';
import { handleWarmRebuildRequest } from '../../src/debug/requests/rebuild-request';

vi.mock('vscode', () => ({
  workspace: { workspaceFolders: [] },
}));

describe('warm rebuild assembly integration', () => {
  it('rejects ranged Glimmer binaries through the real assembly pipeline', async () => {
    const response = {} as DebugProtocol.Response;
    const sendResponse = vi.fn();

    await handleWarmRebuildRequest(response, {
      logger: {} as never,
      sessionState: {
        launchArgs: {
          platform: 'simple',
          asm: 'game.glim',
          outputDir: 'missing-build',
          simple: { binFrom: 0x4000, binTo: 0x40ff },
        },
        runtime: {} as never,
        baseDir: '/tmp/debug80-warm-rebuild-integration-test',
      } as never,
      sourceState: {} as never,
      breakpointManager: {} as never,
      platformState: { active: 'simple' },
      sendEvent: vi.fn(),
      sendResponse,
      sendErrorResponse: vi.fn(),
    });

    expect(response.body).toMatchObject({
      ok: false,
      summary: 'assembly',
      detail:
        'glimmer does not support simple.binFrom/simple.binTo; ranged Simple binaries currently require the AZM backend.',
    });
    expect(sendResponse).toHaveBeenCalledWith(response);
  });
});
