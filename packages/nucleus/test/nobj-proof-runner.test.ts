import { describe, expect, it } from "vitest";

import { executeCommittedNobj, runProofManifest } from "../src/proof.js";
import {
  NobjGenerationSink,
  NobjGenerationStore,
  type NobjMap,
  type RuntimeImageProvider,
} from "../src/nobj.js";

const proof = (name: string): string =>
  new URL(`../proofs/${name}.json`, import.meta.url).pathname;

const emptyProvider: RuntimeImageProvider = { get: () => undefined };

describe("the NOBJ-aware proof runner", () => {
  it("runs a Z80 producer, commits its adapter calls, and executes fresh flat memory", async () => {
    const outcome = await runProofManifest(proof("nobj-runner-proof"));
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
});
