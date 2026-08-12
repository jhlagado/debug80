import path from "node:path";
import { fileURLToPath } from "node:url";

import { compile } from "@jhlagado/azm/compile";
import { parseIntelHex } from "@jhlagado/debug80-runtime";

import type { RuntimeImage, RuntimeImageProvider } from "./nobj.js";
import { NobjError } from "./nobj.js";

export class CanonicalRuntimeImageProvider implements RuntimeImageProvider {
  readonly #image: RuntimeImage;

  constructor(image: RuntimeImage) {
    this.#image = { identity: image.identity, bytes: image.bytes.slice() };
  }

  get(identity: number): RuntimeImage | undefined {
    if (identity !== this.#image.identity) return undefined;
    return { identity, bytes: this.#image.bytes.slice() };
  }
}

export const loadCanonicalRuntimeImage = async (
  sourcePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../asm/vertical-slice/stage7-ll1-aggregate-call-z80-slice-proof.asm",
  ),
): Promise<RuntimeImage> => {
  const assembled = await compile(sourcePath, {
    emitBin: false,
    emitHex: true,
    emitD8m: true,
    registerContracts: "strict",
    registerContractsInterfaces: [
      path.resolve(path.dirname(sourcePath), "expression-generated-z80.asmi"),
    ],
  });
  const errors = assembled.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (errors.length > 0) {
    throw new NobjError(
      `canonical runtime assembly failed: ${errors
        .map((diagnostic) => diagnostic.message)
        .join("; ")}`,
    );
  }
  const hex = assembled.artifacts.find((artifact) => artifact.kind === "hex");
  const debugMap = assembled.artifacts.find(
    (artifact) => artifact.kind === "d8m",
  );
  if (hex?.kind !== "hex" || debugMap?.kind !== "d8m") {
    throw new NobjError("canonical runtime assembly omitted HEX or D8M output");
  }
  const symbol = (name: string): number => {
    const wanted = name.toLowerCase();
    for (const entry of debugMap.json.symbols) {
      if (entry.name.toLowerCase() !== wanted) continue;
      const value = entry.address ?? entry.value;
      if (value !== undefined) return value;
    }
    throw new NobjError(`canonical runtime assembly omitted ${name}`);
  };
  const start = symbol("RuntimeCodeStart");
  const end = symbol("RuntimeCodeEnd");
  if (start < 0 || end <= start || end > 0x10000) {
    throw new NobjError("canonical runtime extent is invalid");
  }
  return {
    identity: symbol("NucleusRuntimeIdentity"),
    bytes: parseIntelHex(hex.text).memory.slice(start, end),
  };
};

export const loadCanonicalRuntimeProvider =
  async (): Promise<CanonicalRuntimeImageProvider> =>
    new CanonicalRuntimeImageProvider(await loadCanonicalRuntimeImage());
