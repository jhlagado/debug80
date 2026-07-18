import { symbolDisplayName } from './d8-helpers.js';
import type {
  EmittedByteMap,
  EmittedSourceSegment,
  LstArtifact,
  SymbolEntry,
  WriteLstOptions,
} from './types.js';

/** Byte tokens start at column 7: 4-hex-digit address plus three spaces. */
const ADDRESS_GUTTER = 3;
/** Source text starts at column 20 when the byte gutter fits before it. */
const SOURCE_COLUMN = 20;
/** Bytes per listing row; longer runs wrap onto source-less continuation rows. */
const MAX_ROW_BYTES = 8;
/** Symbol trailer pads names to 12 columns, as asm80 does. */
const SYMBOL_NAME_PAD = 12;

interface ByteRange {
  start: number;
  end: number;
}

/**
 * Renders an asm80-style listing: each source line in expansion order with an
 * address/byte gutter, followed by a symbol table trailer.
 */
export function writeLst(
  map: EmittedByteMap,
  symbols: readonly SymbolEntry[],
  opts: WriteLstOptions,
): LstArtifact {
  const lines: string[] = [];
  const segmentRanges = rangesByLine(map.sourceSegments ?? []);
  const reservationRanges = rangesByLine(opts.reservationSegments ?? []);
  const fileLineCache = new Map<string, readonly string[]>();
  const cursors = new Map<string, number>();
  const printedGutters = new Set<string>();

  const fileLines = (file: string): readonly string[] => {
    let cached = fileLineCache.get(file);
    if (cached === undefined) {
      cached = splitLines(opts.sourceTexts.get(file) ?? '');
      fileLineCache.set(file, cached);
    }
    return cached;
  };

  const printLine = (file: string, line: number, text: string): void => {
    const key = lineKey(file, line);
    if (printedGutters.has(key)) {
      lines.push(sourceOnlyRow(text));
      return;
    }
    printedGutters.add(key);
    const ranges = segmentRanges.get(key);
    if (ranges !== undefined) {
      lines.push(...emittingRows(map, ranges, text));
      return;
    }
    const reserved = reservationRanges.get(key);
    if (reserved?.[0] !== undefined) {
      lines.push(addressOnlyRow(reserved[0].start, text));
      return;
    }
    lines.push(sourceOnlyRow(text));
  };

  for (const logical of opts.logicalLines) {
    const cursor = cursors.get(logical.sourceName) ?? 0;
    // Lines swallowed by the expander (`.include`/`.import` directives) show
    // up as gaps in a file's line numbering; print them from the raw text.
    for (let line = cursor + 1; line < logical.line; line += 1) {
      lines.push(sourceOnlyRow(fileLines(logical.sourceName)[line - 1] ?? ''));
    }
    printLine(logical.sourceName, logical.line, logical.text);
    cursors.set(logical.sourceName, logical.line);
  }

  for (const file of opts.sourceTexts.keys()) {
    const all = fileLines(file);
    for (let line = (cursors.get(file) ?? 0) + 1; line <= all.length; line += 1) {
      lines.push(sourceOnlyRow(all[line - 1] ?? ''));
    }
  }

  lines.push('');
  lines.push(...symbolTrailerRows(symbols, opts.rootDir));
  return { kind: 'lst', text: `${lines.join('\n')}\n` };
}

function lineKey(file: string, line: number): string {
  return `${file}\0${line}`;
}

/** Groups segments by (file, line) and merges adjacent/overlapping ranges. */
function rangesByLine(
  segments: readonly EmittedSourceSegment[],
): ReadonlyMap<string, readonly ByteRange[]> {
  const byLine = new Map<string, ByteRange[]>();
  for (const segment of segments) {
    const key = lineKey(segment.file, segment.line);
    const list = byLine.get(key) ?? [];
    list.push({ start: segment.start, end: segment.end });
    byLine.set(key, list);
  }
  for (const list of byLine.values()) {
    list.sort((a, b) => a.start - b.start);
    let index = 1;
    while (index < list.length) {
      const previous = list[index - 1]!;
      const current = list[index]!;
      if (current.start <= previous.end) {
        previous.end = Math.max(previous.end, current.end);
        list.splice(index, 1);
      } else {
        index += 1;
      }
    }
  }
  return byLine;
}

function emittingRows(
  map: EmittedByteMap,
  ranges: readonly ByteRange[],
  text: string,
): string[] {
  const rows: string[] = [];
  for (const range of ranges) {
    for (let start = range.start; start < range.end; start += MAX_ROW_BYTES) {
      const end = Math.min(start + MAX_ROW_BYTES, range.end);
      const tokens: string[] = [];
      for (let address = start; address < end; address += 1) {
        const byte = map.bytes.get(address);
        tokens.push(byte === undefined ? '??' : toHex2(byte));
      }
      rows.push(gutterRow(start, tokens, rows.length === 0 ? text : ''));
    }
  }
  return rows;
}

function gutterRow(address: number, tokens: readonly string[], text: string): string {
  const gutter = `${toHex4(address)}${' '.repeat(ADDRESS_GUTTER)}${tokens.join(' ')}`;
  const lead = tokens.length <= 4 ? gutter.padEnd(SOURCE_COLUMN) : `${gutter}  `;
  return trimEnd(lead + text);
}

function addressOnlyRow(address: number, text: string): string {
  return trimEnd(toHex4(address).padEnd(SOURCE_COLUMN) + text);
}

function sourceOnlyRow(text: string): string {
  return trimEnd(' '.repeat(SOURCE_COLUMN) + text);
}

function symbolTrailerRows(symbols: readonly SymbolEntry[], rootDir?: string): string[] {
  return symbols
    .map((symbol) => ({
      name: symbolDisplayName(symbol, rootDir),
      value: symbol.kind === 'constant' ? symbol.value : symbol.address,
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((entry) => `${padSymbolName(entry.name)}${toHex4(entry.value)}`);
}

function padSymbolName(name: string): string {
  return name.length < SYMBOL_NAME_PAD ? name.padEnd(SYMBOL_NAME_PAD) : `${name} `;
}

function splitLines(text: string): readonly string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const body = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  return body === '' ? [] : body.split('\n');
}

function trimEnd(value: string): string {
  return value.replace(/\s+$/, '');
}

function toHex2(value: number): string {
  return (value & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

function toHex4(value: number): string {
  return (value & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}
