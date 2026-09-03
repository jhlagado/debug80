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

  it('rebuilds Atom simple-platform ranged binary artifacts end to end', async () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-warm-atom-bin-'));
    tempDirs.push(baseDir);
    const sourcePath = path.join(baseDir, 'main.asm');
    fs.writeFileSync(sourcePath, ['ORG 4001H', 'DB 0AAH', 'ORG 4003H', 'DB 055H', ''].join('\n'));
    const previousProgram: HexProgram = {
      memory: new Uint8Array(0x10000),
      startAddress: 0x4000,
      writeRanges: [],
    };
    const sessionState = createSessionState();
    sessionState.launchArgs = {
      platform: 'simple',
      assembler: 'atom',
      asm: 'main.asm',
      outputDir: 'build',
      artifactBase: 'main',
      entry: 0x4000,
      simple: { binFrom: 0x4000, binTo: 0x4004 },
    };
    sessionState.baseDir = baseDir;
    sessionState.sourceRoots = [baseDir];
    sessionState.loadedProgram = previousProgram;
    sessionState.loadedEntry = 0x4000;
    sessionState.runtime = createZ80Runtime(previousProgram);
    const response = {} as DebugProtocol.Response;
    const sendResponse = vi.fn();

    await handleWarmRebuildRequest(response, {
      logger: new NullLogger(),
      sessionState,
      sourceState: new SourceStateManager(),
      breakpointManager: new BreakpointManager(),
      platformState: { active: 'simple' },
      sendEvent: vi.fn(),
      sendResponse,
      sendErrorResponse: vi.fn(),
    });

    expect(response.body).toMatchObject({
      ok: true,
      summary: 'main.asm rebuilt and restarted',
      rebuiltPath: sourcePath,
    });
    expect([...fs.readFileSync(path.join(baseDir, 'build', 'main.bin'))]).toEqual([
      0x00, 0xaa, 0x00, 0x55, 0x00,
    ]);
    expect([...sessionState.runtime.hardware.memory.slice(0x4000, 0x4005)]).toEqual([
      0x00, 0xaa, 0x00, 0x55, 0x00,
    ]);
    expect(sessionState.runtime.getPC()).toBe(0x4000);
    expect(sendResponse).toHaveBeenCalledWith(response);
  }, 30_000);

  it('retains the CP/M cold bootstrap when rebuilding a transient source', async () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-warm-cpm22-'));
    tempDirs.push(baseDir);
    const sourcePath = path.join(baseDir, 'main.asm');
    fs.writeFileSync(
      sourcePath,
      ['        ORG $0100', 'Start:', '        LD A,$5A', ''].join('\n')
    );
    const previousProgram: HexProgram = {
      memory: new Uint8Array(0x10000),
      startAddress: 0,
      writeRanges: [],
    };
    const sessionState = createSessionState();
    sessionState.launchArgs = {
      platform: 'cpm22',
      asm: 'main.asm',
      outputDir: 'build',
      artifactBase: 'main',
      cpm22: { writable: true },
    };
    sessionState.baseDir = baseDir;
    sessionState.loadedProgram = previousProgram;
    sessionState.loadedEntry = 0;
    sessionState.runtime = createZ80Runtime(previousProgram);
    const response = {} as DebugProtocol.Response;

    await handleWarmRebuildRequest(response, {
      logger: new NullLogger(),
      sessionState,
      sourceState: new SourceStateManager(),
      breakpointManager: new BreakpointManager(),
      platformState: { active: 'cpm22' },
      sendEvent: vi.fn(),
      sendResponse: vi.fn(),
      sendErrorResponse: vi.fn(),
    });

    const bootstrap = fs.readFileSync(
      path.resolve(process.cwd(), 'roms', 'cpm22', 'bootstrap.bin')
    );
    expect(response.body).toMatchObject({ ok: true });
    expect([...sessionState.runtime.hardware.memory.slice(0, bootstrap.length)]).toEqual([
      ...bootstrap,
    ]);
    expect([...sessionState.runtime.hardware.memory.slice(0x0100, 0x0102)]).toEqual([0x3e, 0x5a]);
    expect(sessionState.runtime.getPC()).toBe(0);
  });
});
