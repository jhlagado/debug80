/**
 * @fileoverview Source map index and lookup utilities.
 * Provides efficient address-to-source and source-to-address resolution.
 */

import { MappingParseResult, SourceMapAnchor, SourceMapSegment } from './parser';

/**
 * Indexed source map for efficient lookups.
 */
export interface SourceMapIndex {
  /** Segments sorted by start address */
  segmentsByAddress: SourceMapSegment[];
  /** Segments indexed by file path and line number */
  segmentsByFileLine: Map<string, Map<number, SourceMapSegment[]>>;
  /** Anchors indexed by file path */
  anchorsByFile: Map<string, SourceMapAnchor[]>;
}

/**
 * Function type for resolving relative file paths to absolute paths.
 * @param file - Relative file path from the listing
 * @returns Resolved absolute path, or undefined if not found
 */
export type ResolvePathFn = (file: string) => string | undefined;

/**
 * Builds an indexed source map for efficient lookups.
 *
 * Creates multiple index structures:
 * - Segments sorted by address for address-to-source lookup
 * - Segments indexed by file and line for source-to-address lookup
 * - Anchors indexed by file for symbol lookup
 *
 * @param mapping - Parsed mapping result from listing
 * @param resolvePath - Function to resolve relative paths
 * @returns Indexed source map
 *
 * @example
 * ```typescript
 * const index = buildSourceMapIndex(mapping, (file) =>
 *   path.resolve(sourceDir, file)
 * );
 * ```
 */
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
    if (resolved === undefined || resolved.length === 0) {
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
    if (resolved === undefined || resolved.length === 0) {
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

/**
 * Finds the source map segment containing a given address.
 *
 * Performs a linear search through segments sorted by address.
 * Returns the first segment where start <= address < end.
 *
 * @param index - Source map index
 * @param address - Memory address to look up
 * @returns Matching segment, or undefined if not found
 */
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

/**
 * Resolves a source location to memory addresses.
 *
 * First attempts to find segments mapped to the exact file and line.
 * Falls back to finding the nearest anchor at or before the line.
 *
 * @param index - Source map index
 * @param filePath - Absolute path to source file
 * @param line - Line number in source file
 * @returns Array of memory addresses (may be empty)
 */
export function resolveLocation(index: SourceMapIndex, filePath: string, line: number): number[] {
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

/**
 * Finds the source line for a symbol anchor at or before an address.
 *
 * Useful for displaying the current symbol/label when stopped at an address.
 *
 * @param index - Source map index
 * @param filePath - Absolute path to source file
 * @param address - Memory address to look up
 * @returns Line number of nearest anchor, or null if not found
 */
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
