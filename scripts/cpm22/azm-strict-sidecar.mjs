import assert from "node:assert/strict";

import { compile, defaultFormatWriters } from "@jhlagado/azm/compile";

export function symbolsFromDebugMap(debugMap) {
  return Object.fromEntries(
    debugMap.symbols.flatMap((entry) => {
      const value = entry.address ?? entry.value;
      return value === undefined ? [] : [[entry.name, value]];
    }),
  );
}

export async function compileAzmStrictSidecar({
  label,
  source,
  registerContracts = "strict",
  registerContractsInterfaces = [],
  emitD8m = true,
}) {
  const result = await compile(
    source,
    {
      emitBin: true,
      emitD8m,
      emitHex: false,
      emitLst: false,
      emitAsm80: false,
      registerContracts,
      ...(registerContractsInterfaces.length === 0
        ? {}
        : { registerContractsInterfaces }),
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
  assert.equal(binary?.kind, "bin", `${label}: missing AZM sidecar binary`);
  const debugMap = result.artifacts.find((artifact) => artifact.kind === "d8m");
  if (emitD8m) {
    assert.equal(
      debugMap?.kind,
      "d8m",
      `${label}: missing AZM sidecar debug map`,
    );
  }
  return Object.freeze({
    bytes: binary.bytes,
    debugMap: debugMap?.kind === "d8m" ? debugMap.json : undefined,
  });
}
