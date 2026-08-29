import type { SourcePart } from "./source-part.js";

export type { SourcePart } from "./source-part.js";

export function parseSourceManifest(text: string): string[] {
  if (/\r(?!\n)/.test(text)) {
    throw new Error("source manifest contains a lone carriage return");
  }
  return text.replaceAll("\r\n", "\n").split("\n").filter(Boolean);
}

export function buildSourceParts(
  manifest: string,
  readSource: (name: string) => Uint8Array,
): SourcePart[] {
  return parseSourceManifest(manifest).map((name, index) => ({
    ordinal: index + 1,
    stableIdentity: `${index + 1}:${name}`,
    diagnosticName: name,
    bytes: readSource(name),
  }));
}
