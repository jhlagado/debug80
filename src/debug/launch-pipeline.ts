/**
 * @fileoverview Launch pipeline helpers (config normalization, assembly).
 */

import type {
  SimplePlatformConfigNormalized,
  Tec1PlatformConfigNormalized,
  Tec1gPlatformConfigNormalized,
} from '../platforms/types';
import type { LaunchRequestArguments } from './types';
import { emitConsoleOutput, type EventSender } from './adapter-ui';
import { runAssembler, runAssemblerBin } from './assembler';

export function resolveExtraListings(
  platform: string,
  simpleConfig?: SimplePlatformConfigNormalized,
  tec1Config?: Tec1PlatformConfigNormalized,
  tec1gConfig?: Tec1gPlatformConfigNormalized
): string[] {
  if (platform === 'simple') {
    return simpleConfig?.extraListings ?? [];
  }
  if (platform === 'tec1') {
    return tec1Config?.extraListings ?? [];
  }
  if (platform === 'tec1g') {
    return tec1gConfig?.extraListings ?? [];
  }
  return [];
}

export function assembleIfRequested(options: {
  args: LaunchRequestArguments;
  asmPath: string | undefined;
  hexPath: string;
  listingPath: string;
  platform: string;
  simpleConfig?: SimplePlatformConfigNormalized;
  sendEvent: EventSender;
}): void {
  const { args, asmPath, hexPath, listingPath, platform, simpleConfig, sendEvent } = options;
  if (asmPath === undefined || asmPath === '' || args.assemble === false) {
    return;
  }

  const result = runAssembler(asmPath, hexPath, listingPath, (message) => {
    emitConsoleOutput(sendEvent, message, { newline: false });
  });
  if (!result.success) {
    throw new Error(result.error ?? 'asm80 failed to assemble');
  }

  if (
    platform === 'simple' &&
    simpleConfig?.binFrom !== undefined &&
    simpleConfig.binTo !== undefined
  ) {
    const binResult = runAssemblerBin(
      asmPath,
      hexPath,
      simpleConfig.binFrom,
      simpleConfig.binTo,
      (message) => {
        emitConsoleOutput(sendEvent, message, { newline: false });
      }
    );
    if (!binResult.success) {
      throw new Error(binResult.error ?? 'asm80 failed to build binary');
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
