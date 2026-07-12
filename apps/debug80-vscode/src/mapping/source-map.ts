/**
 * @fileoverview Source map index and lookup utilities.
 * Provides efficient address-to-source and source-to-address resolution.
 */

import {
  MappingParseResult,
  SourceAddressSpace,
  SourceMapAnchor,
  SourceMapSegment,
} from './types';
import { normalizePathForKey } from '../common/path-utils';

let onSegmentWarning: ((message: string) => void) | undefined;

export function setSegmentWarningHandler(handler: ((message: string) => void) | undefined): void {
  onSegmentWarning = handler;
}

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

export type ResolvedSourceAddress = {
  address: number;
  addressSpace?: SourceAddressSpace;
};

/**
 * Function type for resolving relative file paths to absolute paths.
 * @param file - Relative file path from the debug map
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
 * @param mapping - Parsed mapping result from a D8 debug map
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
    (a, b) => a.start - b.start || a.context.line - b.context.line
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
    // Normalize path for case-insensitive matching on Windows
    const key = normalizePathForKey(resolved);
    const fileMap = segmentsByFileLine.get(key) ?? new Map<number, SourceMapSegment[]>();
    const list = fileMap.get(segment.loc.line) ?? [];
    list.push(segment);
    fileMap.set(segment.loc.line, list);
    segmentsByFileLine.set(key, fileMap);
  }

  for (const fileMap of segmentsByFileLine.values()) {
    for (const list of fileMap.values()) {
      list.sort((a, b) => a.start - b.start || a.context.line - b.context.line);
    }
  }

  const anchorsByFile = new Map<string, SourceMapAnchor[]>();
  for (const anchor of mapping.anchors) {
    const resolved = resolvePath(anchor.file);
    if (resolved === undefined || resolved.length === 0) {
      continue;
    }
    // Normalize path for case-insensitive matching on Windows
    const key = normalizePathForKey(resolved);
    const list = anchorsByFile.get(key) ?? [];
    list.push(anchor);
    anchorsByFile.set(key, list);
  }
  for (const list of anchorsByFile.values()) {
    list.sort((a, b) => a.line - b.line || a.address - b.address);
  }

  return { segmentsByAddress, segmentsByFileLine, anchorsByFile };
}

/**
 * Finds the most specific source map segment containing a given address.
 *
 * When multiple segments overlap the same address (e.g. a wide "function scope"
 * segment and a narrow per-instruction segment), the narrowest segment with a
 * valid source line (>= 1) wins.  This prevents catch-all segments with line 0
 * from shadowing fine-grained mappings.
 *
 * @param index - Source map index
 * @param address - Memory address to look up
 * @returns Matching segment, or undefined if not found
 */
export function findSegmentForAddress(
  index: SourceMapIndex,
  address: number,
  addressSpace?: SourceAddressSpace
): SourceMapSegment | undefined {
  let best: SourceMapSegment | undefined;
  let bestSpan = Infinity;
  let fallback: SourceMapSegment | undefined;
  let fallbackSpan = Infinity;

  for (const segment of index.segmentsByAddress) {
    if (address < segment.start) {
      break;
    }
    const useAsFallback = addressSpace !== undefined && segment.addressSpace === undefined;
    if (
      addressSpace !== undefined &&
      !useAsFallback &&
      !addressSpacesEqual(segment.addressSpace, addressSpace)
    ) {
      continue;
    }
    if (address >= segment.start && address < segment.end) {
      const span = segment.end - segment.start;
      if (useAsFallback) {
        if (isBetterSegment(segment, span, fallback, fallbackSpan)) {
          fallback = segment;
          fallbackSpan = span;
        }
      } else if (isBetterSegment(segment, span, best, bestSpan)) {
        best = segment;
        bestSpan = span;
      }
    }
  }

  const selected = best ?? fallback;

  if (selected !== undefined && onSegmentWarning) {
    const bestHasValidLine =
      selected.loc.line !== null && selected.loc.line !== undefined && selected.loc.line >= 1;
    if (!bestHasValidLine) {
      onSegmentWarning(
        `findSegmentForAddress(0x${address.toString(16)}): best segment ` +
          `[0x${selected.start.toString(16)}-0x${selected.end.toString(16)}] has no valid source line ` +
          `(line=${selected.loc.line ?? 'null'})`
      );
    }
  }

  return selected;
}

function addressSpacesEqual(
  actual: SourceAddressSpace | undefined,
  expected: SourceAddressSpace
): boolean {
  return actual?.kind === expected.kind && actual.physicalBank === expected.physicalBank;
}

function isBetterSegment(
  candidate: SourceMapSegment,
  candidateSpan: number,
  current: SourceMapSegment | undefined,
  currentSpan: number
): boolean {
  if (current === undefined) {
    return true;
  }
  const candidateHasValidLine =
    candidate.loc.line !== null && candidate.loc.line !== undefined && candidate.loc.line >= 1;
  const currentHasValidLine =
    current.loc.line !== null && current.loc.line !== undefined && current.loc.line >= 1;
  return (
    (candidateHasValidLine && !currentHasValidLine) ||
    (candidateHasValidLine === currentHasValidLine && candidateSpan < currentSpan)
  );
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
  return resolveLocationTargets(index, filePath, line, false).map((target) => target.address);
}

/**
 * Resolves a source location to executable memory addresses only.
 *
 * Zero-width segments represent labels, constants, and assembler directives in
 * debug maps. They are useful for stack display context but must not become
 * active breakpoints.
 */
export function resolveExecutableLocation(
  index: SourceMapIndex,
  filePath: string,
  line: number
): number[] {
  return resolveExecutableLocationTargets(index, filePath, line).map((target) => target.address);
}

export function resolveExecutableLocationTargets(
  index: SourceMapIndex,
  filePath: string,
  line: number
): ResolvedSourceAddress[] {
  return resolveLocationTargets(index, filePath, line, true);
}

function resolveLocationTargets(
  index: SourceMapIndex,
  filePath: string,
  line: number,
  executableOnly: boolean
): ResolvedSourceAddress[] {
  // Normalize path for case-insensitive matching on Windows
  const key = normalizePathForKey(filePath);
  const fileMap = index.segmentsByFileLine.get(key);
  if (fileMap) {
    const lineSlop = [0, -1, 1, -2, 2, -3, 3, -4, 4];
    for (const delta of lineSlop) {
      const tryLine = line + delta;
      if (tryLine < 1) {
        continue;
      }
      const segments = fileMap.get(tryLine);
      if (segments && segments.length > 0) {
        const filtered = executableOnly ? segments.filter((seg) => seg.end > seg.start) : segments;
        if (filtered.length > 0) {
          return filtered.map((seg) => ({
            address: seg.start,
            ...(seg.addressSpace !== undefined ? { addressSpace: seg.addressSpace } : {}),
          }));
        }
      }
    }
  }

  if (executableOnly) {
    return [];
  }

  const anchors = index.anchorsByFile.get(key);
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
  return candidate
    ? [
        {
          address: candidate.address,
          ...(candidate.addressSpace !== undefined ? { addressSpace: candidate.addressSpace } : {}),
        },
      ]
    : [];
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
  // Normalize path for case-insensitive matching on Windows
  const key = normalizePathForKey(filePath);
  const anchors = index.anchorsByFile.get(key);
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
