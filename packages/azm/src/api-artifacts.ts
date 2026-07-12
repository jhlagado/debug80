import { readFile } from 'node:fs/promises';
import { dirname, normalize } from 'node:path';

import type { Diagnostic } from './model/diagnostic.js';
import type { SourceItem } from './model/source-item.js';
import { UnsupportedAsm80LoweringError } from './outputs/write-asm80.js';
import type {
  AddressRange,
  Artifact,
  EmittedByteMap,
  FormatWriters,
  SymbolEntry,
  WriteD8mOptions,
} from './outputs/types.js';
import type { CompileNextFunctionOptions } from './api-compile.js';

interface EmitAssemblyArtifactsOptions {
  readonly entryFile: string;
  readonly options: CompileNextFunctionOptions;
  readonly formats: FormatWriters;
  readonly program: readonly SourceItem[];
  readonly bytes: Uint8Array;
  readonly origin: number;
  readonly sourceSegments: EmittedByteMap['sourceSegments'];
  readonly initializedAddresses: readonly number[];
  readonly symbols: Readonly<Record<string, number>>;
  readonly internalSymbols: Readonly<Record<string, number>>;
  readonly assemblyItems: readonly SourceItem[];
}

let cachedPackageVersion: string | undefined;

export async function emitAssemblyArtifacts(input: EmitAssemblyArtifactsOptions): Promise<{
  readonly artifacts: readonly Artifact[];
  readonly diagnostics: readonly Diagnostic[];
}> {
  const artifacts: Artifact[] = [];
  const diagnostics: Diagnostic[] = [];
  const map = assembledImageToMap(input.bytes, input.origin, input.sourceSegments);
  const hexMap = assembledInitializedImageToMap(
    input.bytes,
    input.origin,
    input.initializedAddresses,
  );
  const sidecarMap = assembledInitializedImageToMap(
    input.bytes,
    input.origin,
    input.initializedAddresses,
    input.sourceSegments,
  );
  const symbols = collectSymbolEntries(input.program, input.assemblyItems, input.internalSymbols);
  const emit = compileArtifactDefaults(input.options);
  const d8Root = input.options.sourceRoot ?? dirname(input.entryFile);

  if (emit.emitBin) {
    artifacts.push(input.formats.writeBin(map, symbols));
  }

  if (emit.emitHex) {
    artifacts.push(input.formats.writeHex(hexMap, symbols));
  }

  if (emit.emitD8m) {
    artifacts.push(
      input.formats.writeD8m(
        sidecarMap,
        symbols,
        await buildD8mOptions(input.entryFile, d8Root, input.options, symbols),
      ),
    );
  }

  if (emit.emitAsm80 && input.formats.writeAsm80 !== undefined) {
    try {
      artifacts.push(input.formats.writeAsm80(input.program, symbols));
    } catch (error) {
      if (error instanceof UnsupportedAsm80LoweringError) {
        diagnostics.push({
          severity: 'error',
          code: 'AZMN_ASM80',
          message: error.message,
          sourceName: error.item.span.sourceName,
          line: error.item.span.line,
          column: error.item.span.column,
        });
      } else {
        throw error;
      }
    }
  }

  return { artifacts, diagnostics };
}

function compileArtifactDefaults(options: CompileNextFunctionOptions): {
  readonly emitBin: boolean;
  readonly emitHex: boolean;
  readonly emitD8m: boolean;
  readonly emitAsm80: boolean;
} {
  const anyPrimary = [options.emitBin, options.emitHex, options.emitD8m].some(
    (value) => value !== undefined,
  );
  const emitBin = anyPrimary ? (options.emitBin ?? false) : true;
  const emitHex = anyPrimary ? (options.emitHex ?? false) : true;
  const emitD8m = anyPrimary ? (options.emitD8m ?? false) : true;
  const emitAsm80 = options.emitAsm80 ?? false;
  return { emitBin, emitHex, emitD8m, emitAsm80 };
}

function assembledImageToMap(
  bytes: Uint8Array,
  origin: number,
  sourceSegments: EmittedByteMap['sourceSegments'] = [],
): EmittedByteMap {
  const map = new Map<number, number>();
  for (let offset = 0; offset < bytes.length; offset += 1) {
    map.set(origin + offset, bytes[offset] ?? 0);
  }

  const writtenRange: AddressRange = {
    start: origin,
    end: origin + bytes.length,
  };

  return { bytes: map, writtenRange, sourceSegments };
}

function assembledInitializedImageToMap(
  bytes: Uint8Array,
  origin: number,
  initializedAddresses: readonly number[],
  sourceSegments: EmittedByteMap['sourceSegments'] = [],
): EmittedByteMap {
  const map = new Map<number, number>();
  for (const address of initializedAddresses) {
    const offset = address - origin;
    if (offset >= 0 && offset < bytes.length) {
      map.set(address, bytes[offset] ?? 0);
    }
  }

  return { bytes: map, sourceSegments };
}

function collectSymbolEntries(
  originalItems: readonly SourceItem[],
  qualifiedItems: readonly SourceItem[],
  resolvedSymbols: Readonly<Record<string, number>>,
): SymbolEntry[] {
  const map = new Map<string, SymbolEntry>();
  const pairs = originalItems.flatMap((original, index) => {
    const qualified = qualifiedItems[index];
    return qualified === undefined ? [] : [{ original, qualified }];
  });
  const displayCounts = new Map<string, number>();
  for (const pair of pairs) {
    for (const name of declarationDisplayNames(pair.original, pair.qualified)) {
      displayCounts.set(name, (displayCounts.get(name) ?? 0) + 1);
    }
  }
  for (const pair of pairs) {
    appendSymbolEntry(map, pair.original, pair.qualified, resolvedSymbols, displayCounts);
  }
  return [...map.values()];
}

function declarationDisplayNames(original: SourceItem, qualified: SourceItem): readonly string[] {
  if (original.kind === 'label' && qualified.kind === 'label') {
    return [baseLabelDisplayName(original.name, qualified.name)];
  }
  if (original.kind === 'equ' && qualified.kind === 'equ') return [original.name];
  if (original.kind === 'enum' && qualified.kind === 'enum') {
    return original.members.map((member) => `${original.name}.${member}`);
  }
  return [];
}

function appendSymbolEntry(
  map: Map<string, SymbolEntry>,
  original: SourceItem,
  qualified: SourceItem,
  resolvedSymbols: Readonly<Record<string, number>>,
  displayCounts: ReadonlyMap<string, number>,
): void {
  if (original.kind === 'equ' && qualified.kind === 'equ') {
    const value = resolvedSymbols[qualified.name];
    if (value !== undefined) {
      const identity = declarationIdentity(original, original.name, 'constant');
      map.set(identity, {
        kind: 'constant',
        name: original.name,
        identity,
        value,
        file: original.span.sourceName,
        line: original.span.line,
        scope: declarationScope(original),
        visibility: declarationVisibility(original),
        sourceUnit: original.span.sourceUnit ?? original.span.sourceName,
        ...(needsSourceQualifier(original.name, original, displayCounts)
          ? { needsSourceQualifier: true }
          : {}),
      });
    }
    return;
  }

  if (original.kind === 'label' && qualified.kind === 'label') {
    const address = resolvedSymbols[qualified.name];
    if (address !== undefined) {
      const baseName = baseLabelDisplayName(original.name, qualified.name);
      const identity = declarationIdentity(original, baseName, 'label');
      map.set(identity, {
        kind: 'label',
        name: baseName,
        identity,
        address,
        file: original.span.sourceName,
        line: original.span.line,
        scope: declarationScope(original),
        visibility: declarationVisibility(original),
        sourceUnit: original.span.sourceUnit ?? original.span.sourceName,
        ...(needsSourceQualifier(baseName, original, displayCounts)
          ? { needsSourceQualifier: true }
          : {}),
      });
    }
    return;
  }

  if (original.kind === 'enum' && qualified.kind === 'enum') {
    for (const member of original.members) {
      const fullName = `${original.name}.${member}`;
      const qualifiedName = `${qualified.name}.${member}`;
      const value = resolvedSymbols[qualifiedName];
      if (value !== undefined) {
        const identity = declarationIdentity(original, fullName, 'constant');
        map.set(identity, {
          kind: 'constant',
          name: fullName,
          identity,
          value,
          file: original.span.sourceName,
          line: original.span.line,
          scope: declarationScope(original),
          visibility: declarationVisibility(original),
          sourceUnit: original.span.sourceUnit ?? original.span.sourceName,
          ...(needsSourceQualifier(fullName, original, displayCounts)
            ? { needsSourceQualifier: true }
            : {}),
        });
      }
    }
  }
}

function baseLabelDisplayName(originalName: string, qualifiedName: string): string {
  const parts = qualifiedName.split('\0');
  const owner = parts.find((part) => part.startsWith('@'));
  return originalName.startsWith('_') && owner !== undefined
    ? `${owner.slice(1)}.${originalName}`
    : originalName;
}

function needsSourceQualifier(
  baseName: string,
  item: SourceItem,
  displayCounts: ReadonlyMap<string, number>,
): boolean {
  return (displayCounts.get(baseName) ?? 0) > 1 && declarationVisibility(item) !== 'exported';
}

function declarationIdentity(item: SourceItem, qualifiedName: string, kind: string): string {
  return `${item.span.sourceName}:${item.span.line}:${item.span.column}:${kind}:${qualifiedName.replaceAll('\0', '|')}`;
}

function declarationVisibility(item: SourceItem): 'exported' | 'source' | 'local' {
  if (item.kind === 'label' && item.name.startsWith('_')) return 'local';
  if ('isExported' in item && item.isExported === true) return 'exported';
  return 'source';
}

function declarationScope(item: SourceItem): 'global' | 'local' {
  return declarationVisibility(item) === 'local' ? 'local' : 'global';
}

async function buildD8mOptions(
  entryFile: string,
  d8Root: string,
  options: CompileNextFunctionOptions,
  symbols: readonly SymbolEntry[],
): Promise<WriteD8mOptions> {
  const main = symbols.find(
    (symbol) => symbol.kind === 'label' && symbol.name.toLowerCase() === 'main',
  );
  return {
    rootDir: normalize(d8Root),
    packageVersion: await readPackageVersion(),
    inputs: {
      entry: entryFile,
      ...(options.d8mInputs?.hex !== undefined ? { hex: options.d8mInputs.hex } : {}),
      ...(options.d8mInputs?.bin !== undefined ? { bin: options.d8mInputs.bin } : {}),
    },
    ...(main !== undefined ? { entrySymbol: main.name } : {}),
    ...(main !== undefined
      ? { entryAddress: main.kind === 'constant' ? main.value : main.address }
      : {}),
  };
}

async function readPackageVersion(): Promise<string> {
  if (cachedPackageVersion !== undefined) {
    return cachedPackageVersion;
  }

  const packageJsonCandidates = [
    new URL('../package.json', import.meta.url),
    new URL('../../package.json', import.meta.url),
    new URL('../../../package.json', import.meta.url),
  ];

  for (const candidate of packageJsonCandidates) {
    try {
      const raw = await readFile(candidate, 'utf8');
      const json = JSON.parse(raw) as { version?: string };
      if (json.version !== undefined) {
        cachedPackageVersion = json.version;
        return cachedPackageVersion;
      }
    } catch {
      // Continue searching candidates.
    }
  }

  cachedPackageVersion = '0.0.0';
  return cachedPackageVersion;
}
