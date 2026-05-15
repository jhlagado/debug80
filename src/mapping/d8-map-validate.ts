import type { D8Confidence, D8SegmentKind, D8SymbolKind, D8SymbolScope } from './d8-map';

const KIND_SET = new Set<D8SegmentKind>(['code', 'data', 'directive', 'label', 'macro', 'unknown']);
const CONFIDENCE_SET = new Set<D8Confidence>(['high', 'medium', 'low']);
const SYMBOL_KIND_SET = new Set<D8SymbolKind>(['label', 'constant', 'data', 'macro', 'unknown']);
const SYMBOL_SCOPE_SET = new Set<D8SymbolScope>(['global', 'local']);

export function validateD8DebugMap(value: unknown): string | undefined {
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
        if (error !== undefined && error.length > 0) {
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
        if (error !== undefined && error.length > 0) {
          return error;
        }
      }
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
