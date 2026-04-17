/**
 * @fileoverview Breakpoint state and resolution helpers for the debug adapter.
 */

import { DebugProtocol } from '@vscode/debugprotocol';
import * as path from 'path';
import type { ListingInfo } from '../z80/loaders';
import type { SourceMapIndex } from '../mapping/source-map';
import { resolveLocation } from '../mapping/source-map';
import { pathsEqual } from './path-utils';

type SourceBreakpointResolution = {
  addresses: number[];
  verified: boolean;
};

interface SourceBreakpointResolver {
  matches(sourcePath: string, listingPath: string): boolean;
  resolve(
    listing: ListingInfo,
    mappingIndex: SourceMapIndex | undefined,
    sourcePath: string,
    line: number
  ): SourceBreakpointResolution;
  continueOnEmpty: boolean;
}

export class BreakpointManager {
  private readonly pendingBySource = new Map<string, DebugProtocol.SourceBreakpoint[]>();
  private readonly active = new Set<number>();
  private readonly sourceResolvers: SourceBreakpointResolver[];

  constructor() {
    this.sourceResolvers = [
      {
        matches: (sourcePath: string, listingPath: string): boolean =>
          this.isListingSource(listingPath, sourcePath),
        resolve: (
          listing: ListingInfo,
          _mappingIndex: SourceMapIndex | undefined,
          _sourcePath: string,
          line: number
        ): SourceBreakpointResolution => {
          const address = this.resolveListingLineAddress(listing, line);
          return {
            addresses: address !== undefined ? [address] : [],
            verified: address !== undefined,
          };
        },
        continueOnEmpty: false,
      },
      {
        matches: (sourcePath: string, listingPath: string): boolean =>
          !this.isListingSource(listingPath, sourcePath),
        resolve: (
          _listing: ListingInfo,
          mappingIndex: SourceMapIndex | undefined,
          sourcePath: string,
          line: number
        ): SourceBreakpointResolution => {
          const addresses = this.resolveSourceBreakpoint(mappingIndex, sourcePath, line);
          if (addresses.length > 0) {
            return { addresses, verified: true };
          }
          return { addresses: [], verified: false };
        },
        continueOnEmpty: true,
      },
      {
        matches: (sourcePath: string, listingPath: string): boolean =>
          !this.isListingSource(listingPath, sourcePath) && this.isAsmLikeSource(sourcePath),
        resolve: (
          listing: ListingInfo,
          _mappingIndex: SourceMapIndex | undefined,
          _sourcePath: string,
          line: number
        ): SourceBreakpointResolution => {
          const address = this.resolveListingLineAddress(listing, line);
          return {
            addresses: address !== undefined ? [address] : [],
            verified: address !== undefined,
          };
        },
        continueOnEmpty: false,
      },
    ];
  }

  reset(): void {
    this.pendingBySource.clear();
    this.active.clear();
  }

  setPending(sourcePath: string, breakpoints: DebugProtocol.SourceBreakpoint[]): void {
    this.pendingBySource.set(sourcePath, breakpoints);
  }

  applyAll(
    listing: ListingInfo | undefined,
    listingPath: string | undefined,
    mappingIndex: SourceMapIndex | undefined
  ): DebugProtocol.Breakpoint[] {
    const applied: DebugProtocol.Breakpoint[] = [];
    for (const [source, breakpoints] of this.pendingBySource.entries()) {
      applied.push(...this.applyForSource(listing, listingPath, mappingIndex, source, breakpoints));
    }
    this.rebuild(listing, listingPath, mappingIndex);
    return applied;
  }

  applyForSource(
    listing: ListingInfo | undefined,
    listingPath: string | undefined,
    mappingIndex: SourceMapIndex | undefined,
    sourcePath: string,
    breakpoints: DebugProtocol.SourceBreakpoint[]
  ): DebugProtocol.Breakpoint[] {
    const verified: DebugProtocol.Breakpoint[] = [];
    if (listing === undefined || listingPath === undefined) {
      for (const bp of breakpoints) {
        verified.push({ line: bp.line, verified: false });
      }
      return verified;
    }

    for (const bp of breakpoints) {
      const line = bp.line ?? 0;
      const resolution = this.resolveBreakpointForSource(
        listing,
        listingPath,
        mappingIndex,
        sourcePath,
        line
      );
      verified.push({ line: bp.line, verified: resolution.verified });
    }

    return verified;
  }

  rebuild(
    listing: ListingInfo | undefined,
    listingPath: string | undefined,
    mappingIndex: SourceMapIndex | undefined
  ): void {
    this.active.clear();
    if (listing === undefined || listingPath === undefined) {
      return;
    }

    for (const [source, bps] of this.pendingBySource.entries()) {
      for (const bp of bps) {
        const line = bp.line ?? 0;
        const resolution = this.resolveBreakpointForSource(
          listing,
          listingPath,
          mappingIndex,
          source,
          line
        );
        const [first] = resolution.addresses;
        if (first !== undefined) {
          this.active.add(first);
        }
      }
    }
  }

  hasAddress(address: number): boolean {
    return this.active.has(address);
  }

  private resolveBreakpointForSource(
    listing: ListingInfo,
    listingPath: string,
    mappingIndex: SourceMapIndex | undefined,
    sourcePath: string,
    line: number
  ): SourceBreakpointResolution {
    for (const resolver of this.sourceResolvers) {
      if (!resolver.matches(sourcePath, listingPath)) {
        continue;
      }
      const resolution = resolver.resolve(listing, mappingIndex, sourcePath, line);
      if (resolution.addresses.length > 0 || !resolver.continueOnEmpty) {
        return resolution;
      }
    }

    return { addresses: [], verified: false };
  }

  private resolveSourceBreakpoint(
    mappingIndex: SourceMapIndex | undefined,
    sourcePath: string,
    line: number
  ): number[] {
    if (!mappingIndex) {
      return [];
    }
    const direct = resolveLocation(mappingIndex, sourcePath, line);
    if (direct.length > 0) {
      return direct;
    }
    return this.resolveByBasename(mappingIndex, sourcePath, line);
  }

  private resolveByBasename(mappingIndex: SourceMapIndex, sourcePath: string, line: number): number[] {
    const want = path.basename(sourcePath).toLowerCase();
    const lineSlop = [0, -1, 1, -2, 2, -3, 3, -4, 4];
    for (const [fileKey, fileMap] of mappingIndex.segmentsByFileLine.entries()) {
      if (path.basename(fileKey).toLowerCase() !== want) {
        continue;
      }
      for (const delta of lineSlop) {
        const tryLine = line + delta;
        if (tryLine < 1) {
          continue;
        }
        const segments = fileMap.get(tryLine);
        if (segments && segments.length > 0) {
          return segments.map((seg) => seg.start);
        }
      }
    }
    return [];
  }

  private isListingSource(listingPath: string, sourcePath: string): boolean {
    return pathsEqual(sourcePath, listingPath);
  }

  private resolveListingLineAddress(listing: ListingInfo, line: number): number | undefined {
    const direct = listing.lineToAddress.get(line);
    if (direct !== undefined) {
      return direct;
    }
    const next = listing.lineToAddress.get(line + 1);
    if (next !== undefined) {
      return next;
    }
    if (listing.entries.length === 0) {
      return undefined;
    }
    for (const entry of listing.entries) {
      if (entry.line >= line) {
        return entry.address;
      }
    }
    return undefined;
  }

  private isAsmLikeSource(sourcePath: string): boolean {
    const lower = sourcePath.toLowerCase();
    return lower.endsWith('.asm') || lower.endsWith('.z80') || lower.endsWith('.zax');
  }
}
