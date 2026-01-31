/**
 * @fileoverview Breakpoint state and resolution helpers for the debug adapter.
 */

import { DebugProtocol } from '@vscode/debugprotocol';
import * as path from 'path';
import type { ListingInfo } from '../z80/loaders';
import type { SourceMapIndex } from '../mapping/source-map';
import { resolveLocation } from '../mapping/source-map';
import { pathsEqual } from './path-utils';

export class BreakpointManager {
  private readonly pendingBySource = new Map<string, DebugProtocol.SourceBreakpoint[]>();
  private readonly active = new Set<number>();

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

    if (this.isListingSource(listingPath, sourcePath)) {
      for (const bp of breakpoints) {
        const line = bp.line ?? 0;
        const address = this.resolveListingLineAddress(listing, line);
        const ok = address !== undefined;
        verified.push({ line: bp.line, verified: ok });
      }
      return verified;
    }

    for (const bp of breakpoints) {
      const line = bp.line ?? 0;
      const addresses = this.resolveSourceBreakpoint(mappingIndex, sourcePath, line);
      const ok = addresses.length > 0;
      verified.push({ line: bp.line, verified: ok });
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
      if (this.isListingSource(listingPath, source)) {
        for (const bp of bps) {
          const line = bp.line ?? 0;
          const address = this.resolveListingLineAddress(listing, line);
          if (address !== undefined) {
            this.active.add(address);
          }
        }
        continue;
      }

      for (const bp of bps) {
        const line = bp.line ?? 0;
        const addresses = this.resolveSourceBreakpoint(mappingIndex, source, line);
        const [first] = addresses;
        if (first !== undefined) {
          this.active.add(first);
        }
      }
    }
  }

  hasAddress(address: number): boolean {
    return this.active.has(address);
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
    const alternate = this.resolveAlternateSourcePath(sourcePath);
    if (alternate !== null) {
      return resolveLocation(mappingIndex, alternate, line);
    }
    return [];
  }

  private isListingSource(listingPath: string, sourcePath: string): boolean {
    return pathsEqual(sourcePath, listingPath);
  }

  private resolveAlternateSourcePath(sourcePath: string): string | null {
    const normalized = path.resolve(sourcePath);
    const lower = normalized.toLowerCase();
    if (lower.endsWith('.source.asm')) {
      return normalized.slice(0, -'.source.asm'.length) + '.asm';
    }
    if (lower.endsWith('.asm')) {
      return normalized.slice(0, -'.asm'.length) + '.source.asm';
    }
    return null;
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
}
