import { MappingParseResult, SourceMapAnchor, SourceMapSegment } from './parser';

export type D8Endianness = 'little' | 'big';
export type D8SegmentKind = 'code' | 'data' | 'directive' | 'label' | 'macro' | 'unknown';
export type D8Confidence = 'high' | 'medium' | 'low';
export type D8SymbolKind = 'label' | 'constant' | 'data' | 'macro' | 'unknown';
export type D8SymbolScope = 'global' | 'local';

export interface D8DebugMap {
  format: 'd8-debug-map';
  version: 1;
  arch: string;
  addressWidth: number;
  endianness: D8Endianness;
  files: Record<string, D8FileEntry>;
  lstText?: string[];
  segmentDefaults?: D8SegmentDefaults;
  symbolDefaults?: D8SymbolDefaults;
  memory?: D8MemoryLayout;
  generator?: D8Generator;
  diagnostics?: D8Diagnostics;
}

export interface D8FileEntry {
  meta?: D8FileMeta;
  segments?: D8Segment[];
  symbols?: D8Symbol[];
}

export interface D8FileMeta {
  sha256?: string;
  lineCount?: number;
}

export interface D8SegmentDefaults {
  kind?: D8SegmentKind;
  confidence?: D8Confidence;
}

export interface D8Segment {
  start: number;
  end: number;
  line?: number | null;
  column?: number;
  kind?: D8SegmentKind;
  confidence?: D8Confidence;
  lstLine: number;
  lstText?: string;
  lstTextId?: number;
  includeChain?: string[];
  macro?: { name: string; callsite: { file: string; line: number; column?: number } };
}

export interface D8SymbolDefaults {
  kind?: D8SymbolKind;
  scope?: D8SymbolScope;
}

export interface D8Symbol {
  name: string;
  address: number;
  line?: number;
  kind?: D8SymbolKind;
  scope?: D8SymbolScope;
  size?: number;
}

export interface D8MemoryLayout {
  segments: Array<{
    name: string;
    start: number;
    end: number;
    kind?: 'rom' | 'ram' | 'io' | 'banked' | 'unknown';
    bank?: number;
  }>;
}

export interface D8Generator {
  name: string;
  version?: string;
  args?: string[];
  createdAt?: string;
  inputs?: Record<string, string>;
}

export interface D8Diagnostics {
  warnings?: string[];
  errors?: string[];
}

export interface BuildD8MapOptions {
  arch: string;
  addressWidth: number;
  endianness: D8Endianness;
  generator?: D8Generator;
  diagnostics?: D8Diagnostics;
}

const CONFIDENCE_MAP: Record<SourceMapSegment['confidence'], D8Confidence> = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};
const CONFIDENCE_FROM_D8: Record<D8Confidence, SourceMapSegment['confidence']> = {
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
};
const KIND_SET = new Set<D8SegmentKind>(['code', 'data', 'directive', 'label', 'macro', 'unknown']);
const CONFIDENCE_SET = new Set<D8Confidence>(['high', 'medium', 'low']);
const SYMBOL_KIND_SET = new Set<D8SymbolKind>(['label', 'constant', 'data', 'macro', 'unknown']);
const SYMBOL_SCOPE_SET = new Set<D8SymbolScope>(['global', 'local']);
const UNKNOWN_FILE_KEY = '';

export function buildD8DebugMap(
  mapping: MappingParseResult,
  options: BuildD8MapOptions
): D8DebugMap {
  const segmentDefaults = buildSegmentDefaults(mapping);
  const symbolDefaults: D8SymbolDefaults = { kind: 'label', scope: 'global' };

  const lstText: string[] = [];
  const lstIndex = new Map<string, number>();

  const files: Record<string, D8FileEntry> = Object.create(null);

  const ensureFileEntry = (file: string | null | undefined): D8FileEntry => {
    const key = toFileKey(file);
    let entry = files[key];
    if (!entry) {
      entry = {};
      files[key] = entry;
    }
    return entry;
  };

  for (const segment of mapping.segments) {
    const entry = ensureFileEntry(segment.loc.file);
    const conf = CONFIDENCE_MAP[segment.confidence];
    const line = segment.loc.line;

    const seg: D8Segment = {
      start: segment.start,
      end: segment.end,
      lstLine: segment.lst.line,
    };

    if (line !== null && line !== undefined) {
      seg.line = line;
    }

    if (segmentDefaults.kind !== 'unknown') {
      seg.kind = 'unknown';
    }

    if (conf !== segmentDefaults.confidence) {
      seg.confidence = conf;
    }

    const text = segment.lst.text;
    let textIndex = lstIndex.get(text);
    if (textIndex === undefined) {
      textIndex = lstText.length;
      lstText.push(text);
      lstIndex.set(text, textIndex);
    }
    seg.lstTextId = textIndex;

    if (!entry.segments) {
      entry.segments = [];
    }
    entry.segments.push(seg);
  }

  for (const anchor of mapping.anchors) {
    const entry = ensureFileEntry(anchor.file);
    const symbol: D8Symbol = {
      name: anchor.symbol,
      address: anchor.address,
    };
    if (anchor.line !== undefined) {
      symbol.line = anchor.line;
    }

    if (symbolDefaults.kind && symbolDefaults.kind !== 'label') {
      symbol.kind = 'label';
    }
    if (symbolDefaults.scope && symbolDefaults.scope !== 'global') {
      symbol.scope = 'global';
    }

    if (!entry.symbols) {
      entry.symbols = [];
    }
    entry.symbols.push(symbol);
  }

  return {
    format: 'd8-debug-map',
    version: 1,
    arch: options.arch,
    addressWidth: options.addressWidth,
    endianness: options.endianness,
    files,
    lstText,
    segmentDefaults,
    symbolDefaults,
    ...(options.generator ? { generator: options.generator } : {}),
    ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
  };
}

export function buildMappingFromD8DebugMap(map: D8DebugMap): MappingParseResult {
  return buildMappingFromGroupedDebugMap(map);
}

function buildMappingFromGroupedDebugMap(map: D8DebugMap): MappingParseResult {
  const defaultConfidence = map.segmentDefaults?.confidence ?? 'low';
  const lstText = map.lstText ?? [];
  const segments: SourceMapSegment[] = [];
  const anchors: SourceMapAnchor[] = [];

  const files = map.files as Record<string, D8FileEntry>;
  for (const [fileKey, entry] of Object.entries(files)) {
    const file = fromFileKey(fileKey);
    for (const segment of entry.segments ?? []) {
      const line = segment.line ?? null;
      const confidence = segment.confidence ?? defaultConfidence;

      const lstLine = segment.lstLine;
      let lstTextValue = segment.lstText ?? '';
      if (segment.lstTextId !== undefined) {
        lstTextValue = lstText[segment.lstTextId] ?? '';
      }

      segments.push({
        start: segment.start,
        end: segment.end,
        loc: {
          file,
          line,
        },
        lst: {
          line: lstLine,
          text: lstTextValue,
        },
        confidence: CONFIDENCE_FROM_D8[confidence],
      });
    }

    if (file !== null) {
      for (const symbol of entry.symbols ?? []) {
        if (symbol.line === undefined || symbol.line === null) {
          continue;
        }
        anchors.push({
          address: symbol.address,
          symbol: symbol.name,
          file,
          line: symbol.line,
        });
      }
    }
  }

  return { segments, anchors };
}

export function parseD8DebugMap(content: string): { map?: D8DebugMap; error?: string } {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (err) {
    return { error: `Invalid JSON: ${String(err)}` };
  }

  const error = validateD8DebugMap(data);
  if (error) {
    return { error };
  }

  return { map: data as D8DebugMap };
}

function validateD8DebugMap(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return 'Expected a JSON object.';
  }
  if (value.format !== 'd8-debug-map') {
    return 'Missing or invalid format field.';
  }
  if (value.version !== 1) {
    return 'Unsupported D8 map version.';
  }
  if (typeof value.arch !== 'string' || value.arch.length === 0) {
    return 'Missing arch.';
  }
  if (!Number.isFinite(value.addressWidth)) {
    return 'Missing addressWidth.';
  }
  if (value.endianness !== 'little' && value.endianness !== 'big') {
    return 'Missing endianness.';
  }
  if (!isRecord(value.files)) {
    return 'Missing files map.';
  }

  if (value.segmentDefaults !== undefined) {
    if (!isRecord(value.segmentDefaults)) {
      return 'segmentDefaults must be an object.';
    }
    if (
      value.segmentDefaults.kind !== undefined &&
      !KIND_SET.has(value.segmentDefaults.kind as D8SegmentKind)
    ) {
      return 'segmentDefaults.kind is invalid.';
    }
    if (
      value.segmentDefaults.confidence !== undefined &&
      !CONFIDENCE_SET.has(value.segmentDefaults.confidence as D8Confidence)
    ) {
      return 'segmentDefaults.confidence is invalid.';
    }
  }

  if (value.symbolDefaults !== undefined) {
    if (!isRecord(value.symbolDefaults)) {
      return 'symbolDefaults must be an object.';
    }
    if (
      value.symbolDefaults.kind !== undefined &&
      !SYMBOL_KIND_SET.has(value.symbolDefaults.kind as D8SymbolKind)
    ) {
      return 'symbolDefaults.kind is invalid.';
    }
    if (
      value.symbolDefaults.scope !== undefined &&
      !SYMBOL_SCOPE_SET.has(value.symbolDefaults.scope as D8SymbolScope)
    ) {
      return 'symbolDefaults.scope is invalid.';
    }
  }

  if (value.lstText !== undefined && !Array.isArray(value.lstText)) {
    return 'lstText must be an array when present.';
  }

  const lstTextLength = Array.isArray(value.lstText) ? value.lstText.length : undefined;

  const validateSegment = (segment: unknown): string | undefined => {
    if (!isRecord(segment)) {
      return 'Segment entry must be an object.';
    }
    if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end)) {
      return 'Segment start/end must be numbers.';
    }
    if (segment.line !== null && segment.line !== undefined && !Number.isFinite(segment.line)) {
      return 'Segment line must be a number or null.';
    }
    if (segment.kind !== undefined && !KIND_SET.has(segment.kind as D8SegmentKind)) {
      return 'Segment kind is invalid.';
    }
    if (
      segment.confidence !== undefined &&
      !CONFIDENCE_SET.has(segment.confidence as D8Confidence)
    ) {
      return 'Segment confidence is invalid.';
    }
    if (!Number.isFinite(segment.lstLine)) {
      return 'Segment lstLine must be a number.';
    }
    if (segment.lstText !== undefined && typeof segment.lstText !== 'string') {
      return 'Segment lstText must be a string.';
    }
    const textId = segment.lstTextId;
    if (textId !== undefined && textId !== null) {
      if (!Number.isFinite(textId)) {
        return 'Segment lstTextId must be a number.';
      }
      if (lstTextLength !== undefined) {
        const idx = Number(textId);
        if (idx < 0 || idx >= lstTextLength) {
          return 'Segment lstTextId is out of range.';
        }
      }
    }
    return undefined;
  };

  const validateSymbol = (symbol: unknown): string | undefined => {
    if (!isRecord(symbol)) {
      return 'Symbol entry must be an object.';
    }
    if (typeof symbol.name !== 'string' || symbol.name.length === 0) {
      return 'Symbol name must be a string.';
    }
    if (!Number.isFinite(symbol.address)) {
      return 'Symbol address must be a number.';
    }
    if (symbol.line !== undefined && symbol.line !== null && !Number.isFinite(symbol.line)) {
      return 'Symbol line must be a number or null.';
    }
    if (symbol.kind !== undefined && !SYMBOL_KIND_SET.has(symbol.kind as D8SymbolKind)) {
      return 'Symbol kind is invalid.';
    }
    if (symbol.scope !== undefined && !SYMBOL_SCOPE_SET.has(symbol.scope as D8SymbolScope)) {
      return 'Symbol scope is invalid.';
    }
    return undefined;
  };

  for (const entry of Object.values(value.files)) {
    if (!isRecord(entry)) {
      return 'File entry must be an object.';
    }
    if (entry.meta !== undefined) {
      if (!isRecord(entry.meta)) {
        return 'File meta must be an object.';
      }
      if (entry.meta.sha256 !== undefined && typeof entry.meta.sha256 !== 'string') {
        return 'File meta sha256 must be a string.';
      }
      if (entry.meta.lineCount !== undefined && !Number.isFinite(entry.meta.lineCount)) {
        return 'File meta lineCount must be a number.';
      }
    }
    if (entry.segments !== undefined) {
      if (!Array.isArray(entry.segments)) {
        return 'File segments must be an array.';
      }
      for (const segment of entry.segments) {
        const error = validateSegment(segment);
        if (error) {
          return error;
        }
      }
    }
    if (entry.symbols !== undefined) {
      if (!Array.isArray(entry.symbols)) {
        return 'File symbols must be an array.';
      }
      for (const symbol of entry.symbols) {
        const error = validateSymbol(symbol);
        if (error) {
          return error;
        }
      }
    }
  }

  return undefined;
}

function buildSegmentDefaults(mapping: MappingParseResult): D8SegmentDefaults {
  const confidenceCounts = new Map<D8Confidence, number>();

  for (const segment of mapping.segments) {
    const conf = CONFIDENCE_MAP[segment.confidence];
    confidenceCounts.set(conf, (confidenceCounts.get(conf) ?? 0) + 1);
  }

  const confidenceDefault = pickMostCommon(confidenceCounts, mapping.segments.length, false);

  const defaults: D8SegmentDefaults = { kind: 'unknown' };
  if (confidenceDefault !== undefined) {
    defaults.confidence = confidenceDefault;
  }
  return defaults;
}

function pickMostCommon<T>(
  counts: Map<T, number>,
  total: number,
  requireMajority: boolean
): T | undefined {
  let best: T | undefined;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  if (best === undefined) {
    return undefined;
  }
  if (requireMajority && bestCount <= total / 2) {
    return undefined;
  }
  return best;
}

function toFileKey(file: string | null | undefined): string {
  return file ? file : UNKNOWN_FILE_KEY;
}

function fromFileKey(fileKey: string): string | null {
  return fileKey === UNKNOWN_FILE_KEY ? null : fileKey;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
