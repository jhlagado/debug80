import { describe, expect, it } from "vitest";
import { createZ80Runtime } from "@jhlagado/debug80-runtime";
import {
  dispatchRuntimeStreamService,
  RUNTIME_STREAM_IO_OPERATION,
  runRuntimeByteStreamsConformance,
  runRuntimeStreamIoConformance,
} from "@jhlagado/z80-tool-services";

import { defaultRuntimeLinkContext } from "../src/nucleus-runtime.js";
import { createNucleusHostRuntimeStreamAdapter } from "../src/runtime-stream-adapter.js";
import {
  createNucleusProofRuntimeStreams,
  NUCLEUS_PROOF_RUNTIME_STREAM_LIMITS,
  NUCLEUS_RUNTIME_STREAM_IO_OPERATION,
  NUCLEUS_RUNTIME_STREAM_SERVICE,
  NUCLEUS_RUNTIME_STREAM_STATUS_POLICY,
  runNucleusProofRuntimeStreamOperations,
} from "../src/runtime-services.js";
import { Service, ServiceError } from "../src/runtime-contract.js";

describe("Nucleus runtime stream services", () => {
  it("passes the shared runtime byte-stream conformance vectors", () => {
    expect(
      runRuntimeByteStreamsConformance(
        {
          create: (state) =>
            createNucleusProofRuntimeStreams({
              ...state,
              outputCapacity: Number.POSITIVE_INFINITY,
              storageOutputCapacity: Number.POSITIVE_INFINITY,
            }),
        },
        NUCLEUS_RUNTIME_STREAM_STATUS_POLICY,
      ),
    ).toEqual({ vectors: 4, assertions: 30 });
  });

  it("maps stable Nucleus service ordinals to shared operation names", () => {
    expect(NUCLEUS_RUNTIME_STREAM_SERVICE).toEqual({
      [Service.readInputByte]: "readInputByte",
      [Service.writeOutputByte]: "writeOutputByte",
      [Service.readStorageByte]: "readStorageByte",
      [Service.rewindStorageInput]: "rewindStorageInput",
      [Service.writeStorageByte]: "writeStorageByte",
      [Service.seekStorageOutput]: "seekStorageOutput",
    });
  });

  it("maps stable Nucleus service ordinals to shared I/O operation numbers", () => {
    expect(NUCLEUS_RUNTIME_STREAM_IO_OPERATION).toEqual({
      [Service.readInputByte]: RUNTIME_STREAM_IO_OPERATION.readInputByte,
      [Service.writeOutputByte]: RUNTIME_STREAM_IO_OPERATION.writeOutputByte,
      [Service.readStorageByte]: RUNTIME_STREAM_IO_OPERATION.readStorageByte,
      [Service.rewindStorageInput]:
        RUNTIME_STREAM_IO_OPERATION.rewindStorageInput,
      [Service.writeStorageByte]: RUNTIME_STREAM_IO_OPERATION.writeStorageByte,
      [Service.seekStorageOutput]: RUNTIME_STREAM_IO_OPERATION.seekStorageOutput,
    });
  });

  it("uses Nucleus service-error codes and proof capacities by default", () => {
    expect(NUCLEUS_RUNTIME_STREAM_STATUS_POLICY).toMatchObject({
      endOfInput: ServiceError.endOfInput,
      inputFailure: ServiceError.inputFailure,
      outputFailure: ServiceError.outputFailure,
      storageFailure: ServiceError.storageFailure,
    });
    expect(NUCLEUS_PROOF_RUNTIME_STREAM_LIMITS).toEqual({
      outputCapacity: 4,
      storageOutputCapacity: 4,
    });

    const streams = createNucleusProofRuntimeStreams();
    for (const value of [1, 2, 3, 4]) {
      expect(streams.writeOutputByte({ value })).toEqual({ status: 0 });
    }
    expect(streams.writeOutputByte({ value: 5 })).toEqual({
      status: ServiceError.outputFailure,
    });
    expect([...streams.output]).toEqual([1, 2, 3, 4]);
  });

  it("can route every stream-service vector through host-backed I/O stubs", () => {
    const serviceVectorBase = 0x4000;
    const stubAddress = 0x4100;
    const entryAddress = 0x0100;
    const resultAddress = 0x5000;
    const statusBase = 0x5010;
    const stubSpacing = 0x20;

    const run = (
      options: Parameters<typeof createNucleusProofRuntimeStreams>[0] = {},
    ) => {
      const adapter = createNucleusHostRuntimeStreamAdapter({
        baseServices: defaultRuntimeLinkContext.services,
        stubBase: stubAddress,
        streamOptions: options,
      });
      const memory = new Uint8Array(0x10000);
      adapter.install(memory, serviceVectorBase);
      memory.set(
        Uint8Array.of(
          0x31,
          0x00,
          0xff, // LD SP,$FF00
          0x3e,
          0x51, // LD A,'Q'
          0xcd,
          (serviceVectorBase + Service.writeOutputByte * 3) & 0xff,
          (serviceVectorBase + Service.writeOutputByte * 3) >>> 8, // CALL vector
          0x32,
          statusBase & 0xff,
          statusBase >>> 8, // LD (status+0),A
          0xcd,
          (serviceVectorBase + Service.readInputByte * 3) & 0xff,
          (serviceVectorBase + Service.readInputByte * 3) >>> 8, // CALL vector
          0x32,
          resultAddress & 0xff,
          resultAddress >>> 8, // LD (result),A
          0x3e,
          0x52, // LD A,'R'
          0xcd,
          (serviceVectorBase + Service.writeStorageByte * 3) & 0xff,
          (serviceVectorBase + Service.writeStorageByte * 3) >>> 8, // CALL vector
          0x32,
          (statusBase + 1) & 0xff,
          (statusBase + 1) >>> 8, // LD (status+1),A
          0xcd,
          (serviceVectorBase + Service.readStorageByte * 3) & 0xff,
          (serviceVectorBase + Service.readStorageByte * 3) >>> 8, // CALL vector
          0x32,
          (resultAddress + 1) & 0xff,
          (resultAddress + 1) >>> 8, // LD (result+1),A
          0xcd,
          (serviceVectorBase + Service.rewindStorageInput * 3) & 0xff,
          (serviceVectorBase + Service.rewindStorageInput * 3) >>> 8, // CALL vector
          0x32,
          (statusBase + 2) & 0xff,
          (statusBase + 2) >>> 8, // LD (status+2),A
          0x21,
          0x01,
          0x00, // LD HL,1
          0xcd,
          (serviceVectorBase + Service.seekStorageOutput * 3) & 0xff,
          (serviceVectorBase + Service.seekStorageOutput * 3) >>> 8, // CALL vector
          0x32,
          (statusBase + 3) & 0xff,
          (statusBase + 3) >>> 8, // LD (status+3),A
          0x3e,
          0x53, // LD A,'S'
          0xcd,
          (serviceVectorBase + Service.writeStorageByte * 3) & 0xff,
          (serviceVectorBase + Service.writeStorageByte * 3) >>> 8, // CALL vector
          0x32,
          (statusBase + 4) & 0xff,
          (statusBase + 4) >>> 8, // LD (status+4),A
          0x21,
          0x00,
          0x01, // LD HL,$0100
          0xcd,
          (serviceVectorBase + Service.seekStorageOutput * 3) & 0xff,
          (serviceVectorBase + Service.seekStorageOutput * 3) >>> 8, // CALL vector
          0x32,
          (statusBase + 5) & 0xff,
          (statusBase + 5) >>> 8, // LD (status+5),A
          0x76, // HALT
        ),
        entryAddress,
      );

      const runtime = createZ80Runtime(
        { memory, startAddress: entryAddress },
        entryAddress,
        adapter.io,
      );
      for (let step = 0; step < 96 && !runtime.isHalted(); step += 1) {
        runtime.step();
      }
      expect(runtime.isHalted()).toBe(true);
      expect(runtime.cpu.sp).toBe(0xff00);
      return { runtime, streams: adapter.streams, adapter };
    };

    const success = run({
      input: [0x41],
      storageInput: [0x42],
      storageOutput: [0x30],
    });
    expect(success.runtime.hardware.memory[statusBase]).toBe(0);
    expect(success.runtime.cpu.flags.C).toBe(1);
    expect([...success.runtime.hardware.memory.slice(resultAddress, resultAddress + 2)]).toEqual([
      0x41,
      0x42,
    ]);
    expect([...success.streams.output]).toEqual([0x51]);
    expect([...success.streams.storageOutput]).toEqual([0x30, 0x53]);
    expect(success.streams.storageInputOffset).toBe(0);
    expect(success.streams.storageOutputOffset).toBe(2);
    expect(success.adapter.serviceAddresses.writeOutputByte).toBe(
      stubAddress + stubSpacing,
    );
    expect(success.adapter.serviceAddresses.trap).toBe(
      defaultRuntimeLinkContext.services.trap,
    );
    expect(success.adapter.stubs).toHaveLength(6);
    expect([...success.runtime.hardware.memory.slice(statusBase, statusBase + 6)]).toEqual([
      0,
      0,
      0,
      0,
      0,
      ServiceError.storageFailure,
    ]);

    const failure = run({ failOutputWrites: true });
    expect(failure.runtime.hardware.memory[statusBase]).toBe(
      ServiceError.outputFailure,
    );
    expect([...failure.streams.output]).toEqual([]);
  });

  it("passes the shared byte-wide I/O port conformance vectors", () => {
    expect(
      runRuntimeStreamIoConformance(
        {
          create: (state) => {
            const adapter = createNucleusHostRuntimeStreamAdapter({
              baseServices: defaultRuntimeLinkContext.services,
              stubBase: 0x4100,
              streamOptions: state,
            });
            return {
              streams: adapter.streams,
              io: adapter.io,
            };
          },
        },
        NUCLEUS_RUNTIME_STREAM_STATUS_POLICY,
      ),
    ).toEqual({ vectors: 3, assertions: 21 });
  });

  it("preserves the Z80 proof runtime's selected output-call failure", () => {
    const streams = createNucleusProofRuntimeStreams({
      failOutputWriteCall: 2,
    });

    expect(streams.writeOutputByte({ value: 0x41 })).toEqual({ status: 0 });
    expect(streams.writeOutputByte({ value: 0x42 })).toEqual({
      status: ServiceError.outputFailure,
    });
    expect(streams.writeOutputByte({ value: 0x43 })).toEqual({ status: 0 });
    expect(streams.outputWriteCalls).toBe(3);
    expect([...streams.output]).toEqual([0x41, 0x43]);
  });

  it("preserves storage overwrite, append, seek failure, and reset semantics", () => {
    const streams = createNucleusProofRuntimeStreams({
      storageInput: [0x10],
      storageOutput: [0x01, 0x02],
    });

    expect(
      dispatchRuntimeStreamService(
        streams,
        NUCLEUS_RUNTIME_STREAM_SERVICE[Service.readStorageByte],
      ),
    ).toEqual({ status: 0, value: 0x10 });
    expect(
      dispatchRuntimeStreamService(
        streams,
        NUCLEUS_RUNTIME_STREAM_SERVICE[Service.readStorageByte],
      ),
    ).toEqual({ status: ServiceError.endOfInput });
    expect(
      dispatchRuntimeStreamService(
        streams,
        NUCLEUS_RUNTIME_STREAM_SERVICE[Service.seekStorageOutput],
        { offset: 1 },
      ),
    ).toEqual({ status: 0 });
    expect(
      dispatchRuntimeStreamService(
        streams,
        NUCLEUS_RUNTIME_STREAM_SERVICE[Service.writeStorageByte],
        { value: 0x99 },
      ),
    ).toEqual({ status: 0 });
    expect(
      dispatchRuntimeStreamService(
        streams,
        NUCLEUS_RUNTIME_STREAM_SERVICE[Service.writeStorageByte],
        { value: 0x88 },
      ),
    ).toEqual({ status: 0 });
    expect(
      dispatchRuntimeStreamService(
        streams,
        NUCLEUS_RUNTIME_STREAM_SERVICE[Service.writeStorageByte],
        { value: 0x77 },
      ),
    ).toEqual({ status: 0 });
    expect(
      dispatchRuntimeStreamService(
        streams,
        NUCLEUS_RUNTIME_STREAM_SERVICE[Service.writeStorageByte],
        { value: 0x66 },
      ),
    ).toEqual({ status: ServiceError.storageFailure });
    expect([...streams.storageOutput]).toEqual([0x01, 0x99, 0x88, 0x77]);

    streams.reset();
    expect(streams.storageInputOffset).toBe(0);
    expect(streams.storageOutputOffset).toBe(2);
    expect([...streams.storageOutput]).toEqual([0x01, 0x02]);
  });

  it("derives the Stage 8 storage-success proof observation from shared streams", () => {
    const snapshot = runNucleusProofRuntimeStreamOperations(
      {
        storageInput: ["A".charCodeAt(0)],
      },
      [
        { service: "readStorageByte" },
        { service: "rewindStorageInput" },
        { service: "readStorageByte" },
        { service: "writeStorageByte", value: "A".charCodeAt(0) },
        { service: "writeStorageByte", value: "B".charCodeAt(0) },
        { service: "seekStorageOutput", offset: 0 },
        { service: "writeStorageByte", value: "Z".charCodeAt(0) },
        { service: "writeOutputByte", value: "A".charCodeAt(0) },
      ],
    );

    expect(snapshot.storageInputOffset).toBe(1);
    expect(snapshot.storageOutputOffset).toBe(1);
    expect([...(snapshot.storageOutput ?? [])]).toEqual([
      "Z".charCodeAt(0),
      "B".charCodeAt(0),
    ]);
    expect([...(snapshot.output ?? [])]).toEqual(["A".charCodeAt(0)]);
  });

  it("derives Stage 8 storage-failure proof observations from shared streams", () => {
    const writeFailure = runNucleusProofRuntimeStreamOperations(
      {
        storageOutput: ["X".charCodeAt(0), "Y".charCodeAt(0)],
        failStorageWrites: true,
      },
      [
        { service: "seekStorageOutput", offset: 1 },
        { service: "writeStorageByte", value: "Z".charCodeAt(0) },
        { service: "writeOutputByte", value: ServiceError.storageFailure },
      ],
    );
    expect(writeFailure.storageOutputOffset).toBe(1);
    expect([...(writeFailure.storageOutput ?? [])]).toEqual([
      "X".charCodeAt(0),
      "Y".charCodeAt(0),
    ]);
    expect([...(writeFailure.output ?? [])]).toEqual([
      ServiceError.storageFailure,
    ]);

    const rewindFailure = runNucleusProofRuntimeStreamOperations(
      {
        storageInput: [0],
        failStorageRewind: true,
      },
      [
        { service: "readStorageByte" },
        { service: "readStorageByte" },
        { service: "rewindStorageInput" },
        { service: "writeOutputByte", value: ServiceError.storageFailure },
      ],
    );
    expect(rewindFailure.storageInputOffset).toBe(1);
    expect([...(rewindFailure.output ?? [])]).toEqual([
      ServiceError.storageFailure,
    ]);
  });
});
