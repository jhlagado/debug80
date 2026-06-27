/**
 * @fileoverview Symbol index helpers for debug session symbol lookup.
 */

import {
  MappingParseResult,
  SourceAddressSpace,
  SourceMapAnchor,
  SourceMapSegment,
} from '../../mapping/types';

export interface SymbolIndex {
  anchors: SourceMapAnchor[];
  lookupAnchors: SourceMapAnchor[];
  list: Array<{ name: string; address: number }>;
}

export function buildSymbolIndex(options: {
  mapping?: MappingParseResult;
}): SymbolIndex {
  const { mapping } = options;
  const hasAnchors = mapping !== undefined && mapping.anchors.length > 0;
  const anchors = hasAnchors ? mapping.anchors : [];
  if (anchors.length === 0) {
    return { anchors: [], lookupAnchors: [], list: [] };
  }
  const sorted = [...anchors].sort(
    (a, b) => a.address - b.address || a.symbol.localeCompare(b.symbol)
  );
  const ranges = mapping ? buildSymbolRanges(mapping.segments) : [];
  const lookupAnchors =
    ranges.length > 0
      ? sorted.filter((anchor) => isAddressInRanges(anchor.address, ranges))
      : sorted;
  const list = buildSymbolList(sorted);
  return {
    anchors: sorted,
    lookupAnchors: lookupAnchors.length > 0 ? lookupAnchors : sorted,
    list,
  };
}

export function findNearestSymbol(
  address: number,
  index: Pick<SymbolIndex, 'anchors' | 'lookupAnchors'>,
  addressSpace?: SourceAddressSpace
): { name: string; address: number } | null {
  const anchors = index.lookupAnchors.length > 0 ? index.lookupAnchors : index.anchors;
  if (anchors.length === 0) {
    return null;
  }
  let candidate: SourceMapAnchor | undefined;
  let fallback: SourceMapAnchor | undefined;
  for (const anchor of anchors) {
    if (anchor.address > address) {
      break;
    }
    if (addressSpace === undefined) {
      candidate = anchor;
    } else if (addressSpacesEqual(anchor.addressSpace, addressSpace)) {
      candidate = anchor;
    } else if (anchor.addressSpace === undefined) {
      fallback = anchor;
    }
  }
  const selected = candidate ?? fallback;
  if (!selected) {
    return null;
  }
  return { name: selected.symbol, address: selected.address };
}

function addressSpacesEqual(
  actual: SourceAddressSpace | undefined,
  expected: SourceAddressSpace
): boolean {
  return actual?.kind === expected.kind && actual.physicalBank === expected.physicalBank;
}

function buildSymbolList(anchors: SourceMapAnchor[]): Array<{ name: string; address: number }> {
  const seen = new Map<string, number>();
  for (const anchor of anchors) {
    if (!seen.has(anchor.symbol)) {
      seen.set(anchor.symbol, anchor.address);
    }
  }
  return Array.from(seen.entries())
    .map(([name, address]) => ({ name, address }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildSymbolRanges(segments: SourceMapSegment[]): Array<{ start: number; end: number }> {
  const ranges = segments
    .map((segment) => ({ start: segment.start, end: segment.end }))
    .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end))
    .map((range) => (range.start <= range.end ? range : { start: range.end, end: range.start }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ start: range.start, end: range.end });
    }
  }
  return merged;
}

function isAddressInRanges(
  address: number,
  ranges: Array<{ start: number; end: number }>
): boolean {
  for (const range of ranges) {
    if (range.end === range.start) {
      if (address === range.start) {
        return true;
      }
      continue;
    }
    if (address >= range.start && address < range.end) {
      return true;
    }
  }
  return false;
}
