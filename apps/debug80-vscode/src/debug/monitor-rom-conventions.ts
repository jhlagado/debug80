/**
 * @file Conventional project-local monitor ROM source locations.
 */

import * as fs from 'fs';
import * as path from 'path';

export type MonitorRomPlatform = 'tec1' | 'tec1g';

export type MonitorRomConvention = {
  platform: MonitorRomPlatform;
  bundleId: string;
  label: string;
  destinationRel: string;
  sourceEntryRel: string;
  sourceIncludeName: string;
  outputHexRel: string;
  outputDebugMapRel: string;
};

export type LocalMonitorRom = MonitorRomConvention & {
  sourcePath: string;
  outputHexPath: string;
  outputDebugMapPath: string;
  sourceRoot: string;
};

const MONITOR_ROM_CONVENTIONS: MonitorRomConvention[] = [
  {
    platform: 'tec1g',
    bundleId: 'tec1g/mon3/v1',
    label: 'MON-3 (TEC-1G)',
    destinationRel: 'roms/tec1g/mon3',
    sourceEntryRel: 'roms/tec1g/mon3/mon3.rom.asm',
    sourceIncludeName: 'mon3.z80',
    outputHexRel: 'build/roms/tec1g/mon3/mon3.hex',
    outputDebugMapRel: 'build/roms/tec1g/mon3/mon3.d8.json',
  },
  {
    platform: 'tec1',
    bundleId: 'tec1/mon1b/v1',
    label: 'MON-1B (TEC-1)',
    destinationRel: 'roms/tec1/mon1b',
    sourceEntryRel: 'roms/tec1/mon1b/mon1b.rom.asm',
    sourceIncludeName: 'mon-1b.asm',
    outputHexRel: 'build/roms/tec1/mon1b/mon1b.hex',
    outputDebugMapRel: 'build/roms/tec1/mon1b/mon1b.d8.json',
  },
];

export function monitorRomConventionForBundle(
  bundleId: string | undefined
): MonitorRomConvention | undefined {
  if (bundleId === undefined || bundleId.trim() === '') {
    return undefined;
  }
  return MONITOR_ROM_CONVENTIONS.find((convention) => convention.bundleId === bundleId.trim());
}

export function monitorRomConventionForPlatform(
  platform: string | undefined
): MonitorRomConvention | undefined {
  if (platform !== 'tec1' && platform !== 'tec1g') {
    return undefined;
  }
  return MONITOR_ROM_CONVENTIONS.find((convention) => convention.platform === platform);
}

export function createMonitorRomEntrySource(convention: MonitorRomConvention): string {
  return [
    `; Debug80 local ${convention.label} ROM entry point`,
    ';',
    '; This file is created by "Debug80: Copy Monitor ROM into Project".',
    '; Edit the included monitor sources in this folder, then build normally.',
    '',
    `.include "${convention.sourceIncludeName}"`,
    '',
  ].join('\n');
}

export function discoverLocalMonitorRom(
  platform: string | undefined,
  workspaceRoot: string
): LocalMonitorRom | undefined {
  const convention = monitorRomConventionForPlatform(platform);
  if (convention === undefined) {
    return undefined;
  }
  const sourcePath = path.resolve(workspaceRoot, convention.sourceEntryRel);
  if (!fs.existsSync(sourcePath)) {
    return undefined;
  }
  return {
    ...convention,
    sourcePath,
    outputHexPath: path.resolve(workspaceRoot, convention.outputHexRel),
    outputDebugMapPath: path.resolve(workspaceRoot, convention.outputDebugMapRel),
    sourceRoot: workspaceRoot,
  };
}
