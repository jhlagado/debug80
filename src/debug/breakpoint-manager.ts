/**
 * @fileoverview Breakpoint management for the Z80 debug adapter.
 * Handles setting, verifying, and resolving breakpoints.
 */

import * as path from 'path';
import { DebugProtocol } from '@vscode/debugprotocol';
import { ListingInfo } from '../z80/loaders';
import { resolveLocation, SourceMapIndex } from '../mapping/source-map';

/**
 * Manages breakpoints for the debug session.
 */
export class BreakpointManager {
  /** Set of active breakpoint addresses */
  private breakpoints: Set<number> = new Set();

  /** Pending breakpoints by normalized source path */
  private pendingBreakpointsBySource: Map<string, DebugProtocol.SourceBreakpoint[]> =
    new Map();

  /** Listing info for address resolution */
  private listing: ListingInfo | undefined;

  /** Path to the listing file */
  private listingPath: string | undefined;

  /** Source map index for breakpoint resolution */
  private mappingIndex: SourceMapIndex | undefined;

  /** Base directory for path resolution */
  private baseDir: string = process.cwd();

  /**
   * Gets the set of active breakpoint addresses.
   *
   * @returns Set of addresses with active breakpoints
   */
  public getBreakpoints(): Set<number> {
    return this.breakpoints;
  }

  /**
   * Clears all breakpoints.
   */
  public clear(): void {
    this.breakpoints.clear();
    this.pendingBreakpointsBySource.clear();
  }

  /**
   * Updates the listing info used for breakpoint resolution.
   *
   * @param listing - The listing info
   * @param listingPath - Path to the listing file
   */
  public setListing(listing: ListingInfo | undefined, listingPath: string | undefined): void {
    this.listing = listing;
    this.listingPath = listingPath;
  }

  /**
   * Updates the source map index used for breakpoint resolution.
   *
   * @param index - The source map index
   */
  public setMappingIndex(index: SourceMapIndex | undefined): void {
    this.mappingIndex = index;
  }

  /**
   * Updates the base directory for path resolution.
   *
   * @param baseDir - The base directory
   */
  public setBaseDir(baseDir: string): void {
    this.baseDir = baseDir;
  }

  /**
   * Checks if an address has a breakpoint set.
   *
   * @param address - The address to check
   * @returns True if a breakpoint is set at the address
   */
  public hasBreakpoint(address: number): boolean {
    return this.breakpoints.has(address);
  }

  /**
   * Checks if an address or its shadow alias has a breakpoint.
   *
   * @param address - The address to check
   * @param getShadowAlias - Function to get shadow alias for an address
   * @returns True if a breakpoint is set
   */
  public hasBreakpointWithShadow(
    address: number,
    getShadowAlias: (addr: number) => number | null
  ): boolean {
    if (this.breakpoints.has(address)) {
      return true;
    }
    const shadowAlias = getShadowAlias(address);
    return shadowAlias !== null && this.breakpoints.has(shadowAlias);
  }

  /**
   * Sets breakpoints for a source file.
   *
   * @param sourcePath - Path to the source file
   * @param breakpoints - Breakpoints to set
   * @returns Array of verified breakpoint responses
   */
  public setBreakpoints(
    sourcePath: string | undefined,
    breakpoints: DebugProtocol.SourceBreakpoint[]
  ): DebugProtocol.Breakpoint[] {
    const normalized =
      sourcePath === undefined || sourcePath.length === 0
        ? undefined
        : this.normalizeSourcePath(sourcePath);

    if (normalized !== undefined) {
      this.pendingBreakpointsBySource.set(normalized, breakpoints);
    }

    const verified =
      this.listing !== undefined && normalized !== undefined
        ? this.applyBreakpointsForSource(normalized, breakpoints)
        : breakpoints.map((bp) => ({ line: bp.line, verified: false }));

    if (this.listing !== undefined) {
      this.rebuildBreakpoints();
    }

    return verified;
  }

  /**
   * Applies all pending breakpoints after listing/mapping is available.
   *
   * @returns Array of verified breakpoint responses
   */
  public applyAllBreakpoints(): DebugProtocol.Breakpoint[] {
    const applied: DebugProtocol.Breakpoint[] = [];
    for (const [source, breakpoints] of this.pendingBreakpointsBySource.entries()) {
      applied.push(...this.applyBreakpointsForSource(source, breakpoints));
    }
    this.rebuildBreakpoints();
    return applied;
  }

  /**
   * Applies breakpoints for a specific source file.
   *
   * @param sourcePath - Normalized source path
   * @param bps - Breakpoints to apply
   * @returns Array of verified breakpoint responses
   */
  private applyBreakpointsForSource(
    sourcePath: string,
    bps: DebugProtocol.SourceBreakpoint[]
  ): DebugProtocol.Breakpoint[] {
    const listing = this.listing;
    const listingPath = this.listingPath;
    const verified: DebugProtocol.Breakpoint[] = [];

    if (listing === undefined || listingPath === undefined) {
      for (const bp of bps) {
        verified.push({ line: bp.line, verified: false });
      }
      return verified;
    }

    if (this.isListingSource(sourcePath)) {
      for (const bp of bps) {
        const line = bp.line ?? 0;
        const address =
          listing.lineToAddress.get(line) ?? listing.lineToAddress.get(line + 1);
        const ok = address !== undefined;
        verified.push({ line: bp.line, verified: ok });
      }
      return verified;
    }

    for (const bp of bps) {
      const line = bp.line ?? 0;
      const addresses = this.resolveSourceBreakpoint(sourcePath, line);
      const ok = addresses.length > 0;
      verified.push({ line: bp.line, verified: ok });
    }

    return verified;
  }

  /**
   * Rebuilds the set of breakpoint addresses from pending breakpoints.
   */
  private rebuildBreakpoints(): void {
    this.breakpoints.clear();
    if (this.listing === undefined || this.listingPath === undefined) {
      return;
    }

    for (const [source, bps] of this.pendingBreakpointsBySource.entries()) {
      if (this.isListingSource(source)) {
        for (const bp of bps) {
          const line = bp.line ?? 0;
          const address =
            this.listing.lineToAddress.get(line) ??
            this.listing.lineToAddress.get(line + 1);
          if (address !== undefined) {
            this.breakpoints.add(address);
          }
        }
        continue;
      }

      for (const bp of bps) {
        const line = bp.line ?? 0;
        const addresses = this.resolveSourceBreakpoint(source, line);
        const [first] = addresses;
        if (first !== undefined) {
          this.breakpoints.add(first);
        }
      }
    }
  }

  /**
   * Resolves a source line to addresses.
   *
   * @param sourcePath - Source file path
   * @param line - Line number
   * @returns Array of addresses for the line
   */
  private resolveSourceBreakpoint(sourcePath: string, line: number): number[] {
    const index = this.mappingIndex;
    if (!index) {
      return [];
    }
    return resolveLocation(index, sourcePath, line);
  }

  /**
   * Checks if a source path refers to the listing file.
   *
   * @param sourcePath - Source path to check
   * @returns True if the path refers to the listing
   */
  private isListingSource(sourcePath: string): boolean {
    if (this.listingPath === undefined) {
      return path.extname(sourcePath).toLowerCase() === '.lst';
    }
    return path.resolve(sourcePath) === path.resolve(this.listingPath);
  }

  /**
   * Normalizes a source path for consistent comparison.
   *
   * @param sourcePath - Source path to normalize
   * @returns Normalized absolute path
   */
  private normalizeSourcePath(sourcePath: string): string {
    if (path.isAbsolute(sourcePath)) {
      return path.resolve(sourcePath);
    }
    return path.resolve(this.baseDir, sourcePath);
  }
}
