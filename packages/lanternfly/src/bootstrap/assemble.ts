/**
 * AZM wrappers. One module, not a copy per test: the seventeen TECM8 proof
 * runners come to 8,661 lines largely because each restates these.
 */

import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { compile } from "@jhlagado/azm/compile";
import { compileSource } from "@jhlagado/azm";

export interface Assembled {
  readonly bytes: Uint8Array;
  readonly origin: number;
  /** Name to address. Case-folded lookup is the caller's business. */
  readonly symbols: Readonly<Record<string, number>>;
}

export class AssemblyError extends Error {
  constructor(readonly diagnostics: readonly { message: string; line?: number }[]) {
    super(
      `assembly failed:\n${diagnostics
        .map((d) => `  ${d.line ?? "?"}: ${d.message}`)
        .join("\n")}`,
    );
    this.name = "AssemblyError";
  }
}

/** In-memory assembly. No includes, no listing. Fast, and enough for proofs. */
export function assembleSource(text: string): Assembled {
  const result = compileSource(text);
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) throw new AssemblyError(errors);

  // compileSource returns a byte image whose first written address is the
  // origin; recover it from the hex text's first record.
  const origin = originFromHex(result.hexText);
  return { bytes: result.bytes, origin, symbols: result.symbols };
}

/** File-based assembly, resolving includes. */
export async function assembleFile(entry: string): Promise<Assembled> {
  const result = await compile(entry, {
    emitBin: true,
    emitHex: true,
    emitD8m: true,
  });
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) throw new AssemblyError(errors);

  const bin = result.artifacts.find((a) => a.kind === "bin");
  const hex = result.artifacts.find((a) => a.kind === "hex");
  const d8m = result.artifacts.find((a) => a.kind === "d8m");
  if (bin?.kind !== "bin" || hex?.kind !== "hex" || d8m?.kind !== "d8m") {
    throw new Error("AZM produced no bin, hex or d8m artifact");
  }

  const symbols: Record<string, number> = {};
  for (const symbol of d8m.json.symbols ?? []) {
    const value = symbol.address ?? symbol.value;
    if (typeof value === "number") symbols[symbol.name] = value;
  }

  return { bytes: bin.bytes, origin: originFromHex(hex.text), symbols };
}

/** Assembles text through the file path, so `.include` resolves. */
export async function assembleText(text: string): Promise<Assembled> {
  const dir = await mkdtemp(path.join(tmpdir(), "lanternfly-"));
  const file = path.join(dir, "source.asm");
  try {
    await writeFile(file, text, "utf8");
    return await assembleFile(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function symbolAt(
  assembled: Assembled,
  name: string,
): number {
  const direct = assembled.symbols[name];
  if (typeof direct === "number") return direct;

  const folded = name.toLowerCase();
  const matches = Object.entries(assembled.symbols).filter(
    ([key]) => key.toLowerCase() === folded,
  );
  if (matches.length === 1) return matches[0][1];
  if (matches.length === 0) throw new Error(`no symbol named ${name}`);
  throw new Error(`symbol ${name} is ambiguous`);
}

function originFromHex(hexText: string): number {
  for (const line of hexText.split(/\r?\n/)) {
    if (!line.startsWith(":")) continue;
    const type = line.slice(7, 9);
    if (type !== "00") continue;
    return Number.parseInt(line.slice(3, 7), 16);
  }
  return 0;
}
