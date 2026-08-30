import path from "node:path";

import { compile } from "@jhlagado/azm/compile";

interface AzmDiagnostic {
  readonly severity?: string;
  readonly sourceName?: string;
  readonly line?: number;
  readonly column?: number;
  readonly message: string;
}

interface AzmHexArtifact {
  readonly kind: "hex";
  readonly text: string;
}

interface AzmDebugMapArtifact {
  readonly kind: "d8m";
  readonly json: {
    readonly symbols: readonly {
      readonly name: string;
      readonly address?: number;
      readonly value?: number;
    }[];
  };
}

type AzmArtifact =
  AzmHexArtifact | AzmDebugMapArtifact | { readonly kind: string };

interface AzmAssembly {
  readonly diagnostics: readonly AzmDiagnostic[];
  readonly artifacts: readonly AzmArtifact[];
}

type FailureFactory = (message: string) => Error;

const defaultFailure: FailureFactory = (message) => new Error(message);

const formatDiagnostics = (
  diagnostics: readonly AzmDiagnostic[],
  fallbackSourcePath: string,
): string =>
  diagnostics
    .map(
      (diagnostic) =>
        `  ${diagnostic.sourceName ?? fallbackSourcePath}:${diagnostic.line ?? "?"}:${diagnostic.column ?? "?"} ${diagnostic.message}`,
    )
    .join("\n");

const errorDiagnostics = (assembly: AzmAssembly): readonly AzmDiagnostic[] =>
  assembly.diagnostics.filter((diagnostic) => diagnostic.severity === "error");

export async function assembleLegacyAzmCurrentSource({
  manifestName,
  sourcePath,
  failure = defaultFailure,
}: {
  readonly manifestName: string;
  readonly sourcePath: string;
  readonly failure?: FailureFactory;
}): Promise<unknown> {
  const current = (await compile(sourcePath, {
    outputType: "bin",
  })) as AzmAssembly;
  const errors = errorDiagnostics(current);
  if (errors.length > 0) {
    throw failure(
      `${manifestName}: current assembly failed before Atom-preview lowering\n${formatDiagnostics(
        errors,
        sourcePath,
      )}`,
    );
  }
  return current;
}

export async function assembleLegacyAzmProofSource({
  manifestName,
  sourcePath,
  manifestDirectory,
  interfaces,
  failure = defaultFailure,
}: {
  readonly manifestName: string;
  readonly sourcePath: string;
  readonly manifestDirectory: string;
  readonly interfaces: readonly string[];
  readonly failure?: FailureFactory;
}): Promise<{
  readonly hexText: string;
  readonly rawSymbols: Readonly<Record<string, number>>;
}> {
  const assembled = (await compile(sourcePath, {
    emitBin: false,
    emitHex: true,
    emitD8m: true,
    registerContracts: "strict",
    registerContractsInterfaces: interfaces.map((file) =>
      path.resolve(manifestDirectory, file),
    ),
  })) as AzmAssembly;
  const errors = errorDiagnostics(assembled);
  if (errors.length > 0) {
    throw failure(
      `${manifestName}: assembly failed\n${formatDiagnostics(errors, sourcePath)}`,
    );
  }

  const hex = assembled.artifacts.find(
    (artifact): artifact is AzmHexArtifact => artifact.kind === "hex",
  );
  const debugMap = assembled.artifacts.find(
    (artifact): artifact is AzmDebugMapArtifact => artifact.kind === "d8m",
  );
  if (hex === undefined || debugMap === undefined) {
    throw failure(`${manifestName}: AZM omitted HEX or D8M output`);
  }

  return {
    hexText: hex.text,
    rawSymbols: Object.fromEntries(
      debugMap.json.symbols.flatMap((entry) => {
        const value = entry.address ?? entry.value;
        return value === undefined ? [] : [[entry.name, value] as const];
      }),
    ),
  };
}
