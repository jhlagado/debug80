/**
 * @fileoverview Launch pipeline helpers (config normalization, assembly).
 */

import type { SimplePlatformConfigNormalized } from '@jhlagado/debug80-runtime/platforms/types';
import { AssembleFailureError } from './assembler';
import type { AssemblerBackend } from './assembler-backend';
import type { LaunchRequestArguments } from '../session/types';
import { emitConsoleOutput, type EventSender } from '../session/adapter-ui';

export async function assembleIfRequested(options: {
  backend: AssemblerBackend;
  args: LaunchRequestArguments;
  asmPath: string | undefined;
  hexPath: string;
  sourceRoot?: string;
  platform: string;
  simpleConfig?: SimplePlatformConfigNormalized;
  sendEvent?: EventSender;
  onOutput?: (message: string) => void;
}): Promise<void> {
  const {
    backend,
    args,
    asmPath,
    hexPath,
    sourceRoot,
    platform,
    simpleConfig,
    sendEvent,
    onOutput,
  } = options;
  if (asmPath === undefined || asmPath === '' || args.assemble === false) {
    return;
  }

  const result = await backend.assemble({
    asmPath,
    hexPath,
    ...(sourceRoot !== undefined ? { sourceRoot } : {}),
    ...(args.azm !== undefined ? { azm: args.azm } : {}),
    onOutput: (message) => {
      onOutput?.(message);
      if (sendEvent !== undefined) {
        emitConsoleOutput(sendEvent, message, { newline: false });
      }
    },
  });
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
    const binResult = await backend.assembleBin?.({
      asmPath,
      hexPath,
      binFrom: simpleConfig.binFrom,
      binTo: simpleConfig.binTo,
      ...(sourceRoot !== undefined ? { sourceRoot } : {}),
      ...(args.azm !== undefined ? { azm: args.azm } : {}),
      onOutput: (message) => {
        onOutput?.(message);
        if (sendEvent !== undefined) {
          emitConsoleOutput(sendEvent, message, { newline: false });
        }
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
