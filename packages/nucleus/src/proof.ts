import { readFileSync } from "node:fs";
import path from "node:path";

import { compile } from "@jhlagado/azm/compile";
import {
  createZ80Runtime,
  parseIntelHex,
  type IoHandlers,
} from "@jhlagado/debug80-runtime";

import {
  materializeNobj,
  NobjGenerationSink,
  NobjGenerationStore,
  type MaterializedNobj,
  type NobjBegin,
  type NobjMap,
  type ParsedNobj,
  type RuntimeImageProvider,
  type RuntimeLinkContext,
} from "./nobj.js";
import {
  defaultRuntimeLinkContext,
  loadCanonicalRuntimeProvider,
} from "./nucleus-runtime.js";
import type { NucleusTargetPublicationDescriptor } from "./target-publication.js";
import {
  createNucleusHostRuntimeStreamAdapter,
  type NucleusHostRuntimeStreamAdapter,
} from "./runtime-stream-adapter.js";
import type { NucleusResidentSourceImage } from "./source-descriptor.js";
import {
  installNucleusResidentCompilerSource,
  resolveNucleusResidentCompilerEntry,
  type NucleusResidentCompilerEntry,
  type NucleusResidentCompilerEntrySymbols,
} from "./resident-compiler-entry.js";
import {
  readNucleusProofRuntimeStreamSnapshot,
  snapshotNucleusProofRuntimeStreams,
  type NucleusProofRuntimeStreamSnapshot,
  type NucleusProofRuntimeStreamsOptions,
} from "./runtime-services.js";
import {
  decodeNucleusSourceProvenanceLog,
  type NucleusGeneratedSourceSegment,
} from "./source-provenance.js";

interface MemoryRegionManifest {
  readonly name: string;
  readonly start: string;
  readonly end: string;
  readonly maxBytes: number;
}

interface MemoryProfileManifest {
  readonly name: string;
  readonly addressSpaceBytes: number;
  readonly regions: readonly MemoryRegionManifest[];
}

interface ProofManifest {
  readonly name: string;
  readonly source: string;
  readonly memoryProfile: string;
  readonly interfaces?: readonly string[];
  readonly execution: {
    readonly entry: string;
    readonly maxInstructions: number;
    readonly maxCycles: number;
    readonly halted: boolean;
  };
  readonly symbols?: Readonly<Record<string, number>>;
  readonly writes?: readonly {
    readonly at: string;
    readonly bytes?: readonly number[];
    readonly ascii?: string;
  }[];
  readonly observations?: readonly {
    readonly at: string;
    readonly width: "u8" | "u16";
    readonly equals: number;
  }[];
  readonly extents?: readonly {
    readonly name: string;
    readonly from: string;
    readonly to: string;
    readonly maxBytes: number;
  }[];
  readonly sourceProvenance?: SourceProvenanceProofManifest;
  readonly nobj?: NobjProofManifest;
}

interface SourceProvenanceProofManifest {
  readonly at: string;
  readonly lengthAt: string;
  readonly maxBytes: number;
}

interface NobjProofManifest {
  readonly adapter: {
    readonly at: string;
    readonly lengthAt: string;
    readonly maxBytes: number;
  };
  readonly begin: NobjBegin;
  readonly map: NobjMap;
  readonly runtimeLinkContext?: RuntimeLinkContext;
  /** Materialize the committed object without entering it. */
  readonly materializeOnly?: boolean;
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
  readonly observations?: readonly NobjObservation[];
  readonly bankSwitch?: {
    readonly port: number;
    readonly windowBase: number;
    readonly windowCapacity: number;
  };
}

interface NobjObservation {
  readonly at: number;
  readonly width: "u8" | "u16";
  readonly equals: number;
  readonly bank?: number;
}

export interface NobjAdapterGeneration {
  readonly name: string;
  readonly producerMemory: Uint8Array;
  readonly start: number;
  readonly length: number;
  readonly maxBytes: number;
  readonly begin: NobjBegin;
  readonly map: NobjMap;
  readonly runtimeLinkContext?: RuntimeLinkContext;
  readonly store?: NobjGenerationStore;
}

export interface ProofRegion {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly bytes: number;
}

export interface ProofExtent {
  readonly name: string;
  readonly bytes: number;
}

export interface ProofOutcome {
  readonly name: string;
  readonly instructions: number;
  readonly cycles: number;
  readonly recentProgramCounters: readonly number[];
  readonly regions: readonly ProofRegion[];
  readonly extents: readonly ProofExtent[];
  readonly symbols: Readonly<Record<string, number>>;
  readonly memory: Uint8Array;
  readonly runtimeStreams: NucleusProofRuntimeStreamSnapshot;
  readonly sourceProvenance?: readonly NucleusGeneratedSourceSegment[];
  readonly nobj?: NobjExecutionOutcome;
}

export interface NobjExecutionOutcome {
  readonly serialized: Uint8Array;
  readonly parsed: ParsedNobj;
  readonly materialized: MaterializedNobj;
  readonly memory: Uint8Array;
  readonly instructions: number;
  readonly cycles: number;
  readonly selectedBank: number;
  readonly runtimeStreams?: NucleusProofRuntimeStreamSnapshot;
}

export interface NobjHostRuntimeStreamExecution {
  readonly runtimeLinkContext: RuntimeLinkContext;
  readonly stubBase: number;
  readonly stubSpacing?: number;
  /** Defaults to true for legacy execution proofs that do not commit vectors. */
  readonly installVector?: boolean;
  readonly streamOptions?: NucleusProofRuntimeStreamsOptions;
}

export interface NucleusProofResidentSourceInstallation {
  readonly image: NucleusResidentSourceImage;
  readonly entry:
    | NucleusResidentCompilerEntry
    | NucleusResidentCompilerEntrySymbols;
}

export interface RunProofManifestOptions {
  readonly source?: NucleusProofResidentSourceInstallation;
  readonly checkObservations?: boolean;
  readonly sourceProvenance?: SourceProvenanceProofManifest;
  readonly nobj?: {
    readonly publication?: NucleusTargetPublicationDescriptor;
    readonly materializeOnly?: boolean;
    readonly checkObservations?: boolean;
  };
}

export class ProofFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProofFailure";
  }
}

const isResolvedResidentCompilerEntry = (
  entry: NucleusResidentCompilerEntry | NucleusResidentCompilerEntrySymbols,
): entry is NucleusResidentCompilerEntry =>
  typeof entry.executionEntry === "number" &&
  typeof entry.sourceDescriptorBase === "number" &&
  typeof entry.sourceBase === "number" &&
  typeof entry.targetDescriptor === "number" &&
  typeof entry.partBankTable === "number" &&
  typeof entry.outputLogBase === "number" &&
  typeof entry.outputLogLength === "number" &&
  typeof entry.outputLogLimit === "number";

export async function runProofManifest(
  manifestFile: string,
  options: RunProofManifestOptions = {},
): Promise<ProofOutcome> {
  const manifestPath = path.resolve(manifestFile);
  const manifestDirectory = path.dirname(manifestPath);
  const manifest = readJson<ProofManifest>(manifestPath);
  const memoryProfile = readJson<MemoryProfileManifest>(
    path.resolve(manifestDirectory, manifest.memoryProfile),
  );
  const sourcePath = path.resolve(manifestDirectory, manifest.source);
  const assembled = await compile(sourcePath, {
    emitBin: false,
    emitHex: true,
    emitD8m: true,
    registerContracts: "strict",
    registerContractsInterfaces: (manifest.interfaces ?? []).map((file) =>
      path.resolve(manifestDirectory, file),
    ),
  });
  const errors = assembled.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (errors.length > 0) {
    throw new ProofFailure(
      `${manifest.name}: assembly failed\n${errors
        .map(
          (diagnostic) =>
            `  ${diagnostic.sourceName ?? sourcePath}:${diagnostic.line ?? "?"}:${diagnostic.column ?? "?"} ${diagnostic.message}`,
        )
        .join("\n")}`,
    );
  }

  const hex = assembled.artifacts.find((artifact) => artifact.kind === "hex");
  const debugMap = assembled.artifacts.find(
    (artifact) => artifact.kind === "d8m",
  );
  if (hex?.kind !== "hex" || debugMap?.kind !== "d8m") {
    throw new ProofFailure(`${manifest.name}: AZM omitted HEX or D8M output`);
  }

  const symbols = Object.fromEntries(
    debugMap.json.symbols.flatMap((entry) => {
      const value = entry.address ?? entry.value;
      return value === undefined ? [] : [[entry.name, value] as const];
    }),
  );
  const symbolValue = (name: string): number => {
    const wanted = name.toLowerCase();
    for (const [candidate, value] of Object.entries(symbols)) {
      if (candidate.toLowerCase() === wanted) return value;
    }
    throw new ProofFailure(`${manifest.name}: missing symbol ${name}`);
  };

  for (const [name, expected] of Object.entries(manifest.symbols ?? {})) {
    const actual = symbolValue(name);
    if (actual !== expected) {
      throw new ProofFailure(
        `${manifest.name}: symbol ${name} is ${hexWord(actual)}, expected ${hexWord(expected)}`,
      );
    }
  }

  const regions = memoryProfile.regions.map((region) => {
    const start = symbolValue(region.start);
    const end = symbolValue(region.end);
    const bytes = end - start;
    if (start < 0 || end > 0x10000 || bytes <= 0) {
      throw new ProofFailure(
        `${manifest.name}: invalid ${region.name} region ${hexWord(start)}..${hexWord(end)}`,
      );
    }
    if (bytes > region.maxBytes) {
      throw new ProofFailure(
        `${manifest.name}: ${region.name} uses ${bytes} bytes, limit ${region.maxBytes}`,
      );
    }
    return { name: region.name, start, end, bytes };
  });
  const orderedRegions = [...regions].sort(
    (left, right) => left.start - right.start,
  );
  if (orderedRegions[0]?.start !== 0) {
    throw new ProofFailure(
      `${manifest.name}: memory profile does not start at $0000`,
    );
  }
  for (let index = 1; index < orderedRegions.length; index += 1) {
    const previous = orderedRegions[index - 1];
    const current = orderedRegions[index];
    if (previous && current && previous.end !== current.start) {
      throw new ProofFailure(
        `${manifest.name}: ${previous.name} and ${current.name} do not meet`,
      );
    }
  }
  if (
    memoryProfile.addressSpaceBytes !== 0x10000 ||
    orderedRegions.at(-1)?.end !== memoryProfile.addressSpaceBytes
  ) {
    throw new ProofFailure(
      `${manifest.name}: memory profile does not cover exactly 64 KiB`,
    );
  }

  const extents = (manifest.extents ?? []).map((extent) => {
    const bytes = symbolValue(extent.to) - symbolValue(extent.from);
    if (bytes < 0 || bytes > extent.maxBytes) {
      throw new ProofFailure(
        `${manifest.name}: ${extent.name} uses ${bytes} bytes, limit ${extent.maxBytes}`,
      );
    }
    return { name: extent.name, bytes };
  });

  const runtime = createZ80Runtime(
    parseIntelHex(hex.text),
    symbolValue(manifest.execution.entry),
  );
  const memory = (runtime.hardware as unknown as { memory: Uint8Array }).memory;
  for (const write of manifest.writes ?? []) {
    const bytes =
      write.bytes ??
      (write.ascii === undefined
        ? undefined
        : Array.from(new TextEncoder().encode(write.ascii)));
    if (bytes === undefined) {
      throw new ProofFailure(
        `${manifest.name}: write at ${write.at} has no bytes`,
      );
    }
    const address = symbolValue(write.at);
    if (address < 0 || address + bytes.length > memory.length) {
      throw new ProofFailure(
        `${manifest.name}: write at ${write.at} is out of range`,
      );
    }
    memory.set(bytes, address);
  }
  if (options.source !== undefined) {
    const sourceEntry = isResolvedResidentCompilerEntry(options.source.entry)
      ? options.source.entry
      : resolveNucleusResidentCompilerEntry(options.source.entry, symbolValue);
    const manifestEntry = symbolValue(manifest.execution.entry);
    if (sourceEntry.executionEntry !== manifestEntry) {
      throw new ProofFailure(
        `${manifest.name}: source execution entry ${hexWord(sourceEntry.executionEntry)} does not match manifest entry ${hexWord(manifestEntry)}`,
      );
    }
    try {
      installNucleusResidentCompilerSource(
        memory,
        sourceEntry,
        options.source.image,
      );
    } catch (error) {
      throw new ProofFailure(
        `${manifest.name}: resident source installation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  let cycles = 0;
  let instructions = 0;
  const recentProgramCounters: number[] = [];
  while (
    instructions < manifest.execution.maxInstructions &&
    cycles <= manifest.execution.maxCycles &&
    !runtime.isHalted()
  ) {
    recentProgramCounters.push(runtime.getPC());
    if (recentProgramCounters.length > 16) recentProgramCounters.shift();
    const step = runtime.step();
    cycles += step.cycles ?? 0;
    instructions += 1;
  }

  const failures: string[] = [];
  if (runtime.isHalted() !== manifest.execution.halted) {
    failures.push(
      `halted=${runtime.isHalted()}, expected ${manifest.execution.halted}`,
    );
  }
  if (instructions > manifest.execution.maxInstructions) {
    failures.push(
      `instruction limit ${manifest.execution.maxInstructions} exceeded`,
    );
  }
  if (cycles > manifest.execution.maxCycles) {
    failures.push(`cycle limit ${manifest.execution.maxCycles} exceeded`);
  }
  if (options.checkObservations !== false) {
    for (const observation of manifest.observations ?? []) {
      const address = symbolValue(observation.at);
      const actual =
        observation.width === "u8"
          ? memory[address]
          : (memory[address] ?? 0) | ((memory[address + 1] ?? 0) << 8);
      if (actual !== observation.equals) {
        failures.push(
          `${observation.at}=${actual}, expected ${observation.equals}`,
        );
      }
    }
  }
  if (failures.length > 0) {
    throw new ProofFailure(
      [
        `${manifest.name}: proof failed`,
        ...failures.map((failure) => `  ${failure}`),
        `  PC=${hexWord(runtime.getPC())} SP=${hexWord(runtime.cpu.sp)}`,
        `  recent PCs: ${recentProgramCounters.map(hexWord).join(" ")}`,
      ].join("\n"),
    );
  }

  const nobj =
    manifest.nobj === undefined
      ? undefined
      : await runNobjManifest(
          manifest.name,
          manifest.nobj,
          memory,
          symbolValue,
          options.nobj,
        );
  const sourceProvenanceManifest =
    options.sourceProvenance ?? manifest.sourceProvenance;
  const sourceProvenance =
    sourceProvenanceManifest === undefined
      ? undefined
      : decodeSourceProvenanceManifest(
          manifest.name,
          sourceProvenanceManifest,
          memory,
          symbolValue,
        );

  return {
    name: manifest.name,
    instructions,
    cycles,
    recentProgramCounters,
    regions,
    extents,
    symbols,
    memory,
    runtimeStreams: readNucleusProofRuntimeStreamSnapshot({ symbols, memory }),
    ...(sourceProvenance === undefined ? {} : { sourceProvenance }),
    ...(nobj === undefined ? {} : { nobj }),
  };
}

const decodeSourceProvenanceManifest = (
  name: string,
  manifest: SourceProvenanceProofManifest,
  memory: Uint8Array,
  symbol: (name: string) => number,
): readonly NucleusGeneratedSourceSegment[] => {
  const start = symbol(manifest.at);
  const lengthAddress = symbol(manifest.lengthAt);
  if (lengthAddress < 0 || lengthAddress + 2 > memory.length) {
    throw new ProofFailure(
      `${name}: source provenance length word exceeds proof memory`,
    );
  }
  const length =
    (memory[lengthAddress] ?? 0) | ((memory[lengthAddress + 1] ?? 0) << 8);
  try {
    return decodeNucleusSourceProvenanceLog(
      memory,
      start,
      length,
      manifest.maxBytes,
    );
  } catch (error) {
    throw new ProofFailure(
      `${name}: invalid source provenance log: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const runNobjManifest = async (
  name: string,
  manifest: NobjProofManifest,
  producerMemory: Uint8Array,
  symbol: (name: string) => number,
  options: {
    readonly publication?: NucleusTargetPublicationDescriptor;
    readonly materializeOnly?: boolean;
    readonly checkObservations?: boolean;
  } = {},
): Promise<NobjExecutionOutcome> => {
  const start = symbol(manifest.adapter.at);
  const lengthAddress = symbol(manifest.adapter.lengthAt);
  const length =
    (producerMemory[lengthAddress] ?? 0) |
    ((producerMemory[lengthAddress + 1] ?? 0) << 8);
  const runtimeLinkContext =
    options.publication?.runtimeLinkContext ??
    manifest.runtimeLinkContext ??
    defaultRuntimeLinkContext;
  const serialized = await commitNobjAdapterGeneration({
    name,
    producerMemory,
    start,
    length,
    maxBytes: manifest.adapter.maxBytes,
    begin: options.publication?.begin ?? manifest.begin,
    map: options.publication?.map ?? manifest.map,
    runtimeLinkContext,
  });
  if (options.materializeOnly === true || manifest.materializeOnly === true) {
    const parsed = parseNobjForExecution(serialized);
    const materialized = materializeNobj(parsed);
    const memory = new Uint8Array(0x10000);
    if (materialized.flatImage !== undefined) {
      memory.set(materialized.flatImage, parsed.begin.imageBase);
    }
    return {
      serialized,
      parsed,
      materialized,
      memory,
      instructions: 0,
      cycles: 0,
      selectedBank: parsed.map.entryBank,
    };
  }
  return executeCommittedNobj(serialized, manifest.execution, {
    observations:
      options.checkObservations === false ? undefined : manifest.observations,
    bankSwitch: manifest.bankSwitch,
  });
};

export const commitNobjAdapterGeneration = async ({
  name,
  producerMemory,
  start,
  length,
  maxBytes,
  begin,
  map,
  runtimeLinkContext = defaultRuntimeLinkContext,
  store = new NobjGenerationStore(),
}: NobjAdapterGeneration): Promise<Uint8Array> => {
  if (length > maxBytes) {
    throw new ProofFailure(
      `${name}: NOBJ adapter log uses ${length} bytes, limit ${maxBytes}`,
    );
  }
  if (start + length > producerMemory.length) {
    throw new ProofFailure(`${name}: NOBJ adapter log exceeds proof memory`);
  }
  const provider = await loadCanonicalRuntimeProvider([runtimeLinkContext]);
  const sink = new NobjGenerationSink(store, provider);
  sink.begin(begin);
  let cursor = start;
  const end = start + length;
  while (cursor < end) {
    if (end - cursor < 6) {
      throw new ProofFailure(`${name}: truncated NOBJ adapter operation`);
    }
    const kind = producerMemory[cursor] ?? 0;
    const bank = producerMemory[cursor + 1] ?? 0;
    const address =
      (producerMemory[cursor + 2] ?? 0) |
      ((producerMemory[cursor + 3] ?? 0) << 8);
    const count =
      (producerMemory[cursor + 4] ?? 0) |
      ((producerMemory[cursor + 5] ?? 0) << 8);
    cursor += 6;
    if (kind === 3 || kind === 4) {
      if (end - cursor < 20) {
        throw new ProofFailure(`${name}: truncated runtime-image operation`);
      }
      const identity =
        (producerMemory[cursor] ?? 0) |
        ((producerMemory[cursor + 1] ?? 0) << 8);
      cursor += 2;
      const contextWord = (offset: number): number =>
        (producerMemory[cursor + offset] ?? 0) |
        ((producerMemory[cursor + offset + 1] ?? 0) << 8);
      const compilerContext: RuntimeLinkContext = {
        runtimeBase: contextWord(0),
        writableBase: contextWord(2),
        writableCapacity: contextWord(4),
        writableStateBase: contextWord(6),
        vectorBase: contextWord(8),
        programDataBase: contextWord(10),
        programDataCapacity: contextWord(12),
        readOnlyBase: contextWord(14),
        readOnlyCapacity: contextWord(16),
        services: runtimeLinkContext.services,
      };
      cursor += 18;
      for (const field of [
        "runtimeBase",
        "writableBase",
        "writableCapacity",
        "writableStateBase",
        "vectorBase",
        "programDataBase",
        "programDataCapacity",
        "readOnlyBase",
        "readOnlyCapacity",
      ] as const) {
        if (compilerContext[field] !== runtimeLinkContext[field]) {
          throw new ProofFailure(
            `${name}: runtime link context ${field} differs from the compiler operation`,
          );
        }
      }
      if (kind === 3) {
        sink.runtimeImage(bank, address, identity, compilerContext, count);
      } else {
        sink.runtimeInitialImage(
          bank,
          address,
          identity,
          compilerContext,
          count,
        );
      }
      continue;
    }
    if (kind !== 1 && kind !== 2) {
      throw new ProofFailure(`${name}: unknown NOBJ adapter operation ${kind}`);
    }
    if (cursor + count > end) {
      throw new ProofFailure(`${name}: truncated NOBJ adapter bytes`);
    }
    const bytes = producerMemory.slice(cursor, cursor + count);
    cursor += count;
    if (kind === 1) sink.image(bank, address, bytes);
    else sink.patch(bank, address, bytes);
  }
  sink.map(map);
  return sink.commit();
};

export const executeCommittedNobj = (
  serialized: Uint8Array,
  execution: {
    readonly maxInstructions: number;
    readonly maxCycles: number;
    readonly halted: boolean;
    readonly initialSp?: number;
    readonly expectedSp?: number;
    readonly writes?: readonly {
      readonly at: number;
      readonly bytes: readonly number[];
    }[];
  },
  options: {
    readonly observations?: readonly NobjObservation[];
    readonly bankSwitch?: NobjProofManifest["bankSwitch"];
    readonly runtimeStreams?: NobjHostRuntimeStreamExecution;
  } = {},
): NobjExecutionOutcome => {
  const parsed = parseNobjForExecution(serialized);
  const materialized = materializeNobj(parsed);
  const commonMemory = new Uint8Array(0x10000);
  let selectedBank = parsed.map.entryBank;
  if (materialized.flatImage !== undefined) {
    commonMemory.set(materialized.flatImage, parsed.begin.imageBase);
  } else {
    const entryImage = materialized.banks[selectedBank];
    if (entryImage === undefined) {
      throw new ProofFailure("entry bank image is unavailable");
    }
    commonMemory.set(entryImage, parsed.begin.imageBase);
  }
  const program = {
    memory: commonMemory,
    startAddress: parsed.map.entryAddress,
  };
  const switchConfig = options.bankSwitch;
  const streamAdapter =
    options.runtimeStreams === undefined
      ? undefined
      : createNucleusHostRuntimeStreamAdapter({
          baseServices: options.runtimeStreams.runtimeLinkContext.services,
          stubBase: options.runtimeStreams.stubBase,
          stubSpacing: options.runtimeStreams.stubSpacing,
          streamOptions: options.runtimeStreams.streamOptions,
        });
  if (streamAdapter !== undefined) {
    if (options.runtimeStreams?.installVector !== false) {
      streamAdapter.installVector(commonMemory, parsed.map.vectorBase);
    }
    streamAdapter.installStubs(commonMemory);
  }
  let runtimeMemory = commonMemory;
  const ioHandlers = runtimeIoHandlers({
    streamAdapter,
    memory: () => runtimeMemory,
    materialized,
    parsed,
    switchConfig,
    selectBank: (bank) => {
      selectedBank = bank;
    },
  });
  const runtime = createZ80Runtime(
    program,
    parsed.map.entryAddress,
    ioHandlers,
    parsed.begin.banked && switchConfig !== undefined
      ? {
          romRanges: [
            {
              start: switchConfig.windowBase,
              end: switchConfig.windowBase + switchConfig.windowCapacity - 1,
            },
          ],
        }
      : undefined,
  );
  runtimeMemory = runtime.hardware.memory;
  if (execution.initialSp !== undefined) {
    if (
      !Number.isInteger(execution.initialSp) ||
      execution.initialSp < 0 ||
      execution.initialSp > 0xffff
    ) {
      throw new ProofFailure("NOBJ execution initial SP is outside 0..65535");
    }
    runtime.cpu.sp = execution.initialSp;
  }
  for (const write of execution.writes ?? []) {
    if (write.at < 0 || write.at + write.bytes.length > 0x10000) {
      throw new ProofFailure("NOBJ execution write exceeds address space");
    }
    runtime.hardware.memory.set(write.bytes, write.at);
  }
  if (parsed.begin.banked) {
    if (switchConfig === undefined) {
      throw new ProofFailure(
        "banked NOBJ execution requires a bank-switch hook",
      );
    }
  }

  let instructions = 0;
  let cycles = 0;
  const recentProgramCounters: number[] = [];
  while (
    instructions < execution.maxInstructions &&
    cycles <= execution.maxCycles &&
    !runtime.isHalted()
  ) {
    recentProgramCounters.push(runtime.getPC());
    if (recentProgramCounters.length > 16) recentProgramCounters.shift();
    const step = runtime.step();
    instructions += 1;
    cycles += step.cycles ?? 0;
  }
  const failures: string[] = [];
  if (runtime.isHalted() !== execution.halted) {
    failures.push(`halted=${runtime.isHalted()}, expected ${execution.halted}`);
  }
  if (instructions >= execution.maxInstructions && !runtime.isHalted()) {
    failures.push(`instruction limit ${execution.maxInstructions} reached`);
  }
  if (cycles > execution.maxCycles) {
    failures.push(`cycle limit ${execution.maxCycles} exceeded`);
  }
  if (
    execution.expectedSp !== undefined &&
    runtime.cpu.sp !== execution.expectedSp
  ) {
    failures.push(
      `SP=${hexWord(runtime.cpu.sp)}, expected ${hexWord(execution.expectedSp)}`,
    );
  }
  for (const observation of options.observations ?? []) {
    const observed =
      observation.bank === undefined
        ? runtime.hardware.memory
        : materialized.banks[observation.bank];
    if (observed === undefined) {
      failures.push(`observation bank ${observation.bank} is unavailable`);
      continue;
    }
    const offset =
      observation.bank === undefined
        ? observation.at
        : observation.at - parsed.begin.imageBase;
    const actual =
      observation.width === "u8"
        ? observed[offset]
        : (observed[offset] ?? 0) | ((observed[offset + 1] ?? 0) << 8);
    if (actual !== observation.equals) {
      failures.push(
        `NOBJ observation at ${hexWord(observation.at)}=${actual}, expected ${observation.equals}`,
      );
    }
  }
  if (failures.length > 0) {
    throw new ProofFailure(
      `NOBJ execution failed\n${failures.join("\n")}\nPC=${hexWord(runtime.getPC())} bank=${selectedBank}\nrecent PCs: ${recentProgramCounters.map(hexWord).join(" ")}`,
    );
  }
  return {
    serialized: serialized.slice(),
    parsed,
    materialized,
    memory: runtime.hardware.memory.slice(),
    instructions,
    cycles,
    selectedBank,
    ...(streamAdapter === undefined
      ? {}
      : {
          runtimeStreams: snapshotNucleusProofRuntimeStreams(
            streamAdapter.streams,
          ),
        }),
  };
};

const runtimeIoHandlers = ({
  streamAdapter,
  memory,
  materialized,
  parsed,
  switchConfig,
  selectBank,
}: {
  readonly streamAdapter?: NucleusHostRuntimeStreamAdapter;
  readonly memory: () => Uint8Array;
  readonly materialized: MaterializedNobj;
  readonly parsed: ParsedNobj;
  readonly switchConfig?: NobjProofManifest["bankSwitch"];
  readonly selectBank: (bank: number) => void;
}): IoHandlers => ({
  read: (port) => streamAdapter?.io.read(port) ?? 0,
  write: (port, value) => {
    streamAdapter?.io.write(port, value);
    if (switchConfig === undefined || (port & 0xff) !== switchConfig.port) {
      return;
    }
    if (value >= parsed.begin.bankCount) {
      throw new ProofFailure(`bank selector ${value} is out of range`);
    }
    selectBank(value);
    const selectedImage = materialized.banks[value];
    if (selectedImage === undefined) {
      throw new ProofFailure(`bank image ${value} is unavailable`);
    }
    memory().set(selectedImage, parsed.begin.imageBase);
  },
});

const parseNobjForExecution = (serialized: Uint8Array): ParsedNobj => {
  // Kept as a named boundary so no execution path can bypass strict validation.
  const store = new NobjGenerationStore();
  return store.publish(serialized);
};

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function hexWord(value: number): string {
  return `$${(value & 0xffff).toString(16).padStart(4, "0")}`;
}
