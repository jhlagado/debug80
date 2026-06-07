/**
 * @file Build project-local monitor ROM sources discovered by convention.
 */

import * as fs from 'fs';
import { discoverLocalMonitorRom, type LocalMonitorRom } from '../monitor-rom-conventions';
import type { LaunchRequestArguments } from '../session/types';
import { emitConsoleOutput, type EventSender } from '../session/adapter-ui';
import { AssembleFailureError } from './assembler';
import { resolveAssemblerBackend } from './assembler-backend';

export type LocalMonitorRomBuildResult = {
  rom: LocalMonitorRom;
  built: boolean;
};

export async function buildLocalMonitorRomIfPresent(options: {
  platform: string;
  baseDir: string;
  args: LaunchRequestArguments;
  sendEvent: EventSender;
}): Promise<LocalMonitorRomBuildResult | undefined> {
  const rom = discoverLocalMonitorRom(options.platform, options.baseDir);
  if (rom === undefined) {
    return undefined;
  }

  if (options.args.assemble === false) {
    return { rom, built: false };
  }

  const backend = resolveAssemblerBackend('azm', rom.sourcePath);
  const result = await backend.assemble({
    asmPath: rom.sourcePath,
    hexPath: rom.outputHexPath,
    sourceRoot: rom.sourceRoot,
    azm: {
      ...(options.args.azm ?? {}),
      registerContracts: 'off',
      emitRegisterReport: false,
    },
    onOutput: (message) => {
      emitConsoleOutput(options.sendEvent, message, { newline: false });
    },
  });

  if (!result.success) {
    throw new AssembleFailureError({
      ...result,
      error: result.error ?? `${backend.id} failed to assemble monitor ROM`,
    });
  }

  return { rom, built: true };
}

export function applyLocalMonitorRomToLaunchArgs(
  args: LaunchRequestArguments,
  platform: string,
  result: LocalMonitorRomBuildResult | undefined
): void {
  if (result === undefined) {
    return;
  }

  if (fs.existsSync(result.rom.outputHexPath)) {
    if (platform === 'tec1') {
      args.tec1 = { ...(args.tec1 ?? {}), romHex: result.rom.outputHexPath };
    } else if (platform === 'tec1g') {
      args.tec1g = { ...(args.tec1g ?? {}), romHex: result.rom.outputHexPath };
    }
  }

  if (fs.existsSync(result.rom.outputDebugMapPath)) {
    const debugMaps = (args.debugMaps ?? []).filter(
      (mapPath) => mapPath !== result.rom.outputDebugMapPath
    );
    args.debugMaps = [result.rom.outputDebugMapPath, ...debugMaps];
  }

  const sourceRoots = args.sourceRoots ?? [];
  if (!sourceRoots.includes(result.rom.destinationRel)) {
    args.sourceRoots = [...sourceRoots, result.rom.destinationRel];
  }
}
