import { readFileSync } from "node:fs";
import path from "node:path";

import { compile } from "@jhlagado/azm/compile";
import { createZ80Runtime, parseIntelHex } from "@jhlagado/debug80-runtime";

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
}

export class ProofFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProofFailure";
  }
}

export async function runProofManifest(
  manifestFile: string,
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

  return {
    name: manifest.name,
    instructions,
    cycles,
    recentProgramCounters,
    regions,
    extents,
    symbols,
    memory,
  };
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function hexWord(value: number): string {
  return `$${(value & 0xffff).toString(16).padStart(4, "0")}`;
}
