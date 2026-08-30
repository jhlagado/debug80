/**
 * @fileoverview Launch pipeline helpers (config normalization, assembly).
 */

import type { SimplePlatformConfigNormalized } from '@jhlagado/debug80-runtime/platforms/types';
import { AssembleFailureError, type ContractUpdateFile } from './assembler';
import type { AssemblerBackend } from './assembler-backend';
import type { LaunchRequestArguments } from '../session/types';
import { emitConsoleOutput, type EventSender } from '../session/adapter-ui';

function resolveSimpleBinaryRange(
  simpleConfig: SimplePlatformConfigNormalized | undefined
): { binFrom: number; binTo: number } | undefined {
  const binFrom = simpleConfig?.binFrom;
  const binTo = simpleConfig?.binTo;
  if ((binFrom !== undefined) !== (binTo !== undefined)) {
    throw new AssembleFailureError({
      success: false,
      error: 'simple.binFrom and simple.binTo must be specified together',
    });
  }
  if (binFrom !== undefined && binTo !== undefined && binFrom > binTo) {
    throw new AssembleFailureError({
      success: false,
      error: `simple.binFrom must be less than or equal to simple.binTo, got ${binFrom} > ${binTo}`,
    });
  }
  return binFrom !== undefined && binTo !== undefined ? { binFrom, binTo } : undefined;
}

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
}): Promise<{ contractUpdates?: ContractUpdateFile[] }> {
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
    return {};
  }

  const binaryRange = platform === 'simple' ? resolveSimpleBinaryRange(simpleConfig) : undefined;
  if (binaryRange !== undefined && backend.supportsRangedBinary !== true) {
    throw new AssembleFailureError({
      success: false,
      error: `${backend.id} does not support simple.binFrom/simple.binTo; choose an assembler backend with ranged binary output.`,
    });
  }

  const result = await backend.assemble({
    asmPath,
    hexPath,
    ...(binaryRange !== undefined ? { binaryRange } : {}),
    ...(sourceRoot !== undefined ? { sourceRoot } : {}),
    ...(args.azm !== undefined ? { azm: args.azm } : {}),
    ...(args.glimmer !== undefined ? { glimmer: args.glimmer } : {}),
    ...(args.nucleus !== undefined ? { nucleus: args.nucleus } : {}),
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

  const contractUpdates = result.contractUpdates;

  return contractUpdates !== undefined ? { contractUpdates } : {};
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
