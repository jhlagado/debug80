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
  files: D8SourceFile[];
  lstText?: string[];
  segmentDefaults?: D8SegmentDefaults;
  segments: D8Segment[];
  symbolDefaults?: D8SymbolDefaults;
  symbols?: D8Symbol[];
  memory?: D8MemoryLayout;
  generator?: D8Generator;
  diagnostics?: D8Diagnostics;
}

export interface D8SourceFile {
  path: string;
  sha256?: string;
  lineCount?: number;
}

export interface D8SegmentDefaults {
  file?: string;
  kind?: D8SegmentKind;
  confidence?: D8Confidence;
}

export interface D8Segment {
  start: number;
  end: number;
  file?: string | null;
  line?: number | null;
  column?: number;
  kind?: D8SegmentKind;
  confidence?: D8Confidence;
  lst?: { line: number; text?: string; textId?: number };
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
  file?: string;
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

export function buildD8DebugMap(
  mapping: MappingParseResult,
  options: BuildD8MapOptions
): D8DebugMap {
  const files = collectFiles(mapping);
  const segmentDefaults = buildSegmentDefaults(mapping);
  const symbolDefaults: D8SymbolDefaults = { kind: 'label', scope: 'global' };

  const lstText: string[] = [];
  const lstIndex = new Map<string, number>();

  const segments: D8Segment[] = mapping.segments.map((segment) => {
    const conf = CONFIDENCE_MAP[segment.confidence];
    const file = segment.loc.file;
    const line = segment.loc.line;

    const seg: D8Segment = {
      start: segment.start,
      end: segment.end,
      lst: { line: segment.lst.line },
    };

    if (file === null) {
      seg.file = null;
    } else if (file !== undefined && file !== segmentDefaults.file) {
      seg.file = file;
    }

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
    if (seg.lst) {
      seg.lst.textId = textIndex;
    }

    return seg;
  });

  const symbols = mapping.anchors.map((anchor) => {
    const symbol: D8Symbol = {
      name: anchor.symbol,
      address: anchor.address,
      file: anchor.file,
      line: anchor.line,
    };

    if (symbolDefaults.kind && symbolDefaults.kind !== 'label') {
      symbol.kind = 'label';
    }
    if (symbolDefaults.scope && symbolDefaults.scope !== 'global') {
      symbol.scope = 'global';
    }

    return symbol;
  });

  return {
    format: 'd8-debug-map',
    version: 1,
    arch: options.arch,
    addressWidth: options.addressWidth,
    endianness: options.endianness,
    files,
    lstText,
    segmentDefaults,
    segments,
    symbolDefaults,
    symbols,
    ...(options.generator ? { generator: options.generator } : {}),
    ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
  };
}

export function buildMappingFromD8DebugMap(map: D8DebugMap): MappingParseResult {
  const defaults = map.segmentDefaults ?? {};
  const defaultFile = defaults.file;
  const defaultConfidence = defaults.confidence ?? 'low';
  const lstText = map.lstText ?? [];

  const segments: SourceMapSegment[] = map.segments.map((segment) => {
    let file: string | null = null;
    if (segment.file === undefined) {
      file = defaultFile ?? null;
    } else {
      file = segment.file;
    }

    const line = segment.line ?? null;
    const confidence = segment.confidence ?? defaultConfidence;

    let lstLine = 0;
    let lstTextValue = '';
    if (segment.lst) {
      lstLine = segment.lst.line;
      if (segment.lst.text !== undefined) {
        lstTextValue = segment.lst.text;
      } else if (segment.lst.textId !== undefined) {
        lstTextValue = lstText[segment.lst.textId] ?? '';
      }
    }

    return {
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
    };
  });

  const anchors: SourceMapAnchor[] = (map.symbols ?? [])
    .filter((symbol) => symbol.file !== undefined && symbol.line !== undefined)
    .map((symbol) => ({
      address: symbol.address,
      symbol: symbol.name,
      file: symbol.file as string,
      line: symbol.line as number,
    }));

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
  if (!Array.isArray(value.files)) {
    return 'Missing files array.';
  }
  if (!Array.isArray(value.segments)) {
    return 'Missing segments array.';
  }

  if (value.segmentDefaults !== undefined) {
    if (!isRecord(value.segmentDefaults)) {
      return 'segmentDefaults must be an object.';
    }
    if (
      value.segmentDefaults.file !== undefined &&
      typeof value.segmentDefaults.file !== 'string'
    ) {
      return 'segmentDefaults.file must be a string.';
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

  for (const segment of value.segments) {
    if (!isRecord(segment)) {
      return 'Segment entry must be an object.';
    }
    if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end)) {
      return 'Segment start/end must be numbers.';
    }
    if (segment.file !== null && segment.file !== undefined && typeof segment.file !== 'string') {
      return 'Segment file must be a string or null.';
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
    if (segment.lst !== undefined) {
      if (!isRecord(segment.lst)) {
        return 'Segment lst must be an object.';
      }
      if (!Number.isFinite(segment.lst.line)) {
        return 'Segment lst.line must be a number.';
      }
      if (segment.lst.text !== undefined && typeof segment.lst.text !== 'string') {
        return 'Segment lst.text must be a string.';
      }
      const lst = segment.lst as Record<string, unknown>;
      const textId = lst.textId;
      if (textId !== undefined && textId !== null) {
        if (!Number.isFinite(textId)) {
          return 'Segment lst.textId must be a number.';
        }
        const idx = Number(textId);
        if (Array.isArray(value.lstText)) {
          if (idx < 0 || idx >= value.lstText.length) {
            return 'Segment lst.textId is out of range.';
          }
        }
      }
    }
  }

  return undefined;
}

function buildSegmentDefaults(mapping: MappingParseResult): D8SegmentDefaults {
  const fileCounts = new Map<string, number>();
  const confidenceCounts = new Map<D8Confidence, number>();

  for (const segment of mapping.segments) {
    if (segment.loc.file) {
      fileCounts.set(segment.loc.file, (fileCounts.get(segment.loc.file) ?? 0) + 1);
    }
    const conf = CONFIDENCE_MAP[segment.confidence];
    confidenceCounts.set(conf, (confidenceCounts.get(conf) ?? 0) + 1);
  }

  const fileDefault = pickMostCommon(fileCounts, mapping.segments.length, true);
  const confidenceDefault = pickMostCommon(confidenceCounts, mapping.segments.length, false);

  const defaults: D8SegmentDefaults = { kind: 'unknown' };
  if (fileDefault !== undefined) {
    defaults.file = fileDefault;
  }
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

function collectFiles(mapping: MappingParseResult): D8SourceFile[] {
  const seen = new Set<string>();
  const files: D8SourceFile[] = [];

  const add = (file: string | null | undefined): void => {
    if (!file || seen.has(file)) {
      return;
    }
    seen.add(file);
    files.push({ path: file });
  };

  for (const anchor of mapping.anchors) {
    add(anchor.file);
  }
  for (const segment of mapping.segments) {
    add(segment.loc.file);
  }

  return files;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
