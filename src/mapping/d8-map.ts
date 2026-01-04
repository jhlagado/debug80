import { MappingParseResult, SourceMapAnchor, SourceMapSegment } from './parser';

export type D8Endianness = 'little' | 'big';
export type D8SegmentKind = 'code' | 'data' | 'directive' | 'label' | 'macro' | 'unknown';
export type D8Confidence = 'high' | 'medium' | 'low';

export interface D8DebugMapV1 {
  format: 'd8-debug-map';
  version: 1;
  arch: string;
  addressWidth: number;
  endianness: D8Endianness;
  files: D8SourceFile[];
  segments: D8SegmentRow[];
  symbols?: D8Symbol[];
  memory?: D8MemoryLayout;
  generator?: D8Generator;
  diagnostics?: D8Diagnostics;
}

export interface D8DebugMapV2 {
  format: 'd8-debug-map';
  version: 2;
  arch: string;
  addressWidth: number;
  endianness: D8Endianness;
  files: D8SourceFile[];
  lstText?: string[];
  segments: D8SegmentColumns;
  symbols?: D8Symbol[];
  memory?: D8MemoryLayout;
  generator?: D8Generator;
  diagnostics?: D8Diagnostics;
}

export type D8DebugMap = D8DebugMapV1 | D8DebugMapV2;

export interface D8SourceFile {
  path: string;
  sha256?: string;
  lineCount?: number;
}

export interface D8SegmentRow {
  start: number;
  end: number;
  file: string | null;
  line: number | null;
  column?: number;
  kind?: D8SegmentKind;
  confidence?: D8Confidence;
  lst?: { line: number; text: string };
  includeChain?: string[];
  macro?: { name: string; callsite: { file: string; line: number; column?: number } };
}

export interface D8SegmentColumns {
  start: number[];
  end: number[];
  file: Array<number | null>;
  line: Array<number | null>;
  column?: Array<number | null>;
  kind?: Array<D8SegmentKind | null>;
  confidence?: Array<D8Confidence | null>;
  lstLine?: Array<number | null>;
  lstText?: Array<number | null>;
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

const CONFIDENCE_MAP: Record<SourceMapSegment['confidence'], NonNullable<D8Confidence>> = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};
const CONFIDENCE_FROM_D8: Record<NonNullable<D8Confidence>, SourceMapSegment['confidence']> = {
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
};
const KIND_SET = new Set<D8SegmentKind>(['code', 'data', 'directive', 'label', 'macro', 'unknown']);
const CONFIDENCE_SET = new Set<D8Confidence>(['high', 'medium', 'low']);

export function buildD8DebugMap(
  mapping: MappingParseResult,
  options: BuildD8MapOptions
): D8DebugMapV2 {
  const files = collectFiles(mapping);
  const fileIndex = new Map<string, number>();
  files.forEach((file, index) => {
    fileIndex.set(file.path, index);
  });

  const lstText: string[] = [];
  const lstIndex = new Map<string, number>();

  const segments: D8SegmentColumns = {
    start: [],
    end: [],
    file: [],
    line: [],
    kind: [],
    confidence: [],
    lstLine: [],
    lstText: [],
  };

  for (const segment of mapping.segments) {
    segments.start.push(segment.start);
    segments.end.push(segment.end);

    if (segment.loc.file) {
      const idx = fileIndex.get(segment.loc.file);
      segments.file.push(idx ?? null);
    } else {
      segments.file.push(null);
    }
    segments.line.push(segment.loc.line ?? null);
    segments.kind?.push('unknown');
    segments.confidence?.push(CONFIDENCE_MAP[segment.confidence]);
    segments.lstLine?.push(segment.lst.line);

    const text = segment.lst.text;
    let textIndex = lstIndex.get(text);
    if (textIndex === undefined) {
      textIndex = lstText.length;
      lstText.push(text);
      lstIndex.set(text, textIndex);
    }
    segments.lstText?.push(textIndex);
  }
  const symbols = mapping.anchors.map(toSymbol);

  return {
    format: 'd8-debug-map',
    version: 2,
    arch: options.arch,
    addressWidth: options.addressWidth,
    endianness: options.endianness,
    files,
    lstText,
    segments,
    symbols,
    ...(options.generator ? { generator: options.generator } : {}),
    ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
  };
}

export function buildMappingFromD8DebugMap(map: D8DebugMap): MappingParseResult {
  if (map.version === 2) {
    return buildMappingFromV2(map);
  }
  return buildMappingFromV1(map);
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
  if (value.version !== 1 && value.version !== 2) {
    return 'Unsupported D8 map version.';
  }
  if (value.version === 1) {
    return validateD8DebugMapV1(value);
  }
  return validateD8DebugMapV2(value);
}

function validateD8DebugMapV1(value: Record<string, unknown>): string | undefined {
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
    if (segment.kind !== undefined && !KIND_SET.has(segment.kind as D8SegmentKind)) {
      return 'Segment kind is invalid.';
    }
    if (
      segment.confidence !== undefined &&
      !CONFIDENCE_SET.has(segment.confidence as D8Confidence)
    ) {
      return 'Segment confidence is invalid.';
    }
  }
  return undefined;
}

function validateD8DebugMapV2(value: Record<string, unknown>): string | undefined {
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
  if (value.lstText !== undefined && !Array.isArray(value.lstText)) {
    return 'lstText must be an array when present.';
  }
  if (!isRecord(value.segments)) {
    return 'Missing segments object.';
  }

  const segments = value.segments as unknown as D8SegmentColumns;
  if (!Array.isArray(segments.start) || !Array.isArray(segments.end)) {
    return 'segments.start/end must be arrays.';
  }
  if (!Array.isArray(segments.file) || !Array.isArray(segments.line)) {
    return 'segments.file/line must be arrays.';
  }

  const count = segments.start.length;
  if (segments.end.length !== count || segments.file.length !== count || segments.line.length !== count) {
    return 'segments arrays must be the same length.';
  }

  const optionalArrays: Array<[string, unknown]> = [
    ['column', segments.column],
    ['kind', segments.kind],
    ['confidence', segments.confidence],
    ['lstLine', segments.lstLine],
    ['lstText', segments.lstText],
  ];

  for (const [name, valueArr] of optionalArrays) {
    if (valueArr === undefined) {
      continue;
    }
    if (!Array.isArray(valueArr)) {
      return `segments.${name} must be an array.`;
    }
    if (valueArr.length !== count) {
      return `segments.${name} length must match segments.start.`;
    }
  }

  const filesCount = value.files.length;
  for (let i = 0; i < count; i += 1) {
    const start = segments.start[i];
    const end = segments.end[i];
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return 'segments.start/end entries must be numbers.';
    }
    const fileIdx = segments.file[i];
    if (fileIdx !== null && fileIdx !== undefined) {
      if (!Number.isFinite(fileIdx) || fileIdx < 0 || fileIdx >= filesCount) {
        return 'segments.file contains invalid file index.';
      }
    }
    const line = segments.line[i];
    if (line !== null && line !== undefined && !Number.isFinite(line)) {
      return 'segments.line entries must be numbers or null.';
    }
    if (segments.kind) {
      const kind = segments.kind[i];
      if (kind !== null && kind !== undefined && !KIND_SET.has(kind as D8SegmentKind)) {
        return 'segments.kind contains invalid entry.';
      }
    }
    if (segments.confidence) {
      const conf = segments.confidence[i];
      if (conf !== null && conf !== undefined && !CONFIDENCE_SET.has(conf as D8Confidence)) {
        return 'segments.confidence contains invalid entry.';
      }
    }
  }

  if (segments.lstText && value.lstText) {
    const textCount = value.lstText.length;
    for (const entry of segments.lstText as Array<number | null>) {
      if (entry === null || entry === undefined) {
        continue;
      }
      if (!Number.isFinite(entry) || entry < 0 || entry >= textCount) {
        return 'segments.lstText contains invalid index.';
      }
    }
  }

  return undefined;
}

function buildMappingFromV1(map: D8DebugMapV1): MappingParseResult {
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

function buildMappingFromV2(map: D8DebugMapV2): MappingParseResult {
  const filePaths = map.files.map((file) => file.path);
  const segments: SourceMapSegment[] = [];
  const count = map.segments.start.length;
  for (let i = 0; i < count; i += 1) {
    const start = map.segments.start[i];
    const end = map.segments.end[i];
    if (start === undefined || end === undefined) {
      continue;
    }
    const fileIdx = map.segments.file[i];
    const file = fileIdx !== null && fileIdx !== undefined ? filePaths[fileIdx] ?? null : null;
    const line = map.segments.line[i] ?? null;
    const lstLine = map.segments.lstLine?.[i] ?? 0;
    const textIdx = map.segments.lstText?.[i];
    const lstText =
      textIdx !== null && textIdx !== undefined
        ? map.lstText?.[textIdx] ?? ''
        : '';
    const confidence = map.segments.confidence?.[i] ?? 'low';

    segments.push({
      start,
      end,
      loc: { file, line },
      lst: { line: lstLine, text: lstText },
      confidence: CONFIDENCE_FROM_D8[confidence ?? 'low'],
    });
  }

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
