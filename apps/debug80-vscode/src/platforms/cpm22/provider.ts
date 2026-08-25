/**
 * @file Debug adapter provider for the ideal Debug80 CP/M 2.2 platform.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { createCpm22PlatformRuntime } from '@jhlagado/debug80-runtime/platforms/cpm22/runtime';
import type { Cpm22PlatformRuntime } from '@jhlagado/debug80-runtime/platforms/cpm22/runtime';
import type { IoHandlers } from '@jhlagado/debug80-runtime/z80/runtime';
import type { LaunchRequestArguments } from '../../debug/session/types';
import type { TerminalState } from '../../debug/session/terminal-types';
import type { PlatformIoBuildResult } from '../../debug/session/platform-host';
import type { PlatformAssetLoadContext, ResolvedPlatformProvider } from '../provider';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
function resolveBundledRomDirectory(): string {
  const directory = [
    path.resolve(moduleDirectory, '..', '..', 'roms', 'cpm22'),
    path.resolve(moduleDirectory, '..', '..', '..', 'roms', 'cpm22'),
  ].find((candidate) => fs.existsSync(path.join(candidate, 'cpm22.img')));
  if (directory === undefined) {
    throw new Error('Debug80 CP/M 2.2 bundled disk image is missing');
  }
  return directory;
}
const bundledRomDirectory = resolveBundledRomDirectory();

type Cpm22Assets = {
  bootstrap: Uint8Array;
};

/** Creates a platform provider backed by the project-owned BIOS device ABI. */
export function createCpm22PlatformProvider(
  args: LaunchRequestArguments
): ResolvedPlatformProvider {
  const biosDebugMap = path.join(bundledRomDirectory, 'bios.d8m.json');
  args.debugMaps = Array.from(new Set([...(args.debugMaps ?? []), biosDebugMap]));
  args.sourceRoots = Array.from(new Set([...(args.sourceRoots ?? []), bundledRomDirectory]));
  let platformRuntime: Cpm22PlatformRuntime | undefined;
  const terminalState: TerminalState = {
    config: { txPort: 0, rxPort: 1, statusPort: 2, interrupt: false },
    input: [],
  };

  const flushInput = (): void => {
    if (platformRuntime !== undefined && terminalState.input.length !== 0) {
      platformRuntime.terminal.enqueueInput(terminalState.input.splice(0));
    }
  };

  const loadAssets = (context: PlatformAssetLoadContext): Cpm22Assets => {
    const configuredDisk = args.cpm22?.diskImage;
    const diskPath =
      configuredDisk !== undefined && configuredDisk.trim().length !== 0
        ? context.resolveRelative(configuredDisk, context.baseDir)
        : path.join(bundledRomDirectory, 'cpm22.img');
    const bootstrapPath = path.join(bundledRomDirectory, 'bootstrap.bin');
    const diskImage = new Uint8Array(fs.readFileSync(diskPath));
    const bootstrap = new Uint8Array(fs.readFileSync(bootstrapPath));
    platformRuntime = createCpm22PlatformRuntime({
      diskImage,
      diskWritable: args.cpm22?.writable ?? true,
    });
    return { bootstrap };
  };

  return {
    id: 'cpm22',
    payload: { id: 'cpm22' },
    registerCommands: () => undefined,
    buildIoHandlers: (callbacks): Promise<PlatformIoBuildResult> => {
      const ioHandlers: IoHandlers = {
        read: (port): number => {
          flushInput();
          return platformRuntime?.ioHandlers.read?.(port) ?? 0;
        },
        write: (port, value): void => {
          platformRuntime?.ioHandlers.write?.(port, value);
          if ((port & 0xff) === 0) {
            callbacks.onTerminalOutput({ text: String.fromCharCode(value & 0xff) });
          }
        },
      };
      return Promise.resolve({ ioHandlers, terminalState });
    },
    loadAssets,
    prepareProgram: (program, assets): void => {
      const bootstrap =
        assets !== undefined
          ? (assets as Cpm22Assets).bootstrap
          : new Uint8Array(fs.readFileSync(path.join(bundledRomDirectory, 'bootstrap.bin')));
      program.memory.set(bootstrap, 0);
      program.startAddress = 0;
      program.writeRanges = [...(program.writeRanges ?? []), { start: 0, end: bootstrap.length }];
    },
    resolveEntry: (): number => 0,
  };
}
