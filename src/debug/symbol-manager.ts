/**
 * @fileoverview Symbol management for the Z80 debug adapter.
 * Handles symbol extraction, indexing, and lookup.
 */

import { SourceMapAnchor, SourceMapSegment } from '../mapping/parser';
import { MappingParseResult } from '../mapping/parser';

/**
 * Simple symbol representation with name and address.
 */
export interface DebugSymbol {
  name: string;
  address: number;
}

/**
 * Manages symbols for the debug session.
 */
export class SymbolManager {
  /** All symbol anchors sorted by address */
  private symbolAnchors: SourceMapAnchor[] = [];

  /** Symbol anchors filtered to valid ranges for lookup */
  private symbolLookupAnchors: SourceMapAnchor[] = [];

  /** List of unique symbols sorted by name */
  private symbolList: DebugSymbol[] = [];

  /**
   * Gets all symbol anchors.
   *
   * @returns Array of symbol anchors
   */
  public getAnchors(): SourceMapAnchor[] {
    return this.symbolAnchors;
  }

  /**
   * Gets the lookup anchors (filtered for valid ranges).
   *
   * @returns Array of symbol anchors for lookup
   */
  public getLookupAnchors(): SourceMapAnchor[] {
    return this.symbolLookupAnchors;
  }

  /**
   * Gets the list of unique symbols.
   *
   * @returns Array of symbols
   */
  public getSymbolList(): DebugSymbol[] {
    return this.symbolList;
  }

  /**
   * Clears all symbol data.
   */
  public clear(): void {
    this.symbolAnchors = [];
    this.symbolLookupAnchors = [];
    this.symbolList = [];
  }

  /**
   * Rebuilds the symbol index from mapping and/or listing content.
   *
   * @param mapping - Mapping parse result (optional)
   * @param listingContent - Raw listing file content (optional)
   * @param defaultSourceFile - Default source file for extracted anchors
   */
  public rebuild(
    mapping: MappingParseResult | undefined,
    listingContent?: string,
    defaultSourceFile?: string
  ): void {
    const hasAnchors = mapping !== undefined && mapping.anchors.length > 0;
    const hasListing = listingContent !== undefined && listingContent.length > 0;

    const anchors = hasAnchors
      ? mapping.anchors
      : hasListing
        ? this.extractAnchorsFromListing(listingContent, defaultSourceFile)
        : [];

    if (anchors.length === 0) {
      this.clear();
      return;
    }

    // Sort by address, then symbol name
    const sorted = [...anchors].sort(
      (a, b) => a.address - b.address || a.symbol.localeCompare(b.symbol)
    );
    this.symbolAnchors = sorted;

    // Build ranges from mapping segments for filtering
    const ranges = mapping ? this.buildSymbolRanges(mapping.segments) : [];
    const lookupAnchors =
      ranges.length > 0
        ? sorted.filter((anchor) => this.isAddressInRanges(anchor.address, ranges))
        : sorted;
    this.symbolLookupAnchors = lookupAnchors.length > 0 ? lookupAnchors : sorted;

    // Build unique symbol list
    const seen = new Map<string, number>();
    for (const anchor of sorted) {
      if (!seen.has(anchor.symbol)) {
        seen.set(anchor.symbol, anchor.address);
      }
    }
    this.symbolList = Array.from(seen.entries())
      .map(([name, address]) => ({ name, address }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Finds the nearest symbol at or before an address.
   *
   * @param address - The address to look up
   * @returns The nearest symbol, or null if none found
   */
  public findNearestSymbol(address: number): DebugSymbol | null {
    const anchors =
      this.symbolLookupAnchors.length > 0
        ? this.symbolLookupAnchors
        : this.symbolAnchors;

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

  /**
   * Extracts symbol anchors from listing file content.
   *
   * @param listingContent - Raw listing file content
   * @param defaultFile - Default file name for symbols without explicit file
   * @returns Array of extracted symbol anchors
   */
  private extractAnchorsFromListing(
    listingContent: string,
    defaultFile: string | undefined
  ): SourceMapAnchor[] {
    const anchors: SourceMapAnchor[] = [];
    const lines = listingContent.split(/\r?\n/);
    const fallbackFile =
      typeof defaultFile === 'string' && defaultFile.length > 0
        ? defaultFile
        : 'unknown.asm';

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

  /**
   * Builds merged address ranges from mapping segments.
   *
   * @param segments - Source map segments
   * @returns Merged address ranges
   */
  private buildSymbolRanges(
    segments: SourceMapSegment[]
  ): Array<{ start: number; end: number }> {
    const ranges = segments
      .map((segment) => ({ start: segment.start, end: segment.end }))
      .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end))
      .map((range) =>
        range.start <= range.end ? range : { start: range.end, end: range.start }
      )
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

  /**
   * Checks if an address falls within any of the given ranges.
   *
   * @param address - The address to check
   * @param ranges - Array of address ranges
   * @returns True if the address is in any range
   */
  private isAddressInRanges(
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
}
