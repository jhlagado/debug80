/**
 * @fileoverview Breakpoint state and resolution helpers for the debug adapter.
 */

import { DebugProtocol } from '@vscode/debugprotocol';
import * as path from 'path';
import type { SourceMapIndex } from '../../mapping/source-map';
import type { SourceAddressSpace, SourceMapSegment } from '../../mapping/types';
import { normalizePathForKey } from './path-utils';

type SourceBreakpointResolution = {
  addresses: BreakpointAddress[];
  verified: boolean;
  lineDelta: number;
};

export class BreakpointManager {
  private readonly pendingBySource = new Map<string, DebugProtocol.SourceBreakpoint[]>();
  private readonly active = new Set<string>();
  private readonly conditions = new Map<string, string>();

  reset(): void {
    this.pendingBySource.clear();
    this.active.clear();
    this.conditions.clear();
  }

  setPending(sourcePath: string, breakpoints: DebugProtocol.SourceBreakpoint[]): void {
    this.pendingBySource.set(sourcePath, breakpoints);
  }

  applyAll(mappingIndex: SourceMapIndex | undefined): DebugProtocol.Breakpoint[] {
    const applied: DebugProtocol.Breakpoint[] = [];
    for (const [source, breakpoints] of this.pendingBySource.entries()) {
      applied.push(...this.applyForSource(mappingIndex, source, breakpoints));
    }
    this.rebuild(mappingIndex);
    return applied;
  }

  applyForSource(
    mappingIndex: SourceMapIndex | undefined,
    sourcePath: string,
    breakpoints: DebugProtocol.SourceBreakpoint[]
  ): DebugProtocol.Breakpoint[] {
    const verified: DebugProtocol.Breakpoint[] = [];
    for (const bp of breakpoints) {
      const line = bp.line ?? 0;
      const resolution = this.resolveBreakpointForSource(mappingIndex, sourcePath, line);
      verified.push({ line: bp.line, verified: resolution.verified });
    }

    return verified;
  }

  rebuild(mappingIndex: SourceMapIndex | undefined): void {
    this.active.clear();
    this.conditions.clear();
    const conditionLineDeltas = new Map<string, number>();

    for (const [source, bps] of this.pendingBySource.entries()) {
      for (const bp of bps) {
        const line = bp.line ?? 0;
        const resolution = this.resolveBreakpointForSource(mappingIndex, source, line);
        for (const address of resolution.addresses) {
          const key = breakpointKey(address.address, address.addressSpace);
          this.active.add(key);
          if (bp.condition !== undefined && bp.condition.trim().length > 0) {
            const existingDelta = conditionLineDeltas.get(key) ?? Number.POSITIVE_INFINITY;
            const nextDelta = Math.abs(resolution.lineDelta);
            if (nextDelta <= existingDelta) {
              this.conditions.set(key, bp.condition.trim());
              conditionLineDeltas.set(key, nextDelta);
            }
          }
        }
      }
    }
  }

  hasAddress(address: number, addressSpace?: SourceAddressSpace): boolean {
    return this.active.has(breakpointKey(address, addressSpace));
  }

  getCondition(address: number, addressSpace?: SourceAddressSpace): string | undefined {
    return this.conditions.get(breakpointKey(address, addressSpace));
  }

  private resolveBreakpointForSource(
    mappingIndex: SourceMapIndex | undefined,
    sourcePath: string,
    line: number
  ): SourceBreakpointResolution {
    const addresses = this.resolveSourceBreakpoint(mappingIndex, sourcePath, line);
    if (addresses.addresses.length > 0) {
      return {
        addresses: addresses.addresses,
        verified: true,
        lineDelta: addresses.lineDelta,
      };
    }
    return { addresses: [], verified: false, lineDelta: Number.POSITIVE_INFINITY };
  }

  private resolveSourceBreakpoint(
    mappingIndex: SourceMapIndex | undefined,
    sourcePath: string,
    line: number
  ): { addresses: BreakpointAddress[]; lineDelta: number } {
    if (!mappingIndex) {
      return { addresses: [], lineDelta: Number.POSITIVE_INFINITY };
    }
    const direct = this.resolveByPathAndLine(mappingIndex, sourcePath, line);
    if (direct.addresses.length > 0) {
      return direct;
    }
    return this.resolveByBasename(mappingIndex, sourcePath, line);
  }

  private resolveByPathAndLine(
    mappingIndex: SourceMapIndex,
    sourcePath: string,
    line: number
  ): { addresses: BreakpointAddress[]; lineDelta: number } {
    const key = normalizePathForKey(sourcePath);
    const fileMap = mappingIndex.segmentsByFileLine.get(key);
    return fileMap !== undefined
      ? this.resolveInFileLineMap(fileMap, line)
      : { addresses: [], lineDelta: Number.POSITIVE_INFINITY };
  }

  private resolveByBasename(
    mappingIndex: SourceMapIndex,
    sourcePath: string,
    line: number
  ): { addresses: BreakpointAddress[]; lineDelta: number } {
    const want = path.basename(sourcePath).toLowerCase();
    for (const [fileKey, fileMap] of mappingIndex.segmentsByFileLine.entries()) {
      if (path.basename(fileKey).toLowerCase() !== want) {
        continue;
      }
      const resolved = this.resolveInFileLineMap(fileMap, line);
      if (resolved.addresses.length > 0) {
        return resolved;
      }
    }
    return { addresses: [], lineDelta: Number.POSITIVE_INFINITY };
  }

  private resolveInFileLineMap(
    fileMap: Map<number, SourceMapSegment[]>,
    line: number
  ): {
    addresses: BreakpointAddress[];
    lineDelta: number;
  } {
    const lineSlop = [0, -1, 1, -2, 2, -3, 3, -4, 4];
    for (const delta of lineSlop) {
      const tryLine = line + delta;
      if (tryLine < 1) {
        continue;
      }
      const segments = fileMap.get(tryLine);
      if (segments && segments.length > 0) {
        const executable = segments.filter((seg) => seg.end > seg.start);
        if (executable.length > 0) {
          return {
            addresses: executable.map((seg) => ({
              address: seg.start,
              ...(seg.addressSpace !== undefined ? { addressSpace: seg.addressSpace } : {}),
            })),
            lineDelta: delta,
          };
        }
      }
    }
    return { addresses: [], lineDelta: Number.POSITIVE_INFINITY };
  }
}

type BreakpointAddress = {
  address: number;
  addressSpace?: SourceAddressSpace;
};

function breakpointKey(address: number, addressSpace: SourceAddressSpace | undefined): string {
  const masked = address & 0xffff;
  if (addressSpace === undefined) {
    return `addr:${masked}`;
  }
  return `${addressSpace.kind}:${addressSpace.physicalBank}:addr:${masked}`;
}
