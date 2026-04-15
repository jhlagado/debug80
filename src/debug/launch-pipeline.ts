/**
 * @fileoverview Launch pipeline helpers (config normalization, assembly).
 */

import * as path from 'path';
import type {
  SimplePlatformConfigNormalized,
  Tec1PlatformConfigNormalized,
  Tec1gPlatformConfigNormalized,
} from '../platforms/types';
import { AssembleFailureError } from './assembler';
import type { AssemblerBackend } from './assembler-backend';
import type { LaunchRequestArguments } from './types';
import { emitConsoleOutput, type EventSender } from './adapter-ui';

export function resolveExtraListings(
  platform: string,
  simpleConfig?: SimplePlatformConfigNormalized,
  tec1Config?: Tec1PlatformConfigNormalized,
  tec1gConfig?: Tec1gPlatformConfigNormalized
): string[] {
  const inferFromRom = (romHex: string | undefined): string[] => {
    if (typeof romHex !== 'string' || romHex.trim() === '') {
      return [];
    }
    const dir = path.dirname(romHex);
    const base = path.basename(romHex, path.extname(romHex));
    const candidates = [
      path.join(dir, `${base}.lst`),
      path.join(dir, `${base.replace(/[-_]/g, '')}.lst`),
    ];
    return [...new Set(candidates)];
  };

  if (platform === 'simple') {
    return simpleConfig?.extraListings ?? [];
  }
  if (platform === 'tec1') {
    return tec1Config?.extraListings ?? inferFromRom(tec1Config?.romHex);
  }
  if (platform === 'tec1g') {
    return tec1gConfig?.extraListings ?? inferFromRom(tec1gConfig?.romHex);
  }
  return [];
}

export function assembleIfRequested(options: {
  backend: AssemblerBackend;
  args: LaunchRequestArguments;
  asmPath: string | undefined;
  hexPath: string;
  listingPath: string;
  platform: string;
  simpleConfig?: SimplePlatformConfigNormalized;
  sendEvent: EventSender;
}): void {
  const { backend, args, asmPath, hexPath, listingPath, platform, simpleConfig, sendEvent } = options;
  if (asmPath === undefined || asmPath === '' || args.assemble === false) {
    return;
  }

  const result = backend.assemble({ asmPath, hexPath, listingPath, onOutput: (message) => {
    emitConsoleOutput(sendEvent, message, { newline: false });
  } });
  if (!result.success) {
    throw new AssembleFailureError({
      ...result,
      error: result.error ?? `${backend.id} failed to assemble`,
    });
  }

  if (
    platform === 'simple' &&
    simpleConfig?.binFrom !== undefined &&
    simpleConfig.binTo !== undefined
  ) {
    const binResult = backend.assembleBin?.({
      asmPath,
      hexPath,
      binFrom: simpleConfig.binFrom,
      binTo: simpleConfig.binTo,
      onOutput: (message) => {
        emitConsoleOutput(sendEvent, message, { newline: false });
      },
    });
    if (binResult && !binResult.success) {
      throw new AssembleFailureError({
        ...binResult,
        error: binResult.error ?? `${backend.id} failed to build binary`,
      });
    }
  }
}

export function normalizeStepLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isFinite(value)) {
    return fallback;
  }
  if (value <= 0) {
    return 0;
  }
  return Math.floor(value);
}
