import {
  DEFAULT_RUNTIME_STREAM_STATUS_POLICY,
  MemoryRuntimeByteStreams,
  RUNTIME_STREAM_SERVICE,
  type MemoryRuntimeByteStreamsState,
  type RuntimeByteStreams,
  type RuntimeStreamStatusPolicy,
} from "@jhlagado/z80-tool-services";

import { Service, ServiceError } from "./runtime-contract.js";

export const NUCLEUS_RUNTIME_STREAM_SERVICE = Object.freeze({
  [Service.readInputByte]: RUNTIME_STREAM_SERVICE.readInputByte,
  [Service.writeOutputByte]: RUNTIME_STREAM_SERVICE.writeOutputByte,
  [Service.readStorageByte]: RUNTIME_STREAM_SERVICE.readStorageByte,
  [Service.rewindStorageInput]: RUNTIME_STREAM_SERVICE.rewindStorageInput,
  [Service.writeStorageByte]: RUNTIME_STREAM_SERVICE.writeStorageByte,
  [Service.seekStorageOutput]: RUNTIME_STREAM_SERVICE.seekStorageOutput,
});

export const NUCLEUS_RUNTIME_STREAM_STATUS_POLICY: RuntimeStreamStatusPolicy =
  Object.freeze({
    ...DEFAULT_RUNTIME_STREAM_STATUS_POLICY,
    success: 0x00,
    endOfInput: ServiceError.endOfInput,
    inputFailure: ServiceError.inputFailure,
    outputFailure: ServiceError.outputFailure,
    storageFailure: ServiceError.storageFailure,
  });

export const NUCLEUS_PROOF_RUNTIME_STREAM_LIMITS = Object.freeze({
  outputCapacity: 4,
  storageOutputCapacity: 4,
});

export interface NucleusProofRuntimeStreamsOptions extends Omit<
  MemoryRuntimeByteStreamsState,
  "policy" | "outputCapacity" | "storageOutputCapacity"
> {
  readonly outputCapacity?: number;
  readonly storageOutputCapacity?: number;
}

export const createNucleusProofRuntimeStreams = (
  options: NucleusProofRuntimeStreamsOptions = {},
): RuntimeByteStreams =>
  new MemoryRuntimeByteStreams({
    ...options,
    policy: NUCLEUS_RUNTIME_STREAM_STATUS_POLICY,
    outputCapacity:
      options.outputCapacity ??
      NUCLEUS_PROOF_RUNTIME_STREAM_LIMITS.outputCapacity,
    storageOutputCapacity:
      options.storageOutputCapacity ??
      NUCLEUS_PROOF_RUNTIME_STREAM_LIMITS.storageOutputCapacity,
  });
