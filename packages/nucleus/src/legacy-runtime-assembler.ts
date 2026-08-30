import { writeFile } from "node:fs/promises";
import path from "node:path";

import { compile } from "@jhlagado/azm/compile";

import type { RuntimeLinkContext } from "./nobj.js";

interface AzmDiagnostic {
  readonly severity?: string;
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

const hexWord = (value: number): string =>
  `$${value.toString(16).padStart(4, "0")}`;

const contextAssembly = (context: RuntimeLinkContext): string => `
RuntimeLinkBase             .equ ${hexWord(context.runtimeBase)}
RuntimeWritableStateBase    .equ ${hexWord(context.writableStateBase)}
RuntimeProgramDataBase      .equ ${hexWord(context.programDataBase)}
RuntimeProgramDataCapacity  .equ ${hexWord(context.programDataCapacity)}
RuntimeReadOnlyBase         .equ ${hexWord(context.readOnlyBase)}
RuntimeReadOnlyCapacity     .equ ${hexWord(context.readOnlyCapacity)}

StateBase          .equ RuntimeWritableStateBase
RunState           .equ StateBase+$00
TrapNumber         .equ StateBase+$01
TrapRoutine        .equ StateBase+$02
TrapOffset         .equ StateBase+$03
TrapError          .equ StateBase+$05
ActivationDepth    .equ StateBase+$06
ActivationLimit    .equ StateBase+$07
ScalarSlot         .equ StateBase+$08
CurrentBank        .equ ScalarSlot
ActivationArena    .equ StateBase+$09
ActivationCapacity .equ 8
RootSP             .equ ActivationArena+ActivationCapacity
RootIX             .equ RootSP+2
FarReturnArena     .equ RootIX+2
FarReturnCapacity  .equ ActivationCapacity*2
StateEnd           .equ FarReturnArena+FarReturnCapacity

RunReady           .equ 1
RunSucceeded       .equ 2
RunTrapped         .equ 3

ProgramDataBase           .equ RuntimeProgramDataBase
ProgramDataRegionCapacity .equ RuntimeProgramDataCapacity
GeneratedRoDataBase       .equ RuntimeReadOnlyBase
GeneratedRoDataCapacity   .equ RuntimeReadOnlyCapacity

AggregateCallSlices .equ 1
ComparisonEqual        .equ 0
ComparisonNotEqual     .equ 1
ComparisonLess         .equ 2
ComparisonLessEqual    .equ 3
ComparisonGreater      .equ 4
ComparisonGreaterEqual .equ 5
`;

export async function assembleLegacyAzmRuntimeImage({
  temporaryDirectory,
  runtimeSourceDirectory,
  context,
  failure,
}: {
  readonly temporaryDirectory: string;
  readonly runtimeSourceDirectory: string;
  readonly context: RuntimeLinkContext;
  readonly failure: FailureFactory;
}): Promise<{
  readonly hexText: string;
  readonly rawSymbols: Readonly<Record<string, number>>;
}> {
  const contextPath = path.join(
    temporaryDirectory,
    "nucleus-runtime-link-context.asmi",
  );
  const entryPath = path.join(temporaryDirectory, "runtime-link.asm");
  await writeFile(contextPath, contextAssembly(context), "utf8");
  await writeFile(
    entryPath,
    `.include "nucleus-runtime-link-context.asmi"\n` +
      `.org RuntimeLinkBase\nRuntimeCodeStart:\n` +
      `.include "target-z80-runtime.asm"\nRuntimeCodeEnd:\n`,
    "utf8",
  );
  const assembled = (await compile(entryPath, {
    includeDirs: [temporaryDirectory, runtimeSourceDirectory],
    emitBin: false,
    emitHex: true,
    emitD8m: true,
    registerContracts: "strict",
  })) as AzmAssembly;
  const errors = assembled.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (errors.length > 0) {
    throw failure(
      `canonical runtime link failed: ${errors
        .map((diagnostic) => diagnostic.message)
        .join("; ")}`,
    );
  }
  const hex = assembled.artifacts.find(
    (artifact): artifact is AzmHexArtifact => artifact.kind === "hex",
  );
  const debugMap = assembled.artifacts.find(
    (artifact): artifact is AzmDebugMapArtifact => artifact.kind === "d8m",
  );
  if (hex === undefined || debugMap === undefined) {
    throw failure("canonical runtime link omitted HEX or D8M output");
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
