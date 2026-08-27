import { describe, expect, it } from "vitest";
import { createZ80Runtime } from "@jhlagado/debug80-runtime";
import {
  createRuntimeStreamIoHandlers,
  dispatchRuntimeStreamService,
  RUNTIME_STREAM_IO_OPERATION,
  RUNTIME_STREAM_IO_PORT,
  runRuntimeByteStreamsConformance,
} from "@jhlagado/z80-tool-services";

import {
  defaultRuntimeLinkContext,
  nucleusRuntimeServiceVectorBytes,
} from "../src/nucleus-runtime.js";
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

  it("can route the writeOutputByte vector through a host-backed I/O stub", () => {
    const serviceVectorBase = 0x4000;
    const stubAddress = 0x4100;
    const entryAddress = 0x0100;
    const statusAddress = 0x5000;

    const run = (failOutputWrites = false) => {
      const streams = createNucleusProofRuntimeStreams({ failOutputWrites });
      const io = createRuntimeStreamIoHandlers(streams, {
        statusPolicy: NUCLEUS_RUNTIME_STREAM_STATUS_POLICY,
      });
      const memory = new Uint8Array(0x10000);
      memory.set(
        nucleusRuntimeServiceVectorBytes({
          ...defaultRuntimeLinkContext.services,
          writeOutputByte: stubAddress,
        }),
        serviceVectorBase,
      );
      memory.set(
        Uint8Array.of(
          0x4f, // LD C,A
          0x3e,
          NUCLEUS_RUNTIME_STREAM_IO_OPERATION[Service.writeOutputByte],
          0xd3,
          RUNTIME_STREAM_IO_PORT.operation, // OUT (operation),A
          0x79, // LD A,C
          0xd3,
          RUNTIME_STREAM_IO_PORT.value, // OUT (value),A
          0xdb,
          RUNTIME_STREAM_IO_PORT.status, // IN A,(status)
          0xb7, // OR A
          0xc8, // RET Z
          0x37, // SCF
          0xc9, // RET
        ),
        stubAddress,
      );
      memory.set(
        Uint8Array.of(
          0x31,
          0x00,
          0xff, // LD SP,$FF00
          0x3e,
          0x41, // LD A,'A'
          0xcd,
          (serviceVectorBase + Service.writeOutputByte * 3) & 0xff,
          (serviceVectorBase + Service.writeOutputByte * 3) >>> 8, // CALL vector
          0x32,
          statusAddress & 0xff,
          statusAddress >>> 8, // LD (status),A
          0x76, // HALT
        ),
        entryAddress,
      );

      const runtime = createZ80Runtime(
        { memory, startAddress: entryAddress },
        entryAddress,
        io,
      );
      for (let step = 0; step < 32 && !runtime.isHalted(); step += 1) {
        runtime.step();
      }
      expect(runtime.isHalted()).toBe(true);
      expect(runtime.cpu.sp).toBe(0xff00);
      return { runtime, streams };
    };

    const success = run();
    expect(success.runtime.hardware.memory[statusAddress]).toBe(0);
    expect(success.runtime.cpu.flags.C).toBe(0);
    expect([...success.streams.output]).toEqual([0x41]);

    const failure = run(true);
    expect(failure.runtime.hardware.memory[statusAddress]).toBe(
      ServiceError.outputFailure,
    );
    expect(failure.runtime.cpu.flags.C).toBe(1);
    expect([...failure.streams.output]).toEqual([]);
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
