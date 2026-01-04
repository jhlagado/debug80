import { MappingParseResult, SourceMapAnchor, SourceMapSegment } from './parser';

export type D8Endianness = 'little' | 'big';

export interface D8DebugMap {
  format: 'd8-debug-map';
  version: 1;
  arch: string;
  addressWidth: number;
  endianness: D8Endianness;
  files: D8SourceFile[];
  segments: D8Segment[];
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

export interface D8Segment {
  start: number;
  end: number;
  file: string | null;
  line: number | null;
  column?: number;
  kind?: 'code' | 'data' | 'directive' | 'label' | 'macro' | 'unknown';
  confidence?: 'high' | 'medium' | 'low';
  lst?: { line: number; text: string };
  includeChain?: string[];
  macro?: { name: string; callsite: { file: string; line: number; column?: number } };
}

export interface D8Symbol {
  name: string;
  address: number;
  file?: string;
  line?: number;
  kind?: 'label' | 'constant' | 'data' | 'macro' | 'unknown';
  scope?: 'global' | 'local';
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

const CONFIDENCE_MAP: Record<SourceMapSegment['confidence'], NonNullable<D8Segment['confidence']>> =
  {
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
  };
const CONFIDENCE_FROM_D8: Record<NonNullable<D8Segment['confidence']>, SourceMapSegment['confidence']> =
  {
    high: 'HIGH',
    medium: 'MEDIUM',
    low: 'LOW',
  };
const KIND_SET = new Set<D8Segment['kind']>(['code', 'data', 'directive', 'label', 'macro', 'unknown']);
const CONFIDENCE_SET = new Set<D8Segment['confidence']>(['high', 'medium', 'low']);

export function buildD8DebugMap(
  mapping: MappingParseResult,
  options: BuildD8MapOptions
): D8DebugMap {
  const files = collectFiles(mapping);
  const segments: D8Segment[] = mapping.segments.map((segment): D8Segment => ({
    start: segment.start,
    end: segment.end,
    file: segment.loc.file,
    line: segment.loc.line,
    kind: 'unknown',
    confidence: CONFIDENCE_MAP[segment.confidence],
    lst: { line: segment.lst.line, text: segment.lst.text },
  }));
  const symbols = mapping.anchors.map(toSymbol);

  return {
    format: 'd8-debug-map',
    version: 1,
    arch: options.arch,
    addressWidth: options.addressWidth,
    endianness: options.endianness,
    files,
    segments,
    symbols,
    ...(options.generator ? { generator: options.generator } : {}),
    ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
  };
}

export function buildMappingFromD8DebugMap(map: D8DebugMap): MappingParseResult {
  const segments: SourceMapSegment[] = map.segments.map((segment) => ({
    start: segment.start,
    end: segment.end,
    loc: {
      file: segment.file ?? null,
      line: segment.line ?? null,
    },
    lst: {
      line: segment.lst?.line ?? 0,
      text: segment.lst?.text ?? '',
    },
    confidence: CONFIDENCE_FROM_D8[segment.confidence ?? 'low'],
  }));

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
    if (segment.kind !== undefined && !KIND_SET.has(segment.kind as D8Segment['kind'])) {
      return 'Segment kind is invalid.';
    }
    if (
      segment.confidence !== undefined &&
      !CONFIDENCE_SET.has(segment.confidence as D8Segment['confidence'])
    ) {
      return 'Segment confidence is invalid.';
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

function toSymbol(anchor: SourceMapAnchor): D8Symbol {
  return {
    name: anchor.symbol,
    address: anchor.address,
    file: anchor.file,
    line: anchor.line,
    kind: 'label',
    scope: 'global',
  };
}
