import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AzmBackend } from '../../src/debug/launch/azm-backend';
import {
  applyLocalMonitorRomToLaunchArgs,
  buildLocalMonitorRomIfPresent,
} from '../../src/debug/launch/local-monitor-rom-build';
import type { LaunchRequestArguments } from '../../src/debug/session/types';

type LocalRomFixture = {
  root: string;
  sourcePath: string;
  hexPath: string;
  d8Path: string;
};

describe('local monitor ROM build conventions', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it.each([undefined, 'atom', 'nucleus'])(
    'builds a compatible monitor with ATOM when the application backend is %s',
    async (assembler) => {
      const historical = vi.spyOn(AzmBackend.prototype, 'assemble').mockImplementation(() => {
        throw new Error('Historical AZM must not execute for the default monitor build');
      });
      const fixture = createTec1gLocalRomFixture();
      writeTextFile(fixture.sourcePath, '%INCLUDE "monitor.asm"\n');
      writeTextFile(
        path.join(path.dirname(fixture.sourcePath), 'monitor.asm'),
        'ORG $C000\nSTART: LD A,42\nRET\n'
      );
      const args: LaunchRequestArguments = { assembler };
      const result = await buildLocalMonitorRomIfPresent({
        platform: 'tec1g',
        baseDir: fixture.root,
        args,
        sendEvent: () => undefined,
      });
      expect(historical).not.toHaveBeenCalled();
      expect(result?.built).toBe(true);
      expect([...fs.readFileSync(fixture.hexPath.replace(/\.hex$/, '.bin'))]).toEqual([
        0x3e, 42, 0xc9,
      ]);
      expect(fs.readFileSync(fixture.hexPath, 'utf8')).toContain(':03C000003E2AC90C');
      const debugMap = JSON.parse(fs.readFileSync(fixture.d8Path, 'utf8'));
      expect(debugMap.format).toBe('d8-debug-map');
      expect(debugMap.generator.tool).toBe('atom');
      expect(Object.keys(debugMap.files)).toEqual([
        'roms/tec1g/mon3/monitor.asm',
        'roms/tec1g/mon3/mon3.rom.asm',
      ]);
      applyLocalMonitorRomToLaunchArgs(args, 'tec1g', result);
      expect(args.tec1g?.romHex).toBe(fixture.hexPath);
      expect(args.debugMaps).toEqual([fixture.d8Path]);
    }
  );

  it.each(['azm', ' ASM80 '])(
    'keeps explicitly selected historical %s compatibility',
    async (assembler) => {
      const historical = vi
        .spyOn(AzmBackend.prototype, 'assemble')
        .mockResolvedValue({ success: true });
      const fixture = createTec1gLocalRomFixture();
      const result = await buildLocalMonitorRomIfPresent({
        platform: 'tec1g',
        baseDir: fixture.root,
        args: { assembler },
        sendEvent: () => undefined,
      });
      expect(result?.built).toBe(true);
      expect(historical).toHaveBeenCalledWith(
        expect.objectContaining({ asmPath: fixture.sourcePath, hexPath: fixture.hexPath })
      );
    }
  );

  it('reports incompatible historical source without falling back or replacing artifacts', async () => {
    const historical = vi.spyOn(AzmBackend.prototype, 'assemble').mockImplementation(() => {
      throw new Error('Historical AZM must not execute as a fallback');
    });
    const fixture = createTec1gLocalRomFixture();
    // The conventional entry from the retained monitor bundle uses legacy syntax.
    await expect(
      buildLocalMonitorRomIfPresent({
        platform: 'tec1g',
        baseDir: fixture.root,
        args: {},
        sendEvent: () => undefined,
      })
    ).rejects.toMatchObject({
      result: expect.objectContaining({
        success: false,
        error: expect.stringContaining(
          'Retained historical monitor sources require an explicitly selected historical assembler'
        ),
      }),
    });
    expect(historical).not.toHaveBeenCalled();
    expect(fs.readFileSync(fixture.hexPath, 'utf8')).toBe(':00000001FF\n');
    expect(fs.readFileSync(fixture.d8Path, 'utf8')).toBe('{}\n');
  });

  it('discovers a TEC-1G .rom.asm entry and applies conventional ROM artifacts', async () => {
    const fixture = createTec1gLocalRomFixture();

    const args: LaunchRequestArguments = {
      assemble: false,
      sourceRoots: ['src'],
      debugMaps: [
        '/extension/resources/bundles/tec1g/mon3/v1/mon3.d8.json',
        '/workspace/project/build/app-support.d8.json',
      ],
    };
    const result = await buildLocalMonitorRomIfPresent({
      platform: 'tec1g',
      baseDir: fixture.root,
      args,
      sendEvent: () => undefined,
    });

    expect(result?.built).toBe(false);
    expect(result?.rom.sourcePath).toBe(fixture.sourcePath);

    applyLocalMonitorRomToLaunchArgs(args, 'tec1g', result);

    expect(args.tec1g?.romHex).toBe(fixture.hexPath);
    expect(args.debugMaps).toEqual([
      fixture.d8Path,
      '/workspace/project/build/app-support.d8.json',
    ]);
    expect(args.sourceRoots).toEqual(['src', 'roms/tec1g/mon3']);
  });

  it('does nothing when the platform has no local ROM source convention', async () => {
    const root = makeTempDir('debug80-no-local-rom-');

    const args: LaunchRequestArguments = { assemble: false };
    const result = await buildLocalMonitorRomIfPresent({
      platform: 'simple',
      baseDir: root,
      args,
      sendEvent: () => undefined,
    });

    applyLocalMonitorRomToLaunchArgs(args, 'simple', result);

    expect(result).toBeUndefined();
    expect(args.debugMaps).toBeUndefined();
    expect(args.tec1).toBeUndefined();
    expect(args.tec1g).toBeUndefined();
  });

  it('does not run the TEC-1G local monitor convention when an explicit monitor artifact is active', async () => {
    const fixture = createTec1gLocalRomFixture();
    const args: LaunchRequestArguments = {
      tec1g: {
        romArtifacts: [
          {
            id: 'explicit-monitor',
            role: 'monitor',
            sourceFile: 'roms/tec1g/custom/monitor.asm',
            outputBin: 'build/roms/tec1g/custom/monitor.bin',
            address: 0xc000,
            size: 0x4000,
          },
        ],
      },
    };

    const result = await buildLocalMonitorRomIfPresent({
      platform: 'tec1g',
      baseDir: fixture.root,
      args,
      sendEvent: () => undefined,
    });

    expect(result).toBeUndefined();
  });

  function makeTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tmpDirs.push(dir);
    return dir;
  }

  function createTec1gLocalRomFixture(): LocalRomFixture {
    const root = makeTempDir('debug80-local-rom-');
    const sourcePath = path.join(root, 'roms', 'tec1g', 'mon3', 'mon3.rom.asm');
    const hexPath = path.join(root, 'build', 'roms', 'tec1g', 'mon3', 'mon3.hex');
    const d8Path = path.join(root, 'build', 'roms', 'tec1g', 'mon3', 'mon3.d8.json');

    writeTextFile(sourcePath, '.include "mon3.z80"\n');
    writeTextFile(hexPath, ':00000001FF\n');
    writeTextFile(d8Path, '{}\n');

    return { root, sourcePath, hexPath, d8Path };
  }

  function writeTextFile(filePath: string, contents: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
  }
});
