import {
  createRuntimeStreamIoHandlers,
  createRuntimeStreamIoStubBytes,
  type RuntimeByteStreams,
  type RuntimeStreamIoHandlers,
} from "@jhlagado/z80-tool-services";

import type { RuntimeServiceAddresses } from "./nobj.js";
import {
  nucleusRuntimeServiceVectorBytes,
  type nucleusRuntimeServiceOrder,
} from "./nucleus-runtime.js";
import { Service } from "./runtime-contract.js";
import {
  createNucleusProofRuntimeStreams,
  NUCLEUS_RUNTIME_STREAM_IO_OPERATION,
  NUCLEUS_RUNTIME_STREAM_STATUS_POLICY,
  type NucleusProofRuntimeStreamsOptions,
} from "./runtime-services.js";

export const NUCLEUS_HOST_RUNTIME_STREAM_STUB_SPACING = 0x20;

export const nucleusRuntimeStreamServiceOrdinals = [
  Service.readInputByte,
  Service.writeOutputByte,
  Service.readStorageByte,
  Service.rewindStorageInput,
  Service.writeStorageByte,
  Service.seekStorageOutput,
] as const;

type RuntimeServiceName = (typeof nucleusRuntimeServiceOrder)[number];

export type NucleusRuntimeStreamServiceOrdinal =
  (typeof nucleusRuntimeStreamServiceOrdinals)[number];

export interface NucleusHostRuntimeStreamStub {
  readonly service: NucleusRuntimeStreamServiceOrdinal;
  readonly address: number;
  readonly bytes: Uint8Array;
}

export interface NucleusHostRuntimeStreamAdapterOptions {
  readonly baseServices: RuntimeServiceAddresses;
  readonly stubBase: number;
  readonly stubSpacing?: number;
  readonly streamOptions?: NucleusProofRuntimeStreamsOptions;
  readonly streams?: RuntimeByteStreams;
}

export interface NucleusHostRuntimeStreamAdapter {
  readonly streams: RuntimeByteStreams;
  readonly io: RuntimeStreamIoHandlers;
  readonly serviceAddresses: RuntimeServiceAddresses;
  readonly vectorBytes: Uint8Array;
  readonly stubs: readonly NucleusHostRuntimeStreamStub[];
  install(memory: Uint8Array, vectorBase: number): void;
}

const streamServiceName = (
  service: NucleusRuntimeStreamServiceOrdinal,
): RuntimeServiceName => {
  switch (service) {
    case Service.readInputByte:
      return "readInputByte";
    case Service.writeOutputByte:
      return "writeOutputByte";
    case Service.readStorageByte:
      return "readStorageByte";
    case Service.rewindStorageInput:
      return "rewindStorageInput";
    case Service.writeStorageByte:
      return "writeStorageByte";
    case Service.seekStorageOutput:
      return "seekStorageOutput";
  }
};

const checkedAddress = (name: string, value: number): number => {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new RangeError(`${name} is outside 0..65535`);
  }
  return value;
};

const checkMemoryWrite = (
  memory: Uint8Array,
  name: string,
  address: number,
  bytes: Uint8Array,
): void => {
  if (address + bytes.length > memory.length) {
    throw new RangeError(`${name} crosses memory end`);
  }
};

export const createNucleusHostRuntimeStreamAdapter = ({
  baseServices,
  stubBase,
  stubSpacing = NUCLEUS_HOST_RUNTIME_STREAM_STUB_SPACING,
  streamOptions,
  streams = createNucleusProofRuntimeStreams(streamOptions),
}: NucleusHostRuntimeStreamAdapterOptions): NucleusHostRuntimeStreamAdapter => {
  checkedAddress("stub base", stubBase);
  if (!Number.isInteger(stubSpacing) || stubSpacing <= 0) {
    throw new RangeError("stub spacing is invalid");
  }

  const stubs: NucleusHostRuntimeStreamStub[] = [];
  const streamServiceAddresses = new Map<RuntimeServiceName, number>();
  nucleusRuntimeStreamServiceOrdinals.forEach((service, index) => {
    const address = checkedAddress(
      `${streamServiceName(service)} stub address`,
      stubBase + stubSpacing * index,
    );
    const bytes = createRuntimeStreamIoStubBytes(
      NUCLEUS_RUNTIME_STREAM_IO_OPERATION[service],
    );
    if (bytes.length > stubSpacing) {
      throw new RangeError(`${streamServiceName(service)} stub exceeds spacing`);
    }
    streamServiceAddresses.set(streamServiceName(service), address);
    stubs.push({ service, address, bytes });
  });

  const serviceAddresses: RuntimeServiceAddresses = {
    ...baseServices,
    readInputByte:
      streamServiceAddresses.get("readInputByte") ?? baseServices.readInputByte,
    writeOutputByte:
      streamServiceAddresses.get("writeOutputByte") ??
      baseServices.writeOutputByte,
    readStorageByte:
      streamServiceAddresses.get("readStorageByte") ??
      baseServices.readStorageByte,
    rewindStorageInput:
      streamServiceAddresses.get("rewindStorageInput") ??
      baseServices.rewindStorageInput,
    writeStorageByte:
      streamServiceAddresses.get("writeStorageByte") ??
      baseServices.writeStorageByte,
    seekStorageOutput:
      streamServiceAddresses.get("seekStorageOutput") ??
      baseServices.seekStorageOutput,
  };
  const vectorBytes = nucleusRuntimeServiceVectorBytes(serviceAddresses);
  const io = createRuntimeStreamIoHandlers(streams, {
    statusPolicy: NUCLEUS_RUNTIME_STREAM_STATUS_POLICY,
  });

  return {
    streams,
    io,
    serviceAddresses,
    vectorBytes,
    stubs,
    install(memory: Uint8Array, vectorBase: number): void {
      checkedAddress("vector base", vectorBase);
      checkMemoryWrite(memory, "service vector", vectorBase, vectorBytes);
      memory.set(vectorBytes, vectorBase);
      for (const stub of stubs) {
        checkMemoryWrite(
          memory,
          streamServiceName(stub.service),
          stub.address,
          stub.bytes,
        );
        memory.set(stub.bytes, stub.address);
      }
    },
  };
};
