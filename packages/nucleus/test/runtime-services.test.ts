import { describe, expect, it } from "vitest";
import {
  dispatchRuntimeStreamService,
  runRuntimeByteStreamsConformance,
} from "@jhlagado/z80-tool-services";

import {
  createNucleusProofRuntimeStreams,
  NUCLEUS_PROOF_RUNTIME_STREAM_LIMITS,
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
