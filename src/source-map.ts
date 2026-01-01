import { MappingParseResult, SourceMapAnchor, SourceMapSegment } from './mapping-parser';

export interface SourceMapIndex {
  segmentsByAddress: SourceMapSegment[];
  segmentsByFileLine: Map<string, Map<number, SourceMapSegment[]>>;
  anchorsByFile: Map<string, SourceMapAnchor[]>;
}

export type ResolvePathFn = (file: string) => string | undefined;

export function buildSourceMapIndex(
  mapping: MappingParseResult,
  resolvePath: ResolvePathFn
): SourceMapIndex {
  const segmentsByAddress = [...mapping.segments].sort(
    (a, b) => a.start - b.start || a.lst.line - b.lst.line
  );

  const segmentsByFileLine = new Map<string, Map<number, SourceMapSegment[]>>();
  for (const segment of mapping.segments) {
    if (segment.loc.file === null || segment.loc.line === null) {
      continue;
    }
    const resolved = resolvePath(segment.loc.file);
    if (!resolved) {
      continue;
    }
    const fileMap = segmentsByFileLine.get(resolved) ?? new Map<number, SourceMapSegment[]>();
    const list = fileMap.get(segment.loc.line) ?? [];
    list.push(segment);
    fileMap.set(segment.loc.line, list);
    segmentsByFileLine.set(resolved, fileMap);
  }

  for (const fileMap of segmentsByFileLine.values()) {
    for (const list of fileMap.values()) {
      list.sort((a, b) => a.start - b.start || a.lst.line - b.lst.line);
    }
  }

  const anchorsByFile = new Map<string, SourceMapAnchor[]>();
  for (const anchor of mapping.anchors) {
    const resolved = resolvePath(anchor.file);
    if (!resolved) {
      continue;
    }
    const list = anchorsByFile.get(resolved) ?? [];
    list.push(anchor);
    anchorsByFile.set(resolved, list);
  }
  for (const list of anchorsByFile.values()) {
    list.sort((a, b) => a.line - b.line || a.address - b.address);
  }

  return { segmentsByAddress, segmentsByFileLine, anchorsByFile };
}

export function findSegmentForAddress(
  index: SourceMapIndex,
  address: number
): SourceMapSegment | undefined {
  for (const segment of index.segmentsByAddress) {
    if (address < segment.start) {
      break;
    }
    if (address >= segment.start && address < segment.end) {
      return segment;
    }
  }
  return undefined;
}

export function resolveLocation(
  index: SourceMapIndex,
  filePath: string,
  line: number
): number[] {
  const fileMap = index.segmentsByFileLine.get(filePath);
  if (fileMap) {
    const segments = fileMap.get(line);
    if (segments && segments.length > 0) {
      return segments.map((seg) => seg.start);
    }
  }

  const anchors = index.anchorsByFile.get(filePath);
  if (!anchors || anchors.length === 0) {
    return [];
  }
  let candidate: SourceMapAnchor | undefined;
  for (const anchor of anchors) {
    if (anchor.line > line) {
      break;
    }
    candidate = anchor;
  }
  return candidate ? [candidate.address] : [];
}

export function findAnchorLine(
  index: SourceMapIndex,
  filePath: string,
  address: number
): number | null {
  const anchors = index.anchorsByFile.get(filePath);
  if (!anchors || anchors.length === 0) {
    return null;
  }
  let candidate: SourceMapAnchor | undefined;
  for (const anchor of anchors) {
    if (anchor.address > address) {
      break;
    }
    candidate = anchor;
  }
  return candidate?.line ?? null;
}
