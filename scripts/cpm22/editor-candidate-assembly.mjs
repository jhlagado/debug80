import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { compile, defaultFormatWriters } from "@jhlagado/azm/compile";

import { assembleAzmSourceWithAtomArtifacts } from "./atom-projection.mjs";

function symbolsFromDebugMap(debugMap) {
  return Object.fromEntries(
    debugMap.symbols.flatMap((entry) => {
      const value = entry.address ?? entry.value;
      return value === undefined ? [] : [[entry.name, value]];
    }),
  );
}

function externNames(source) {
  return [...source.matchAll(/^\s*extern\s+([A-Za-z_][A-Za-z0-9_]*)\b/gim)].map(
    (match) => match[1],
  );
}

export async function assembleEditorCandidate({
  name,
  source,
  interfaceSource,
  interfaceSources = interfaceSource === undefined ? [] : [interfaceSource],
  registerContracts = "strict",
  includeRoots = [dirname(source)],
}) {
  const result = await compile(
    source,
    {
      emitBin: true,
      emitD8m: true,
      emitHex: false,
      emitLst: false,
      emitAsm80: false,
      registerContracts,
      ...(interfaceSources.length === 0
        ? {}
        : { registerContractsInterfaces: interfaceSources }),
    },
    { formats: defaultFormatWriters },
  );
  const errors = result.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  assert.deepEqual(
    errors,
    [],
    errors
      .map(
        (diagnostic) =>
          `${diagnostic.sourceName}:${diagnostic.line}:${diagnostic.column}: ${diagnostic.message}`,
      )
      .join("\n"),
  );
  const binary = result.artifacts.find((artifact) => artifact.kind === "bin");
  assert.equal(
    binary?.kind,
    "bin",
    `${name}: missing AZM strict-contract binary`,
  );

  const sourceText = await readFile(source, "utf8");
  const externalSymbols = (
    await Promise.all(
      interfaceSources.map(async (interfacePath) =>
        externNames(await readFile(interfacePath, "utf8")),
      ),
    )
  ).flat();
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "debug80-cpm22-editor-candidate-"),
  );
  let atomArtifacts;
  try {
    atomArtifacts = await assembleAzmSourceWithAtomArtifacts({
      temporaryDirectory,
      sourceDirectory: dirname(source),
      name: `${name}.asm`,
      source: sourceText,
      azmBytes: binary.bytes,
      base: 0x0100,
      entryAddress: 0x0100,
      includeRoots: includeRoots.map((root) => resolve(root)),
      externalSymbols,
    });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }

  return Object.freeze({
    bytes: atomArtifacts.bytes,
    name,
    symbols: symbolsFromDebugMap(atomArtifacts.debugMap),
  });
}
