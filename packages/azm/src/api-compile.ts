import { normalize } from 'node:path';

import { assembleProgram } from './assembly/assemble-program.js';
import { emitAssemblyArtifacts } from './api-artifacts.js';
import { runRegisterContracts, shouldAnalyzeRegisterContracts } from './api-register-contracts.js';
import { analyzeProgramNext, loadProgramNext } from './tooling/api.js';
import { defaultFormatWriters } from './outputs/index.js';
import { writeHex } from './outputs/write-hex.js';
import { registerContractsPolicyModeForFile } from './register-contracts/policy.js';
import type {
  AddressRange,
  Artifact,
  D8mArtifact,
  D8mFileEntry,
  D8mFileSymbol,
  D8mGenerator,
  D8mJson,
  D8mSegment,
  D8mSymbol,
  EmittedByteMap,
  FormatWriters,
  SymbolEntry,
  WriteD8mOptions,
} from './outputs/types.js';
import type { Diagnostic } from './model/diagnostic.js';
import type { SymbolCaseMode } from './model/symbol.js';
import { buildRegisterContractsProgramModel } from './register-contracts/programModel.js';
import type { CaseStyleMode } from './tooling/case-style.js';
import type {
  RegisterContractsDirectCall,
  RegisterContractsMode,
  RegisterContractsPolicy,
  RegisterContractsPolicyMode,
  RegisterContractsReportFormat,
} from './register-contracts/types.js';

function parseUnresolvedSymbolName(message: string): string | undefined {
  const match = /^Unresolved symbol "([^"]+)"/.exec(message);
  return match?.[1];
}

function isSuppressedUnknownSymbolInRegisterContractsMode(
  diagnostic: Diagnostic,
  directCalls: readonly RegisterContractsDirectCall[] | undefined,
  policy: RegisterContractsPolicy | undefined,
  fallbackMode: RegisterContractsMode | undefined,
  sourcePolicy: ReadonlyMap<string, RegisterContractsPolicyMode>,
): boolean {
  if (directCalls === undefined || directCalls.length === 0) {
    return false;
  }
  if (diagnostic.code !== 'AZMN_SYMBOL' || diagnostic.message === undefined) {
    return false;
  }
  if (!diagnostic.message.includes('in 16-bit fixup')) {
    return false;
  }
  const symbol = parseUnresolvedSymbolName(diagnostic.message);
  if (symbol === undefined) {
    return false;
  }
  return directCalls.some(
    (call) =>
      call.target === symbol &&
      call.file === diagnostic.sourceName &&
      call.line === diagnostic.line &&
      call.column === diagnostic.column &&
      !isRegisterContractsPolicyOffForFile(call.file, policy, fallbackMode, sourcePolicy),
  );
}

function isRegisterContractsPolicyOffForFile(
  file: string,
  policy: RegisterContractsPolicy | undefined,
  fallbackMode: RegisterContractsMode | undefined,
  sourcePolicy: ReadonlyMap<string, RegisterContractsPolicyMode>,
): boolean {
  return (
    registerContractsPolicyModeForFile(file, policy ?? {}, fallbackMode, sourcePolicy.get(file)) ===
    'off'
  );
}

export { writeHex, defaultFormatWriters };
export type { AddressRange, Artifact, EmittedByteMap, FormatWriters };
// fallow-ignore-next-line unused-type
export type { D8mArtifact };
// fallow-ignore-next-line unused-type
export type { D8mFileEntry };
// fallow-ignore-next-line unused-type
export type { D8mFileSymbol };
// fallow-ignore-next-line unused-type
export type { D8mGenerator };
// fallow-ignore-next-line unused-type
export type { D8mJson };
// fallow-ignore-next-line unused-type
export type { D8mSegment };
// fallow-ignore-next-line unused-type
export type { D8mSymbol };
// fallow-ignore-next-line unused-type
export type { SymbolEntry };
// fallow-ignore-next-line unused-type
export type { WriteD8mOptions };

export type CompileDependencies = CompileNextDependencies;
export type CompileFunctionOptions = CompileNextFunctionOptions;
export type CompileResult = CompileNextResult;

export interface CompileNextDependencies {
  readonly formats: FormatWriters;
}

export interface CompileNextFunctionOptions {
  readonly includeDirs?: readonly string[];
  readonly directiveAliasFiles?: readonly string[];
  readonly caseStyle?: CaseStyleMode;
  readonly outputPath?: string;
  readonly outputType?: 'bin' | 'hex';
  readonly sourceRoot?: string;
  readonly d8mInputs?: {
    readonly hex?: string;
    readonly bin?: string;
  };
  readonly emitBin?: boolean;
  readonly emitHex?: boolean;
  readonly emitD8m?: boolean;
  readonly emitAsm80?: boolean;
  readonly symbolCase?: SymbolCaseMode;
  readonly registerContracts?: RegisterContractsMode;
  readonly registerContractsPolicy?: RegisterContractsPolicy;
  readonly emitRegisterReport?: boolean;
  readonly registerContractsReportFormat?: RegisterContractsReportFormat;
  readonly registerContractsBaseline?: string;
  readonly registerContractsRatchet?: boolean;
  readonly requireRegisterExpectOut?: boolean;
  readonly emitRegisterInterface?: boolean;
  readonly emitRegisterInference?: boolean;
  readonly registerContractsInferenceFormat?: 'json' | 'markdown';
  readonly emitRegisterAnnotations?: boolean;
  readonly fixRegisterContracts?: boolean;
  readonly acceptRegisterOutputCandidates?: string[];
  readonly registerContractsProfile?: 'mon3';
  readonly registerContractsInterfaces?: string[];
  readonly skipAssembly?: boolean;
}

export interface CompileNextResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly artifacts: readonly Artifact[];
}

/**
 * Compile an AZM/ASM80-style program into in-memory artifacts.
 */
export async function compile(
  entryFile: string,
  options: CompileNextFunctionOptions = {},
  deps: CompileNextDependencies = { formats: defaultFormatWriters },
): Promise<CompileNextResult> {
  const diagnostics: Diagnostic[] = [];
  const normalizedEntry = normalize(entryFile);

  const loaded = await loadProgramNext({
    entryFile: normalizedEntry,
    ...(options.includeDirs !== undefined ? { includeDirs: options.includeDirs } : {}),
    ...(options.directiveAliasFiles !== undefined
      ? { directiveAliasFiles: options.directiveAliasFiles }
      : {}),
    ...(options.symbolCase !== undefined ? { symbolCase: options.symbolCase } : {}),
  });
  diagnostics.push(...loaded.diagnostics);

  if (loaded.loadedProgram === undefined) {
    return { diagnostics, artifacts: [] };
  }

  const analysis = analyzeProgramNext(loaded.loadedProgram, {
    ...(options.caseStyle !== undefined ? { caseStyle: options.caseStyle } : {}),
    ...(options.symbolCase !== undefined ? { symbolCase: options.symbolCase } : {}),
  });
  const sourceRequestsRegisterContracts =
    loaded.loadedProgram.program.files[0]?.items.some(
      (item) => item.kind === 'contracts-policy' && item.mode !== 'off',
    ) === true;
  const analyzeRegisterContractsNow =
    shouldAnalyzeRegisterContracts(options) || sourceRequestsRegisterContracts;
  const sourcePolicy = new Map(
    (loaded.loadedProgram.program.files[0]?.items ?? [])
      .filter(
        (item): item is Extract<typeof item, { readonly kind: 'contracts-policy' }> =>
          item.kind === 'contracts-policy',
      )
      .map((item) => [item.span.sourceName, item.mode]),
  );

  const directCalls = analyzeRegisterContractsNow
    ? buildRegisterContractsProgramModel(loaded.loadedProgram.program.files[0]?.items ?? [])
        .directCalls
    : undefined;

  diagnostics.push(
    ...analysis.diagnostics.filter((diagnostic) =>
      analyzeRegisterContractsNow
        ? !isSuppressedUnknownSymbolInRegisterContractsMode(
            diagnostic,
            directCalls,
            options.registerContractsPolicy,
            options.registerContracts,
            sourcePolicy,
          )
        : true,
    ),
  );

  const artifacts: Artifact[] = [];

  if (hasErrors(diagnostics)) {
    if (analyzeRegisterContractsNow && options.emitRegisterReport === true) {
      const registerContracts = await runRegisterContracts(loaded.loadedProgram, options);
      artifacts.push(...registerContractsReportArtifacts(registerContracts.artifacts));
    }
    sortDiagnosticsInPlace(diagnostics);
    return { diagnostics, artifacts };
  }

  if (analyzeRegisterContractsNow) {
    const registerContracts = await runRegisterContracts(loaded.loadedProgram, options);
    artifacts.push(...registerContracts.artifacts);
    diagnostics.push(...registerContracts.diagnostics);
    if (hasErrors(diagnostics)) return { diagnostics, artifacts };
  }

  if (options.skipAssembly === true) {
    return { diagnostics, artifacts };
  }

  const program = loaded.loadedProgram.program.files[0]?.items ?? [];
  const assembled = assembleProgram(
    program,
    options.symbolCase === undefined ? {} : { symbolCase: options.symbolCase },
  );
  diagnostics.push(
    ...assembled.diagnostics.filter((diagnostic) =>
      analyzeRegisterContractsNow
        ? !isSuppressedUnknownSymbolInRegisterContractsMode(
            diagnostic,
            directCalls,
            options.registerContractsPolicy,
            options.registerContracts,
            sourcePolicy,
          )
        : true,
    ),
  );
  sortDiagnosticsInPlace(diagnostics);

  if (hasErrors(diagnostics)) {
    return { diagnostics, artifacts: registerContractsReportArtifacts(artifacts) };
  }

  const emittedArtifacts = await emitAssemblyArtifacts({
    entryFile: normalizedEntry,
    options,
    formats: deps.formats,
    program,
    sourceTexts: loaded.loadedProgram.sourceTexts,
    logicalLines: loaded.loadedProgram.logicalLines,
    bytes: assembled.bytes,
    origin: assembled.origin,
    sourceSegments: assembled.sourceSegments,
    initializedAddresses: assembled.initializedAddresses,
    symbols: assembled.symbols,
    internalSymbols: assembled.internalSymbols,
    assemblyItems: assembled.assemblyItems,
  });
  artifacts.push(...emittedArtifacts.artifacts);
  diagnostics.push(...emittedArtifacts.diagnostics);

  return { diagnostics, artifacts };
}

function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

function registerContractsReportArtifacts(artifacts: readonly Artifact[]): Artifact[] {
  return artifacts.filter((artifact) => artifact.kind === 'register-contracts-report');
}

function sortDiagnosticsInPlace(diagnostics: Diagnostic[]): void {
  dedupeDiagnosticsInPlace(diagnostics);
  diagnostics.sort((left, right) => {
    const lineDelta = (left.line ?? 0) - (right.line ?? 0);
    if (lineDelta !== 0) {
      return lineDelta;
    }
    return (left.column ?? 0) - (right.column ?? 0);
  });
}

function dedupeDiagnosticsInPlace(diagnostics: Diagnostic[]): void {
  const seen = new Set<string>();
  for (let index = diagnostics.length - 1; index >= 0; index -= 1) {
    const diagnostic = diagnostics[index]!;
    const key = diagnosticKey(diagnostic);
    if (seen.has(key)) {
      diagnostics.splice(index, 1);
      continue;
    }
    seen.add(key);
  }
}

function diagnosticKey(diagnostic: Diagnostic): string {
  return [
    diagnostic.severity,
    diagnostic.code,
    diagnostic.message,
    diagnostic.sourceName ?? '',
    diagnostic.line ?? '',
    diagnostic.column ?? '',
  ].join('\0');
}
