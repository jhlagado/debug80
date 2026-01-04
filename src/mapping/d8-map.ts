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
