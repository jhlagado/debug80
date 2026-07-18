import { getWrittenRange } from './range.js';
import type { EmittedByteMap, BinArtifact, SymbolEntry, WriteBinOptions } from './types.js';

const BIN_FROM_SYMBOL_NAME = '__azm_binfrom';
const BIN_TO_SYMBOL_NAME = '__azm_binto';

export function writeBin(
  map: EmittedByteMap,
  symbols: readonly SymbolEntry[],
  opts?: WriteBinOptions,
): BinArtifact {
  const { start: writtenStart, end: writtenEnd } = getWrittenRange(map);
  const optionStart = opts?.binFrom ?? opts?.startAddress;
  const symbolStart = symbols.find(
    (symbol) => symbol.kind === 'constant' && symbol.name === BIN_FROM_SYMBOL_NAME,
  );
  const symbolEnd = symbols.find(
    (symbol) => symbol.kind === 'constant' && symbol.name === BIN_TO_SYMBOL_NAME,
  );
  const start =
    optionStart ?? (symbolStart?.kind === 'constant' ? symbolStart.value : writtenStart);
  const end = symbolEnd?.kind === 'constant' ? symbolEnd.value + 1 : writtenEnd;
  const out = new Uint8Array(Math.max(0, end - start));

  for (let index = 0; index < out.length; index += 1) {
    out[index] = map.bytes.get(start + index) ?? 0;
  }

  return { kind: 'bin', bytes: out };
}
