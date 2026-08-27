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

export interface NucleusProofRuntimeStreamSnapshot {
  readonly output?: Uint8Array;
  readonly storageOutput?: Uint8Array;
  readonly inputOffset?: number;
  readonly outputWriteCalls?: number;
  readonly storageInputOffset?: number;
  readonly storageOutputOffset?: number;
}

export interface NucleusProofRuntimeStreamSnapshotSource {
  readonly symbols: Readonly<Record<string, number>>;
  readonly memory: Uint8Array;
}

export type NucleusProofRuntimeStreamOperation =
  | { readonly service: "readInputByte" }
  | { readonly service: "writeOutputByte"; readonly value: number }
  | { readonly service: "readStorageByte" }
  | { readonly service: "rewindStorageInput" }
  | { readonly service: "writeStorageByte"; readonly value: number }
  | { readonly service: "seekStorageOutput"; readonly offset: number }
  | { readonly service: "reset" };

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

export const snapshotNucleusProofRuntimeStreams = (
  streams: RuntimeByteStreams,
): NucleusProofRuntimeStreamSnapshot => ({
  output: streams.output,
  storageOutput: streams.storageOutput,
  inputOffset: streams.inputOffset,
  outputWriteCalls: streams.outputWriteCalls,
  storageInputOffset: streams.storageInputOffset,
  storageOutputOffset: streams.storageOutputOffset,
});

export const runNucleusProofRuntimeStreamOperations = (
  options: NucleusProofRuntimeStreamsOptions,
  operations: readonly NucleusProofRuntimeStreamOperation[],
): NucleusProofRuntimeStreamSnapshot => {
  const streams = createNucleusProofRuntimeStreams(options);
  for (const operation of operations) {
    switch (operation.service) {
      case "readInputByte":
        streams.readInputByte();
        break;
      case "writeOutputByte":
        streams.writeOutputByte({ value: operation.value });
        break;
      case "readStorageByte":
        streams.readStorageByte();
        break;
      case "rewindStorageInput":
        streams.rewindStorageInput();
        break;
      case "writeStorageByte":
        streams.writeStorageByte({ value: operation.value });
        break;
      case "seekStorageOutput":
        streams.seekStorageOutput({ offset: operation.offset });
        break;
      case "reset":
        streams.reset();
        break;
    }
  }
  return snapshotNucleusProofRuntimeStreams(streams);
};

export const readNucleusProofRuntimeStreamSnapshot = ({
  symbols,
  memory,
}: NucleusProofRuntimeStreamSnapshotSource): NucleusProofRuntimeStreamSnapshot => {
  const symbol = (name: string): number | undefined => {
    const wanted = name.toLowerCase();
    for (const [candidate, value] of Object.entries(symbols)) {
      if (candidate.toLowerCase() === wanted) return value;
    }
    return undefined;
  };

  const byteAt = (name: string): number | undefined => {
    const address = symbol(name);
    return address === undefined ? undefined : memory[address];
  };

  const bytesAt = (
    baseName: string,
    lengthName: string,
  ): Uint8Array | undefined => {
    const base = symbol(baseName);
    const length = byteAt(lengthName);
    if (base === undefined || length === undefined) return undefined;
    return memory.slice(base, base + length);
  };

  const output = bytesAt("ServiceOutputBase", "ServiceOutputLength");
  const storageOutput = bytesAt(
    "ServiceStorageOutputBase",
    "ServiceStorageOutputLength",
  );
  const inputOffset = byteAt("ServiceInputCursor");
  const outputWriteCalls = byteAt("ServiceCallCount");
  const storageInputOffset = byteAt("ServiceStorageInputCursor");
  const storageOutputOffset = byteAt("ServiceStorageOutputCursor");

  return {
    ...(output === undefined ? {} : { output }),
    ...(storageOutput === undefined ? {} : { storageOutput }),
    ...(inputOffset === undefined ? {} : { inputOffset }),
    ...(outputWriteCalls === undefined ? {} : { outputWriteCalls }),
    ...(storageInputOffset === undefined ? {} : { storageInputOffset }),
    ...(storageOutputOffset === undefined ? {} : { storageOutputOffset }),
  };
};
