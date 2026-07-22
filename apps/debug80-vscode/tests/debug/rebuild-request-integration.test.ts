import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DebugProtocol } from '@vscode/debugprotocol';
import { handleWarmRebuildRequest } from '../../src/debug/requests/rebuild-request';
import { createSessionState } from '../../src/debug/session/session-state';
import { SourceStateManager } from '../../src/debug/mapping/source-state-manager';
import { createZ80Runtime } from '@jhlagado/debug80-runtime/z80/runtime';
import type { HexProgram } from '@jhlagado/debug80-runtime/z80/loaders';
import { NullLogger } from '../../src/util/logger';
import { BreakpointManager } from '../../src/debug/mapping/breakpoint-manager';

vi.mock('vscode', () => ({
  workspace: { workspaceFolders: [] },
}));

describe('warm rebuild assembly integration', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

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

  it('rebuilds Glimmer artifacts, mappings, memory, and CPU state end to end', async () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-warm-glimmer-'));
    tempDirs.push(baseDir);
    const sourceDir = path.join(baseDir, 'src');
    fs.mkdirSync(sourceDir, { recursive: true });
    const sourcePath = path.join(sourceDir, 'probe.glim');
    fs.writeFileSync(
      sourcePath,
      [
        'program Probe',
        'platform tec1g-mon3',
        'display matrix8x8',
        'state DotY : byte = 3 changed',
        'pulse Up',
        'bind key KEY_2 rising -> Up',
        'effect MoveUp',
        '    on Up',
        '    updates DotY',
        'begin',
        '    ld a,(DotY)',
        '    or a',
        '    jr z,_stop',
        '    dec a',
        '    ld (DotY),a',
        '_stop:',
        'end',
        'render Draw',
        '    on DotY',
        'begin',
        '    ld a,(DotY)',
        'end',
      ].join('\n')
    );

    const previousMemory = new Uint8Array(0x10000);
    previousMemory[0x2000] = 0xaa;
    const previousProgram: HexProgram = {
      memory: previousMemory,
      startAddress: 0x2000,
      writeRanges: [{ start: 0x2000, end: 0x2001 }],
    };
    const sessionState = createSessionState();
    sessionState.launchArgs = {
      platform: 'simple',
      asm: path.relative(baseDir, sourcePath),
      outputDir: 'build',
      entry: 0x4000,
    };
    sessionState.baseDir = baseDir;
    sessionState.sourceRoots = [sourceDir, baseDir];
    sessionState.loadedProgram = previousProgram;
    sessionState.loadedEntry = 0x4000;
    sessionState.runtime = createZ80Runtime(previousProgram);
    const sourceState = new SourceStateManager();
    const breakpointManager = new BreakpointManager();
    breakpointManager.setPending(sourcePath, [{ line: 11 }]);
    const response = {} as DebugProtocol.Response;
    const sendResponse = vi.fn();
    const sendEvent = vi.fn();

    await handleWarmRebuildRequest(response, {
      logger: new NullLogger(),
      sessionState,
      sourceState,
      breakpointManager,
      platformState: { active: 'simple' },
      sendEvent,
      sendResponse,
      sendErrorResponse: vi.fn(),
    });

    expect(response.body).toMatchObject({
      ok: true,
      summary: 'probe.glim rebuilt and restarted',
      rebuiltPath: sourcePath,
    });
    expect(fs.existsSync(path.join(baseDir, 'build', 'probe.hex'))).toBe(true);
    expect(fs.existsSync(path.join(baseDir, 'build', 'probe.d8.json'))).toBe(true);
    expect(
      sessionState.mapping?.segments.some((segment) => segment.loc.file?.endsWith('probe.glim'))
    ).toBe(true);
    expect(sessionState.runtime.hardware.memory[0x2000]).toBe(0);
    expect(
      sessionState.runtime.hardware.memory.some((byte, address) => address >= 0x4000 && byte !== 0)
    ).toBe(true);
    expect(sessionState.runtime.getPC()).toBe(0x4000);
    const breakpointSegments =
      sessionState.mapping?.segments.filter(
        (segment) =>
          segment.loc.file?.endsWith('probe.glim') === true &&
          segment.loc.line !== null &&
          Math.abs(segment.loc.line - 11) <= 4
      ) ?? [];
    expect(breakpointSegments.some((segment) => breakpointManager.hasAddress(segment.start))).toBe(
      true
    );
    expect(sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'breakpoint',
        body: expect.objectContaining({ breakpoint: expect.objectContaining({ verified: true }) }),
      })
    );
    expect(sendResponse).toHaveBeenCalledWith(response);
  });
});
