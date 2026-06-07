import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyLocalMonitorRomToLaunchArgs,
  buildLocalMonitorRomIfPresent,
} from '../../src/debug/launch/local-monitor-rom-build';
import type { LaunchRequestArguments } from '../../src/debug/session/types';

describe('local monitor ROM build conventions', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it('discovers a TEC-1G .rom.asm entry and applies conventional ROM artifacts', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-local-rom-'));
    tmpDirs.push(root);
    const sourcePath = path.join(root, 'roms', 'tec1g', 'mon3', 'mon3.rom.asm');
    const hexPath = path.join(root, 'build', 'roms', 'tec1g', 'mon3', 'mon3.hex');
    const d8Path = path.join(root, 'build', 'roms', 'tec1g', 'mon3', 'mon3.d8.json');
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.mkdirSync(path.dirname(hexPath), { recursive: true });
    fs.writeFileSync(sourcePath, '.include "mon3.z80"\n');
    fs.writeFileSync(hexPath, ':00000001FF\n');
    fs.writeFileSync(d8Path, '{}\n');

    const args: LaunchRequestArguments = {
      assemble: false,
      sourceRoots: ['src'],
      debugMaps: ['/extension/resources/bundles/tec1g/mon3/v1/mon3.d8.json'],
    };
    const result = await buildLocalMonitorRomIfPresent({
      platform: 'tec1g',
      baseDir: root,
      args,
      sendEvent: () => undefined,
    });

    expect(result?.built).toBe(false);
    expect(result?.rom.sourcePath).toBe(sourcePath);

    applyLocalMonitorRomToLaunchArgs(args, 'tec1g', result);

    expect(args.tec1g?.romHex).toBe(hexPath);
    expect(args.debugMaps).toEqual([
      d8Path,
      '/extension/resources/bundles/tec1g/mon3/v1/mon3.d8.json',
    ]);
    expect(args.sourceRoots).toEqual(['src', 'roms/tec1g/mon3']);
  });

  it('does nothing when the platform has no local ROM source convention', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-no-local-rom-'));
    tmpDirs.push(root);

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
});
