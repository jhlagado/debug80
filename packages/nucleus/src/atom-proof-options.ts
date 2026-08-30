import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  NucleusAtomProofMigrationMetadata,
  RunProofManifestOptions,
} from "./proof.js";

const locatePackageRoot = (moduleUrl: string): string => {
  let current = path.dirname(fileURLToPath(moduleUrl));
  while (true) {
    if (existsSync(path.join(current, "package.json"))) return current;
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("cannot locate Nucleus package root");
    }
    current = parent;
  }
};

const packageRoot = locatePackageRoot(import.meta.url);

export const NUCLEUS_DEFAULT_ASM_ROOT = path.join(packageRoot, "asm");
export const NUCLEUS_DEFAULT_PERMANENT_ATOM_ROOT = path.join(
  packageRoot,
  "atom-asm",
);

const pathInside = (root: string, target: string): string | undefined => {
  const relative = path.relative(root, target);
  if (
    relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    return undefined;
  }
  return relative;
};

const listFiles = async (root: string): Promise<readonly string[]> => {
  const result: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(child);
      } else if (entry.isFile()) {
        result.push(child);
      }
    }
  };
  await visit(root);
  return result.sort();
};

export const readNucleusPermanentAtomMigrationMetadata = async (
  atomRoot = NUCLEUS_DEFAULT_PERMANENT_ATOM_ROOT,
): Promise<NucleusAtomProofMigrationMetadata> => {
  const proofSymbolMap: {
    original: string;
    permanentAtom: string;
  }[] = [];
  const proofLimitMap: {
    original: string;
    permanentAtom: string;
    value: number;
    loweredAtomValue: number;
  }[] = [];
  for (const file of await listFiles(atomRoot)) {
    const text = await readFile(file, "utf8");
    for (const line of text.split(/\n/)) {
      const global =
        /;@NUC-GLOBAL\s+(\S+)\s+PERMANENT\s+(\S+)/.exec(line);
      if (global !== null) {
        proofSymbolMap.push({
          original: global[1]!,
          permanentAtom: global[2]!,
        });
      }
      const limit =
        /;@ATOM-PROOF-LIMIT\s+(\S+)\s+([0-9]+)/.exec(line);
      if (limit !== null) {
        proofLimitMap.push({
          original: limit[1]!,
          permanentAtom: global?.[2] ?? limit[1]!,
          value: Number.parseInt(limit[2]!, 10),
          loweredAtomValue: 0,
        });
      }
    }
  }
  return Object.freeze({
    proofSymbolMap,
    proofLimitMap,
  });
};

export interface NucleusPermanentAtomProofOptions {
  readonly asmRoot?: string;
  readonly atomRoot?: string;
  readonly maxInstructions?: number;
  readonly maxCycles?: number;
  readonly legacyOutputOrder?: boolean;
}

export const nucleusPermanentAtomProofOptions = async (
  manifestPath: string,
  options: NucleusPermanentAtomProofOptions = {},
): Promise<RunProofManifestOptions> => {
  const asmRoot = path.resolve(options.asmRoot ?? NUCLEUS_DEFAULT_ASM_ROOT);
  const atomRoot = path.resolve(
    options.atomRoot ?? NUCLEUS_DEFAULT_PERMANENT_ATOM_ROOT,
  );
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    readonly source?: unknown;
  };
  if (typeof manifest.source !== "string") {
    throw new Error("Atom proof assembly requires a manifest source path");
  }
  const sourcePath = path.resolve(path.dirname(manifestPath), manifest.source);
  const entry = pathInside(asmRoot, sourcePath);
  if (entry === undefined) {
    throw new Error(
      "Atom proof assembly requires a manifest source under the checked-in Nucleus asm tree",
    );
  }
  return Object.freeze({
    assembler: {
      flavour: "atom" as const,
      source: "permanent" as const,
      root: atomRoot,
      entry,
      maxInstructions: options.maxInstructions ?? 700_000_000,
      maxCycles: options.maxCycles ?? 7_000_000_000,
      legacyOutputOrder: options.legacyOutputOrder ?? true,
    },
    atomMigration: await readNucleusPermanentAtomMigrationMetadata(atomRoot),
  });
};
