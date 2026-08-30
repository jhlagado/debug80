import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  commitNobjAdapterGeneration,
  executeCommittedNobj,
  runProofManifest,
} from "../src/proof.js";
import {
  defaultRuntimeLinkContext,
  loadCanonicalRuntimeProvider,
} from "../src/nucleus-runtime.js";
import { nucleusPermanentAtomProofOptions } from "../src/atom-proof-options.js";
import { createNucleusHostRuntimeStreamLink } from "../src/runtime-stream-adapter.js";
import {
  NobjGenerationSink,
  NobjGenerationStore,
  type NobjBegin,
  type NobjMap,
  type RuntimeImageProvider,
  type RuntimeLinkContext,
} from "../src/nobj.js";

const proof = (name: string): string =>
  new URL(`../proofs/${name}.json`, import.meta.url).pathname;

const runPermanentAtomProof = async (
  name: string,
  options: Parameters<typeof runProofManifest>[1] = {},
) =>
  runProofManifest(proof(name), {
    ...(await nucleusPermanentAtomProofOptions(proof(name))),
    ...options,
  });

const emptyProvider: RuntimeImageProvider = { get: () => undefined };

interface TargetProofManifest {
  readonly nobj: {
    readonly begin: NobjBegin;
    readonly map: NobjMap;
    readonly runtimeLinkContext: RuntimeLinkContext;
    readonly execution: {
      readonly maxInstructions: number;
      readonly maxCycles: number;
      readonly halted: boolean;
      readonly initialSp?: number;
      readonly expectedSp?: number;
      readonly writes?: readonly {
        readonly at: number;
        readonly bytes: readonly number[];
      }[];
    };
    readonly observations?: readonly {
      readonly at: number;
      readonly width: "u8" | "u16";
      readonly equals: number;
      readonly bank?: number;
    }[];
  };
}

const targetManifest = (name: string): TargetProofManifest =>
  JSON.parse(readFileSync(proof(name), "utf8")) as TargetProofManifest;

describe("the NOBJ-aware proof runner", () => {
  it("runs a Z80 producer, commits its adapter calls, and executes fresh flat memory", async () => {
    const outcome = await runPermanentAtomProof("nobj-runner-proof");
    expect(outcome.nobj).toBeDefined();
    expect(outcome.nobj?.parsed.commit.recordCount).toBe(5);
    expect(outcome.nobj?.serialized).toHaveLength(92);
    expect(outcome.nobj?.instructions).toBe(3);
    expect(outcome.nobj?.memory[0x8081]).toBe(0x5a);
    expect(outcome.memory[0x8081]).toBe(0);
  });

  it("executes a banked committed image through a Nucleus-local selector hook", () => {
    const store = new NobjGenerationStore();
    const sink = new NobjGenerationSink(store, emptyProvider);
    sink.begin({
      banked: true,
      runtimeIdentity: 1,
      bankCount: 2,
      imageFill: 0,
      imageBase: 0x8000,
      imageCapacity: 0x100,
    });
    const bank0 = new Uint8Array(0x28);
    bank0.set([
      0x21, 0x20, 0x80, 0x11, 0x00, 0x40, 0x01, 8, 0, 0xed, 0xb0, 0xc3, 0x00,
      0x40,
    ]);
    bank0[0x19] = 0xc9;
    bank0.set([0x3e, 1, 0xd3, 0x7f, 0xcd, 0x10, 0x80, 0x76], 0x20);
    sink.image(0, 0x8000, bank0);
    sink.image(
      1,
      0x8010,
      Uint8Array.of(0x3e, 0x5a, 0x32, 0x00, 0x40, 0x3e, 0, 0xd3, 0x7f, 0xc9),
    );
    const map: NobjMap = {
      romMode: true,
      establishedStack: false,
      entryBank: 0,
      entryAddress: 0x8000,
      writableBase: 0x4000,
      writableCapacity: 0x100,
      vectorBase: 0x4000,
      vectorLength: 1,
      initializedRunBase: 0x4000,
      initializedRunLength: 1,
      bssBase: 0x4001,
      bssLength: 0,
      stackRequirement: 0,
      dataLoadBank: 0,
      dataLoadAddress: 0x8000,
      dataLoadLength: 1,
      partBanks: [0, 1],
      banks: [
        {
          usedLength: 0x28,
          readOnlyBase: 0,
          readOnlyLength: 0,
          aggregateConstantBase: 0,
          aggregateConstantLength: 0,
        },
        {
          usedLength: 0x1a,
          readOnlyBase: 0,
          readOnlyLength: 0,
          aggregateConstantBase: 0,
          aggregateConstantLength: 0,
        },
      ],
    };
    sink.map(map);
    const outcome = executeCommittedNobj(
      sink.commit(),
      { maxInstructions: 32, maxCycles: 1_024, halted: true },
      {
        bankSwitch: { port: 0x7f, windowBase: 0x8000, windowCapacity: 0x100 },
        observations: [{ at: 0x4000, width: "u8", equals: 0x5a }],
      },
    );
    expect(outcome.selectedBank).toBe(0);
    expect(outcome.memory[0x4000]).toBe(0x5a);
  });

  it("executes a committed host-backed runtime vector through host-backed runtime streams", async () => {
    const hostRuntime = createNucleusHostRuntimeStreamLink({
      runtimeLinkContext: {
        ...defaultRuntimeLinkContext,
        runtimeBase: 0x8100,
        writableBase: 0x4000,
        writableCapacity: 0x1000,
        writableStateBase: 0x4021,
        vectorBase: 0x4000,
        programDataBase: 0x4046,
        programDataCapacity: 0,
        readOnlyBase: 0x8300,
        readOnlyCapacity: 0,
      },
      stubBase: 0x4100,
    });
    const provider = await loadCanonicalRuntimeProvider([
      hostRuntime.runtimeLinkContext,
    ]);
    const linkedRuntime = provider.get(4, hostRuntime.runtimeLinkContext);
    expect(linkedRuntime).toBeDefined();
    if (linkedRuntime === undefined) return;

    const store = new NobjGenerationStore();
    const sink = new NobjGenerationSink(store, provider);
    const dataLoadAddress = 0x8270;
    sink.begin({
      banked: false,
      runtimeIdentity: linkedRuntime.identity,
      bankCount: 1,
      imageFill: 0,
      imageBase: 0x8000,
      imageCapacity: 0x400,
    });
    sink.image(
      0,
      0x8000,
      Uint8Array.of(
        0x21,
        dataLoadAddress & 0xff,
        dataLoadAddress >>> 8, // LD HL,dataLoadAddress
        0x11,
        0x00,
        0x40, // LD DE,$4000
        0x01,
        linkedRuntime.initialBytes.length,
        0x00, // LD BC,initialBytes.length
        0xed,
        0xb0, // LDIR
        0x31,
        0x00,
        0xff, // LD SP,$FF00
        0x3e,
        0x5a, // LD A,$5A
        0xcd,
        0x03,
        0x40, // CALL writeOutputByte vector
        0x76, // HALT
      ),
    );
    sink.runtimeImage(
      0,
      hostRuntime.runtimeLinkContext.runtimeBase,
      linkedRuntime.identity,
      hostRuntime.runtimeLinkContext,
      linkedRuntime.bytes.length,
    );
    sink.runtimeInitialImage(
      0,
      dataLoadAddress,
      linkedRuntime.identity,
      hostRuntime.runtimeLinkContext,
      linkedRuntime.initialBytes.length,
    );
    sink.map({
      romMode: true,
      establishedStack: false,
      entryBank: 0,
      entryAddress: 0x8000,
      writableBase: 0x4000,
      writableCapacity: hostRuntime.runtimeLinkContext.writableCapacity,
      vectorBase: 0x4000,
      vectorLength: linkedRuntime.vectorBytes.length,
      initializedRunBase: 0x4000,
      initializedRunLength: linkedRuntime.initialBytes.length,
      bssBase: 0x4000 + linkedRuntime.initialBytes.length,
      bssLength: 0,
      stackRequirement: 0,
      dataLoadBank: 0,
      dataLoadAddress,
      dataLoadLength: linkedRuntime.initialBytes.length,
      partBanks: [0],
      banks: [
        {
          usedLength:
            dataLoadAddress +
            linkedRuntime.initialBytes.length -
            0x8000,
          readOnlyBase: 0,
          readOnlyLength: 0,
          aggregateConstantBase: 0,
          aggregateConstantLength: 0,
        },
      ],
    });

    const outcome = executeCommittedNobj(
      sink.commit(),
      {
        maxInstructions: 128,
        maxCycles: 4_096,
        halted: true,
        expectedSp: 0xff00,
      },
      {
        runtimeStreams: {
          runtimeLinkContext: hostRuntime.runtimeLinkContext,
          stubBase: 0x4100,
          installVector: false,
        },
      },
    );

    expect([...(outcome.runtimeStreams?.output ?? [])]).toEqual([0x5a]);
    expect(outcome.runtimeStreams?.outputWriteCalls).toBe(1);
    expect(outcome.memory[0x4003]).toBe(0xc3);
    expect(outcome.memory[0x4004]).toBe(0x20);
    expect(outcome.memory[0x4005]).toBe(0x41);
    expect(outcome.memory[0x4100 + 0x20]).toBe(0x4f);
  });

  it("never starts execution for missing commits, invalid patches, or bad CRCs", () => {
    const attempts = [
      Uint8Array.of(1, 0, 0),
      Uint8Array.of(3, 4, 0, 0, 0, 0, 0),
      Uint8Array.of(5, 7, 0, 4, 0, 0, 0, 0, 0, 0, 0),
    ];
    for (const bytes of attempts) {
      expect(() =>
        executeCommittedNobj(bytes, {
          maxInstructions: 1,
          maxCycles: 4,
          halted: true,
        }),
      ).toThrow();
    }
  });

  it("keeps compiled A current after divergent late B output, then commits and executes compiled C", async () => {
    const producer = await runPermanentAtomProof("flat-target-z80-slice-proof");
    const success = targetManifest("flat-target-z80-slice-proof").nobj;
    const trap = targetManifest("flat-target-trap-z80-slice-proof").nobj;
    const chapter21 = targetManifest("chapter21-target-z80-slice-proof").nobj;
    const store = new NobjGenerationStore();
    const wordAt = (address: number): number =>
      (producer.memory[address] ?? 0) |
      ((producer.memory[address + 1] ?? 0) << 8);
    const operationKinds = (at: string, lengthAt: string): number[] => {
      const kinds: number[] = [];
      let cursor = producer.symbols[at] ?? -1;
      const end = cursor + wordAt(producer.symbols[lengthAt] ?? -1);
      while (cursor < end) {
        const kind = producer.memory[cursor] ?? 0;
        const count =
          (producer.memory[cursor + 4] ?? 0) |
          ((producer.memory[cursor + 5] ?? 0) << 8);
        kinds.push(kind);
        cursor += kind === 3 || kind === 4 ? 26 : 6 + count;
      }
      expect(cursor).toBe(end);
      return kinds;
    };
    const commitLog = (
      name: string,
      at: string,
      lengthAt: string,
      target: TargetProofManifest["nobj"],
      map: NobjMap = target.map,
    ): Promise<Uint8Array> =>
      commitNobjAdapterGeneration({
        name,
        producerMemory: producer.memory,
        start: producer.symbols[at] ?? -1,
        length: wordAt(producer.symbols[lengthAt] ?? -1),
        maxBytes: 12_288,
        begin: target.begin,
        map,
        runtimeLinkContext: target.runtimeLinkContext,
        store,
      });

    const artifactA = await commitLog(
      "compiled artifact A",
      "AdapterSuccessLogBase",
      "AdapterLogLength",
      success,
    );

    expect(
      operationKinds("AdapterFailedLogBase", "AdapterFailedLogLength"),
    ).toEqual(expect.arrayContaining([1, 2]));
    await expect(
      commitLog(
        "compiled artifact B",
        "AdapterFailedLogBase",
        "AdapterFailedLogLength",
        trap,
        { ...trap.map, entryAddress: 0x9000 },
      ),
    ).rejects.toThrow("entry address");
    expect(store.current).toEqual(artifactA);

    const artifactC = await commitLog(
      "compiled artifact C",
      "AdapterChapter21LogBase",
      "AdapterChapter21LogLength",
      chapter21,
    );
    expect(store.current).toEqual(artifactC);
    expect(artifactC).not.toEqual(artifactA);

    const outcome = executeCommittedNobj(artifactC, chapter21.execution, {
      observations: chapter21.observations,
    });
    expect(outcome.memory[0x7300]).toBe("Y".charCodeAt(0));
  }, 90_000);
});
