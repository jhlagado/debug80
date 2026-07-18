import type { Diagnostic } from '../model/diagnostic.js';
import type { SourceItem } from '../model/source-item.js';
import type { SymbolCaseMode } from '../model/symbol.js';
import type { EmittedSourceSegment } from '../outputs/types.js';
import { buildAddressState, resolveSymbols } from './address-planning.js';
import { validateImportVisibility } from './import-visibility.js';
import {
  displaySymbolsForProgram,
  qualifyImportedPrivateLabels,
  qualifyRoutineLocalLabels,
} from './private-label-qualification.js';
import { emitProgramImage } from './program-emission.js';
import { validateDeclarationsAndRoutines } from './declaration-validation.js';

interface AssemblyResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly symbols: import('../model/symbol.js').SymbolTable;
  readonly internalSymbols: import('../model/symbol.js').SymbolTable;
  readonly assemblyItems: readonly SourceItem[];
  readonly origin: number;
  readonly initializedAddresses: readonly number[];
  readonly reservedAddresses: readonly number[];
  readonly sourceSegments: readonly EmittedSourceSegment[];
  readonly reservationSegments: readonly EmittedSourceSegment[];
  readonly bytes: Uint8Array;
}

function emptyAssemblyResult(
  diagnostics: Diagnostic[],
  partial: Partial<AssemblyResult> = {},
): AssemblyResult {
  return {
    diagnostics,
    symbols: partial.symbols ?? {},
    internalSymbols: partial.internalSymbols ?? {},
    assemblyItems: partial.assemblyItems ?? [],
    origin: partial.origin ?? 0,
    initializedAddresses: [],
    reservedAddresses: [],
    sourceSegments: [],
    reservationSegments: [],
    bytes: new Uint8Array(),
  };
}

export function assembleProgram(
  items: readonly SourceItem[],
  options: { readonly symbolCase?: SymbolCaseMode } = {},
): AssemblyResult {
  const diagnostics: Diagnostic[] = [];
  validateDeclarationsAndRoutines(items, diagnostics);
  validateImportVisibility(items, diagnostics, options.symbolCase ?? 'strict');
  if (diagnostics.length > 0) {
    return emptyAssemblyResult(diagnostics);
  }

  const assemblyItems = qualifyImportedPrivateLabels(qualifyRoutineLocalLabels(items));

  const addressState = buildAddressState(assemblyItems, diagnostics, options.symbolCase);
  if (diagnostics.length > 0) {
    return emptyAssemblyResult(diagnostics, { origin: addressState.origin, assemblyItems });
  }

  const internalSymbols = resolveSymbols(
    addressState.labels,
    addressState.equates,
    addressState.layouts,
    diagnostics,
    options.symbolCase,
  );
  const symbols = displaySymbolsForProgram(items, assemblyItems, internalSymbols);
  if (diagnostics.length > 0) {
    return emptyAssemblyResult(diagnostics, {
      symbols,
      internalSymbols,
      assemblyItems,
      origin: addressState.origin,
    });
  }

  const emitted = emitProgramImage(
    assemblyItems,
    addressState,
    internalSymbols,
    diagnostics,
    options.symbolCase,
  );
  return {
    diagnostics,
    symbols,
    internalSymbols,
    assemblyItems,
    origin: emitted.origin,
    initializedAddresses: emitted.initializedAddresses,
    reservedAddresses: emitted.reservedAddresses,
    sourceSegments: emitted.sourceSegments,
    reservationSegments: emitted.reservationSegments,
    bytes: diagnostics.length > 0 ? new Uint8Array() : emitted.bytes,
  };
}
