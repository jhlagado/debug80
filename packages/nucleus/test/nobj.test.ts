import { describe, expect, it } from "vitest";
import { createZ80Runtime } from "@jhlagado/debug80-runtime";
import {
  appendOnlyGenerationLifecycleAdapter,
  runGenerationLifecycleConformance,
} from "@jhlagado/z80-tool-services";

import {
  crc16CcittFalse,
  materializeNobj,
  MemoryNobjSpool,
  NobjError,
  NobjGenerationSink,
  NobjGenerationStore,
  NobjKind,
  NOBJ_MAX_DATA_BYTES,
  parseNobj,
  type NobjBegin,
  type NobjImageRecord,
  type NobjMap,
  type NobjSpool,
  type RuntimeImageProvider,
} from "../src/nobj.js";
import {
  NUCLEUS_RUNTIME_SERVICE_VECTOR_ENTRY_BYTES,
  defaultRuntimeLinkContext,
  loadCanonicalRuntimeImage,
  nucleusRuntimeServiceOrder,
  nucleusRuntimeServiceVectorBytes,
} from "../src/nucleus-runtime.js";

const emptyProvider: RuntimeImageProvider = { get: () => undefined };

const flatRomBegin = (capacity = 0x100): NobjBegin => ({
  banked: false,
  runtimeIdentity: 1,
  bankCount: 1,
  imageFill: 0xee,
  imageBase: 0x8000,
  imageCapacity: capacity,
});

const flatRomMap = (usedLength: number): NobjMap => ({
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
  bssLength: 1,
  stackRequirement: 0,
  dataLoadBank: 0,
  dataLoadAddress: 0x8000,
  dataLoadLength: 1,
  partBanks: [0],
  banks: [
    {
      usedLength,
      readOnlyBase: 0x8000,
      readOnlyLength: 1,
      aggregateConstantBase: 0,
      aggregateConstantLength: 0,
    },
  ],
});

const bankedBegin = (): NobjBegin => ({
  banked: true,
  runtimeIdentity: 1,
  bankCount: 2,
  imageFill: 0xcc,
  imageBase: 0x8000,
  imageCapacity: 0x100,
});

const bankedMap = (used0: number, used1: number): NobjMap => ({
  romMode: true,
  establishedStack: false,
  entryBank: 1,
  entryAddress: 0x8000,
  writableBase: 0x4000,
  writableCapacity: 0x100,
  vectorBase: 0x4000,
  vectorLength: 1,
  initializedRunBase: 0x4000,
  initializedRunLength: 1,
  bssBase: 0x4001,
  bssLength: 1,
  stackRequirement: 0,
  dataLoadBank: 1,
  dataLoadAddress: 0x8000,
  dataLoadLength: 1,
  partBanks: [0, 1],
  banks: [
    {
      usedLength: used0,
      readOnlyBase: 0,
      readOnlyLength: 0,
      aggregateConstantBase: 0,
      aggregateConstantLength: 0,
    },
    {
      usedLength: used1,
      readOnlyBase: 0x8000,
      readOnlyLength: 1,
      aggregateConstantBase: 0,
      aggregateConstantLength: 0,
    },
  ],
});

interface BuildOptions {
  readonly begin?: NobjBegin;
  readonly images: readonly NobjImageRecord[];
  readonly patches?: readonly NobjImageRecord[];
  readonly map?: NobjMap;
  readonly provider?: RuntimeImageProvider;
  readonly store?: NobjGenerationStore;
}

const build = ({
  begin = flatRomBegin(),
  images,
  patches = [],
  map = flatRomMap(
    Math.max(
      ...[...images, ...patches].map(
        (item) => item.address + item.bytes.length,
      ),
    ) - begin.imageBase,
  ),
  provider = emptyProvider,
  store = new NobjGenerationStore(),
}: BuildOptions): Uint8Array => {
  const sink = new NobjGenerationSink(store, provider);
  sink.begin(begin);
  for (const image of images)
    sink.image(image.bank, image.address, image.bytes);
  for (const patch of patches)
    sink.patch(patch.bank, patch.address, patch.bytes);
  sink.map(map);
  return sink.commit();
};

interface RecordSpan {
  readonly kind: number;
  readonly start: number;
  readonly payloadStart: number;
  readonly end: number;
}

const recordSpans = (bytes: Uint8Array): RecordSpan[] => {
  const spans: RecordSpan[] = [];
  let cursor = 0;
  while (cursor < bytes.length) {
    const length = (bytes[cursor + 1] ?? 0) | ((bytes[cursor + 2] ?? 0) << 8);
    const end = cursor + 3 + length;
    spans.push({
      kind: bytes[cursor] ?? 0,
      start: cursor,
      payloadStart: cursor + 3,
      end,
    });
    cursor = end;
  }
  return spans;
};

const withCrc = (bytes: Uint8Array): Uint8Array => {
  const changed = bytes.slice();
  const crc = crc16CcittFalse(changed.slice(0, -2));
  changed[changed.length - 2] = crc & 0xff;
  changed[changed.length - 1] = crc >>> 8;
  return changed;
};

describe("NOBJ 0.1", () => {
  it("encodes exact framing, little-endian fields and the standard CRC", () => {
    expect(crc16CcittFalse(new TextEncoder().encode("123456789"))).toBe(0x29b1);
    const object = build({
      images: [
        { bank: 0, address: 0x8000, bytes: Uint8Array.of(0xc3, 0x34, 0x12) },
      ],
    });
    expect(Array.from(object.slice(0, 18))).toEqual([
      NobjKind.begin,
      15,
      0,
      0x4e,
      0x4f,
      0x42,
      0x4a,
      0,
      1,
      0,
      1,
      0,
      1,
      0xee,
      0,
      0x80,
      0,
      1,
    ]);
    const parsed = parseNobj(object);
    expect(parsed.commit.crc16).toBe(crc16CcittFalse(object.slice(0, -2)));
    expect(parsed.commit.recordCount).toBe(4);
  });

  it("materializes a flat image gap and patches image and fill bytes", () => {
    const object = build({
      images: [
        { bank: 0, address: 0x8000, bytes: Uint8Array.of(1, 2) },
        { bank: 0, address: 0x8006, bytes: Uint8Array.of(7) },
      ],
      patches: [
        { bank: 0, address: 0x8001, bytes: Uint8Array.of(9) },
        { bank: 0, address: 0x8004, bytes: Uint8Array.of(8) },
      ],
    });
    const materialized = materializeNobj(parseNobj(object));
    expect(Array.from(materialized.flatImage?.slice(0, 7) ?? [])).toEqual([
      1, 9, 0xee, 0xee, 8, 0xee, 7,
    ]);
  });

  it("accepts alternating monotonic bank images and descending patches", () => {
    const object = build({
      begin: bankedBegin(),
      images: [
        { bank: 0, address: 0x8000, bytes: Uint8Array.of(0x10) },
        { bank: 1, address: 0x8000, bytes: Uint8Array.of(0x20) },
        { bank: 0, address: 0x8004, bytes: Uint8Array.of(0x14) },
        { bank: 1, address: 0x8003, bytes: Uint8Array.of(0x23) },
      ],
      patches: [
        { bank: 0, address: 0x8003, bytes: Uint8Array.of(0x33) },
        { bank: 0, address: 0x8001, bytes: Uint8Array.of(0x11) },
      ],
      map: bankedMap(5, 4),
    });
    const materialized = materializeNobj(parseNobj(object));
    expect(Array.from(materialized.banks[0]?.slice(0, 5) ?? [])).toEqual([
      0x10, 0x11, 0xcc, 0x33, 0x14,
    ]);
    expect(Array.from(materialized.banks[1]?.slice(0, 4) ?? [])).toEqual([
      0x20, 0xcc, 0xcc, 0x23,
    ]);
  });

  it("materializes a directly loadable flat layout and rejects partial overlap", () => {
    const begin: NobjBegin = {
      ...flatRomBegin(),
      imageCapacity: 0x100,
    };
    const bytes = new Uint8Array(0x84);
    bytes[0] = 0xc3;
    bytes[0x80] = 1;
    const map: NobjMap = {
      ...flatRomMap(0x84),
      romMode: false,
      writableBase: 0x8080,
      writableCapacity: 0x40,
      vectorBase: 0x8080,
      initializedRunBase: 0x8080,
      initializedRunLength: 4,
      bssBase: 0x8084,
      bssLength: 4,
      dataLoadAddress: 0x8080,
      dataLoadLength: 4,
      banks: [
        {
          usedLength: 0x84,
          readOnlyBase: 0,
          readOnlyLength: 0,
          aggregateConstantBase: 0,
          aggregateConstantLength: 0,
        },
      ],
    };
    expect(() =>
      build({ begin, images: [{ bank: 0, address: 0x8000, bytes }], map }),
    ).not.toThrow();
    expect(() =>
      build({
        begin,
        images: [{ bank: 0, address: 0x8000, bytes }],
        map: { ...map, romMode: true },
      }),
    ).toThrow("regions overlap");
  });

  it("accepts the nearest image-region end and rejects its first overflow", () => {
    const acceptedMap = {
      ...flatRomMap(0x100),
      entryAddress: 0x80ff,
      dataLoadAddress: 0x80ff,
      banks: [
        {
          usedLength: 0x100,
          readOnlyBase: 0x80ff,
          readOnlyLength: 1,
          aggregateConstantBase: 0,
          aggregateConstantLength: 0,
        },
      ],
    };
    expect(() =>
      build({
        images: [{ bank: 0, address: 0x80ff, bytes: Uint8Array.of(1) }],
        map: acceptedMap,
      }),
    ).not.toThrow();
    const sink = new NobjGenerationSink(
      new NobjGenerationStore(),
      emptyProvider,
    );
    sink.begin(flatRomBegin());
    expect(() => sink.image(0, 0x80ff, Uint8Array.of(1, 2))).toThrow(
      "outside its image region",
    );
  });

  it("accepts the maximum IMAGE payload and rejects the next byte", () => {
    const begin: NobjBegin = {
      ...flatRomBegin(0xffff),
      imageBase: 1,
    };
    const sink = new NobjGenerationSink(
      new NobjGenerationStore(),
      emptyProvider,
    );
    sink.begin(begin);
    expect(() =>
      sink.image(0, 1, new Uint8Array(NOBJ_MAX_DATA_BYTES)),
    ).not.toThrow();
    sink.abort();
    sink.begin(begin);
    expect(() =>
      sink.image(0, 1, new Uint8Array(NOBJ_MAX_DATA_BYTES + 1)),
    ).toThrow("1..65,532");
  });

  it("rejects duplicate, descending and overlapping image records", () => {
    for (const address of [0x8000, 0x7fff, 0x8001]) {
      const sink = new NobjGenerationSink(
        new NobjGenerationStore(),
        emptyProvider,
      );
      sink.begin(flatRomBegin());
      sink.image(0, 0x8000, Uint8Array.of(1, 2));
      expect(() => sink.image(0, address, Uint8Array.of(3))).toThrow();
    }
  });

  it("rejects overlapping patches in either address order", () => {
    for (const pair of [
      [0x8001, 0x8002],
      [0x8002, 0x8001],
    ]) {
      const sink = new NobjGenerationSink(
        new NobjGenerationStore(),
        emptyProvider,
      );
      sink.begin(flatRomBegin());
      sink.image(0, 0x8000, Uint8Array.of(1, 2, 3, 4));
      sink.patch(0, pair[0] ?? 0, Uint8Array.of(7, 8));
      expect(() => sink.patch(0, pair[1] ?? 0, Uint8Array.of(9, 10))).toThrow(
        "PATCH records overlap",
      );
    }
  });

  it("rejects invalid banks, reserved flags and reserved record kinds", () => {
    const object = build({
      images: [{ bank: 0, address: 0x8000, bytes: Uint8Array.of(1) }],
    });
    const spans = recordSpans(object);
    const image = spans.find(({ kind }) => kind === NobjKind.image);
    expect(image).toBeDefined();
    const badBank = object.slice();
    badBank[image?.payloadStart ?? 0] = 1;
    expect(() => parseNobj(withCrc(badBank))).toThrow("bank is out of range");
    const badFlags = object.slice();
    badFlags[9] = 0x80;
    expect(() => parseNobj(withCrc(badFlags))).toThrow("reserved flags");
    const badKind = object.slice();
    badKind[image?.start ?? 0] = 0x7f;
    expect(() => parseNobj(withCrc(badKind))).toThrow(
      "reserved NOBJ record kind",
    );
  });

  it("accepts exactly 65,535 records and rejects the first additional data record", () => {
    const begin: NobjBegin = {
      ...flatRomBegin(0xffff),
      imageBase: 0,
    };
    const sink = new NobjGenerationSink(
      new NobjGenerationStore(),
      emptyProvider,
    );
    sink.begin(begin);
    for (let address = 0; address < 65_532; address += 1) {
      sink.image(0, address, Uint8Array.of(address));
    }
    expect(() => sink.image(0, 65_532, Uint8Array.of(0))).toThrow(
      "record count exceeds 65,535",
    );
    expect(sink.imageSpoolHighWater).toBe(458_724);
    const map: NobjMap = {
      ...flatRomMap(65_532),
      romMode: false,
      writableBase: 65_531,
      writableCapacity: 4,
      vectorBase: 65_531,
      initializedRunBase: 65_531,
      initializedRunLength: 1,
      bssBase: 65_532,
      bssLength: 0,
      dataLoadAddress: 65_531,
      dataLoadLength: 1,
      banks: [
        {
          usedLength: 65_532,
          readOnlyBase: 0,
          readOnlyLength: 0,
          aggregateConstantBase: 0,
          aggregateConstantLength: 0,
        },
      ],
    };
    sink.map(map);
    expect(parseNobj(sink.commit()).commit.recordCount).toBe(65_535);
  }, 30_000);

  it("rejects malformed MAP lengths, entry pairs, counts, CRCs and trailing bytes", () => {
    const object = build({
      images: [{ bank: 0, address: 0x8000, bytes: Uint8Array.of(1) }],
    });
    const spans = recordSpans(object);
    const map = spans.find(({ kind }) => kind === NobjKind.map);
    const commit = spans.find(({ kind }) => kind === NobjKind.commit);
    expect(map).toBeDefined();
    expect(commit).toBeDefined();

    const malformedMap = object.slice();
    malformedMap[(map?.payloadStart ?? 0) + 28] = 2;
    expect(() => parseNobj(withCrc(malformedMap))).toThrow(
      "MAP payload length",
    );

    const wrongEntry = object.slice();
    wrongEntry[(commit?.payloadStart ?? 0) + 3] ^= 1;
    expect(() => parseNobj(withCrc(wrongEntry))).toThrow("entry pair differs");

    const wrongCount = object.slice();
    wrongCount[commit?.payloadStart ?? 0] ^= 1;
    expect(() => parseNobj(withCrc(wrongCount))).toThrow("record count");

    const wrongCrc = object.slice();
    wrongCrc[wrongCrc.length - 1] ^= 1;
    expect(() => parseNobj(wrongCrc)).toThrow("CRC");

    expect(() => parseNobj(Uint8Array.from([...object, 0]))).toThrow(
      "byte after COMMIT",
    );
  });

  it("rejects truncation in every record header and payload class", () => {
    const object = build({
      images: [{ bank: 0, address: 0x8000, bytes: Uint8Array.of(1, 2, 3) }],
      patches: [{ bank: 0, address: 0x8001, bytes: Uint8Array.of(9) }],
    });
    for (const span of recordSpans(object)) {
      expect(() => parseNobj(object.slice(0, span.start + 1))).toThrow();
      expect(() => parseNobj(object.slice(0, span.end - 1))).toThrow();
    }
  });

  it("defers patch and used-length checks until MAP without weakening them", () => {
    const object = build({
      images: [{ bank: 0, address: 0x8000, bytes: Uint8Array.of(1) }],
      patches: [{ bank: 0, address: 0x8004, bytes: Uint8Array.of(2) }],
    });
    const map = recordSpans(object).find(({ kind }) => kind === NobjKind.map);
    expect(map).toBeDefined();
    const badUsedLength = object.slice();
    const bankEntry = (map?.payloadStart ?? 0) + 31;
    badUsedLength[bankEntry] = 1;
    badUsedLength[bankEntry + 1] = 0;
    expect(() => parseNobj(withCrc(badUsedLength))).toThrow(
      "used length differs from record extent",
    );
  });

  it("validates runtime identity and length before appending any runtime prefix", () => {
    const runtime = {
      identity: 7,
      bytes: Uint8Array.of(1, 2, 3),
      initialBytes: Uint8Array.of(4),
      vectorBytes: Uint8Array.of(4),
    };
    const provider: RuntimeImageProvider = { get: () => runtime };
    const sink = new NobjGenerationSink(new NobjGenerationStore(), provider);
    sink.begin({ ...flatRomBegin(), runtimeIdentity: 7 });
    const context = { ...defaultRuntimeLinkContext, runtimeBase: 0x8000 };
    expect(() => sink.runtimeImage(0, 0x8000, 8, context, 3)).toThrow(
      "differs from BEGIN",
    );
    expect(() => sink.runtimeImage(0, 0x8000, 7, context, 2)).toThrow(
      "length mismatch",
    );
    sink.runtimeImage(0, 0x8000, 7, context, 3);
    sink.map(flatRomMap(3));
    expect(parseNobj(sink.commit()).images).toHaveLength(1);

    const unavailable = new NobjGenerationSink(
      new NobjGenerationStore(),
      emptyProvider,
    );
    unavailable.begin(flatRomBegin());
    expect(() => unavailable.runtimeImage(0, 0x8000, 1, context, 3)).toThrow(
      "unavailable",
    );

    const wrong: RuntimeImageProvider = {
      get: () => ({
        identity: 2,
        bytes: Uint8Array.of(1, 2, 3),
        initialBytes: Uint8Array.of(4),
        vectorBytes: Uint8Array.of(4),
      }),
    };
    const wrongSink = new NobjGenerationSink(new NobjGenerationStore(), wrong);
    wrongSink.begin(flatRomBegin());
    expect(() => wrongSink.runtimeImage(0, 0x8000, 1, context, 3)).toThrow(
      "wrong identity",
    );
  });

  it("appends provider-owned vector and state bytes as an ordinary IMAGE", () => {
    const runtime = {
      identity: 7,
      bytes: Uint8Array.of(1, 2, 3),
      initialBytes: Uint8Array.of(0xc3, 0x34, 0x12, 1, 8),
      vectorBytes: Uint8Array.of(0xc3, 0x34, 0x12),
    };
    const sink = new NobjGenerationSink(new NobjGenerationStore(), {
      get: () => runtime,
    });
    sink.begin({ ...flatRomBegin(), runtimeIdentity: 7 });
    expect(() =>
      sink.runtimeInitialImage(0, 0x8000, 7, defaultRuntimeLinkContext, 4),
    ).toThrow("initial-image length mismatch");
    const context = defaultRuntimeLinkContext;
    expect(() => sink.runtimeInitialImage(0, 0x8000, 7, context, 4)).toThrow(
      "initial-image length mismatch",
    );
    sink.runtimeInitialImage(0, 0x8000, 7, context, 5);
    sink.map(flatRomMap(5));
    const parsed = parseNobj(sink.commit());
    expect(parsed.images).toEqual([
      { bank: 0, address: 0x8000, bytes: runtime.initialBytes },
    ]);
  });

  it("splits a 65,535-byte runtime image into bounded ordinary IMAGE records", () => {
    const runtime = {
      identity: 7,
      bytes: new Uint8Array(0xffff),
      initialBytes: Uint8Array.of(4),
      vectorBytes: Uint8Array.of(4),
    };
    const spools: MemoryNobjSpool[] = [];
    const sink = new NobjGenerationSink(
      new NobjGenerationStore(),
      { get: () => runtime },
      () => {
        const spool = new MemoryNobjSpool();
        spools.push(spool);
        return spool;
      },
    );
    sink.begin({
      banked: false,
      runtimeIdentity: 7,
      bankCount: 1,
      imageFill: 0,
      imageBase: 1,
      imageCapacity: 0xffff,
    });
    const context = { ...defaultRuntimeLinkContext, runtimeBase: 1 };
    expect(() => sink.runtimeImage(0, 1, 7, context, 0xffff)).not.toThrow();
    expect(Array.from(spools[2]?.chunks() ?? [])).toHaveLength(2);
    sink.abort();
  });

  it("assembles the canonical provider from the exact selected runtime source", async () => {
    const runtime = await loadCanonicalRuntimeImage();
    expect(runtime.identity).toBe(4);
    expect(runtime.bytes).toHaveLength(364);
    expect(runtime.vectorBytes).toHaveLength(33);
    expect(runtime.vectorBytes).toEqual(
      nucleusRuntimeServiceVectorBytes(defaultRuntimeLinkContext.services),
    );
    expect(runtime.initialBytes).toHaveLength(70);
    expect(runtime.initialBytes[33]).toBe(1);
    expect(runtime.initialBytes[40]).toBe(8);
    expect(runtime.currentBankOffset).toBe(8);
    expect(runtime.helperOffsets?.CheckAggregateRegion).toBe(115);
    expect(runtime.bytes.some((byte) => byte !== 0)).toBe(true);
  }, 30_000);

  it("publishes the service vector as one JP slot per configured service address", () => {
    const bytes = nucleusRuntimeServiceVectorBytes(
      defaultRuntimeLinkContext.services,
    );

    expect(nucleusRuntimeServiceOrder).toEqual([
      "readInputByte",
      "writeOutputByte",
      "readStorageByte",
      "rewindStorageInput",
      "writeStorageByte",
      "seekStorageOutput",
      "success",
      "unhandledFailure",
      "trap",
      "farCall",
      "farJump",
    ]);
    expect(bytes).toHaveLength(
      nucleusRuntimeServiceOrder.length *
        NUCLEUS_RUNTIME_SERVICE_VECTOR_ENTRY_BYTES,
    );

    nucleusRuntimeServiceOrder.forEach((service, index) => {
      const offset = index * NUCLEUS_RUNTIME_SERVICE_VECTOR_ENTRY_BYTES;
      const address = defaultRuntimeLinkContext.services[service];
      expect([...bytes.slice(offset, offset + 3)]).toEqual([
        0xc3,
        address & 0xff,
        address >>> 8,
      ]);
    });
  });

  it("links and executes the same runtime identity at two complete layouts", async () => {
    const secondContext = {
      ...defaultRuntimeLinkContext,
      runtimeBase: 0x8003,
      writableBase: 0x5000,
      writableCapacity: 0x2000,
      writableStateBase: 0x5021,
      vectorBase: 0x5000,
      programDataBase: 0x5046,
      programDataCapacity: 0x0800,
      readOnlyBase: 0x8200,
      readOnlyCapacity: 0x1000,
      services: Object.fromEntries(
        Object.entries(defaultRuntimeLinkContext.services).map(
          ([name, address]) => [name, address + 0x100],
        ),
      ) as typeof defaultRuntimeLinkContext.services,
    };
    const layouts = [defaultRuntimeLinkContext, secondContext] as const;
    const linked = await Promise.all(layouts.map(loadCanonicalRuntimeImage));
    expect(linked[0]?.identity).toBe(linked[1]?.identity);
    expect(linked[0]?.bytes).not.toEqual(linked[1]?.bytes);
    expect(linked[0]?.vectorBytes).not.toEqual(linked[1]?.vectorBytes);

    layouts.forEach((context, index) => {
      const image = linked[index];
      expect(image).toBeDefined();
      const helper = image?.helperOffsets?.ActivationClaim;
      expect(helper).toBe(43);
      const memory = new Uint8Array(0x10000);
      memory.set(image?.bytes ?? [], context.runtimeBase);
      memory[context.writableStateBase + 7] = 8;
      const entry = 0x0100;
      const claim = context.runtimeBase + (helper ?? 0);
      memory.set(
        Uint8Array.of(0x31, 0x00, 0xff, 0xcd, claim & 0xff, claim >>> 8, 0x76),
        entry,
      );
      const runtime = createZ80Runtime({ memory, startAddress: entry }, entry);
      for (let step = 0; step < 32 && !runtime.isHalted(); step += 1) {
        runtime.step();
      }
      expect(runtime.isHalted()).toBe(true);
      expect(runtime.hardware.memory[context.writableStateBase + 6]).toBe(1);
    });
  }, 30_000);

  it("rejects runtime contexts that violate the identity-fixed writable layout", async () => {
    await expect(
      loadCanonicalRuntimeImage({
        ...defaultRuntimeLinkContext,
        writableStateBase: defaultRuntimeLinkContext.writableStateBase + 1,
      }),
    ).rejects.toThrow("runtime state does not follow the vector table");
    await expect(
      loadCanonicalRuntimeImage({
        ...defaultRuntimeLinkContext,
        programDataBase: defaultRuntimeLinkContext.programDataBase + 1,
      }),
    ).rejects.toThrow("program data does not follow runtime state");
  }, 30_000);

  it("keeps the prior committed generation current across abort, truncation and late failure", () => {
    const store = new NobjGenerationStore();
    const first = build({
      images: [{ bank: 0, address: 0x8000, bytes: Uint8Array.of(1) }],
      store,
    });
    const sink = new NobjGenerationSink(store, emptyProvider);
    sink.begin(flatRomBegin());
    sink.image(0, 0x8000, Uint8Array.of(2));
    sink.abort();
    expect(store.current).toEqual(first);
    expect(() => store.publish(first.slice(0, -1))).toThrow();
    expect(store.current).toEqual(first);

    sink.begin(flatRomBegin());
    sink.image(0, 0x8000, Uint8Array.of(3));
    sink.map({ ...flatRomMap(1), entryAddress: 0x8100 });
    expect(() => sink.commit()).toThrow("entry address");
    expect(store.current).toEqual(first);
    sink.abort();

    const second = build({
      images: [{ bank: 0, address: 0x8000, bytes: Uint8Array.of(4) }],
      store,
    });
    expect(store.current).toEqual(second);
    expect(store.current).not.toEqual(first);
  });

  it("passes the shared generation lifecycle conformance vectors", () => {
    const result = runGenerationLifecycleConformance(() => {
      const sink = new NobjGenerationSink(
        new NobjGenerationStore(),
        emptyProvider,
      );
      let imageLength = 0;

      return appendOnlyGenerationLifecycleAdapter({
        active: () => sink.generationActive,
        begin(record) {
          imageLength = 0;
          sink.begin(record);
        },
        image(record) {
          sink.image(record.bank, record.address, record.bytes);
          imageLength += record.bytes.length;
        },
        patch(record) {
          sink.patch(record.bank, record.address, record.bytes);
        },
        commit(record) {
          sink.map(record);
          sink.commit();
        },
        abort() {
          sink.abort();
        },
        records: () => ({
          begin: flatRomBegin(),
          image: {
            bank: 0,
            address: 0x8000 + imageLength,
            bytes: Uint8Array.of(1, 2),
          },
          patch: { bank: 0, address: 0x8001, bytes: Uint8Array.of(9) },
          commit: flatRomMap(imageLength),
        }),
      });
    });

    expect(result).toEqual({ vectors: 4, assertions: 16 });
  });

  it("uses independent append-only image and patch spools", () => {
    const spools: MemoryNobjSpool[] = [];
    const factory = (): NobjSpool => {
      const spool = new MemoryNobjSpool();
      spools.push(spool);
      return spool;
    };
    const sink = new NobjGenerationSink(
      new NobjGenerationStore(),
      emptyProvider,
      factory,
    );
    sink.begin(flatRomBegin());
    sink.image(0, 0x8000, Uint8Array.of(1));
    sink.patch(0, 0x8001, Uint8Array.of(2));
    sink.map(flatRomMap(2));
    sink.commit();
    expect(spools).toHaveLength(4);
    expect(sink.imageSpoolHighWater).toBeGreaterThan(0);
    expect(sink.patchSpoolHighWater).toBeGreaterThan(0);
    expect(spools[2]).not.toBe(spools[3]);
  });
});
