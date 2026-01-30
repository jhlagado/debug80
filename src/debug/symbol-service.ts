/**
 * @fileoverview Symbol index helpers for debug session symbol lookup.
 */

import { MappingParseResult, SourceMapAnchor, SourceMapSegment } from '../mapping/parser';

export interface SymbolIndex {
  anchors: SourceMapAnchor[];
  lookupAnchors: SourceMapAnchor[];
  list: Array<{ name: string; address: number }>;
}

export function buildSymbolIndex(options: {
  mapping?: MappingParseResult;
  listingContent?: string;
  sourceFile?: string;
}): SymbolIndex {
  const { mapping, listingContent, sourceFile } = options;
  const hasAnchors = mapping !== undefined && mapping.anchors.length > 0;
  const hasListing = listingContent !== undefined && listingContent.length > 0;
  const anchors = hasAnchors
    ? mapping.anchors
    : hasListing
      ? extractAnchorsFromListing(listingContent, sourceFile)
      : [];
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

export function extractAnchorsFromListing(
  listingContent: string,
  defaultFile: string | undefined
): SourceMapAnchor[] {
  const anchors: SourceMapAnchor[] = [];
  const lines = listingContent.split(/\r?\n/);
  const fallbackFile =
    typeof defaultFile === 'string' && defaultFile.length > 0 ? defaultFile : 'unknown.asm';
  const anchorLine =
    /^\s*([A-Za-z_.$][\w.$]*):\s+([0-9A-Fa-f]{4})\s+DEFINED AT LINE\s+(\d+)(?:\s+IN\s+(.+))?$/;
  for (const line of lines) {
    if (!line.includes('DEFINED AT LINE') || line.includes('USED AT LINE')) {
      continue;
    }
    const match = anchorLine.exec(line);
    if (!match) {
      continue;
    }
    const symbol = match[1];
    const addressStr = match[2];
    const lineStr = match[3];
    const fileRaw = match[4] ?? '';
    if (
      symbol === undefined ||
      addressStr === undefined ||
      lineStr === undefined ||
      symbol.length === 0 ||
      addressStr.length === 0 ||
      lineStr.length === 0
    ) {
      continue;
    }
    const address = Number.parseInt(addressStr, 16);
    const lineNumber = Number.parseInt(lineStr, 10);
    if (!Number.isFinite(lineNumber)) {
      continue;
    }
    const file = fileRaw.trim().length > 0 ? fileRaw.trim() : fallbackFile;
    anchors.push({
      symbol,
      address,
      file,
      line: lineNumber,
    });
  }
  return anchors;
}

export function findNearestSymbol(
  address: number,
  index: Pick<SymbolIndex, 'anchors' | 'lookupAnchors'>
): { name: string; address: number } | null {
  const anchors = index.lookupAnchors.length > 0 ? index.lookupAnchors : index.anchors;
  if (anchors.length === 0) {
    return null;
  }
  let candidate: SourceMapAnchor | undefined;
  for (const anchor of anchors) {
    if (anchor.address > address) {
      break;
    }
    candidate = anchor;
  }
  if (!candidate) {
    return null;
  }
  return { name: candidate.symbol, address: candidate.address };
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
