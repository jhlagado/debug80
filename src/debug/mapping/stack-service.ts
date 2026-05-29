/**
 * @fileoverview Stack frame helpers for debug sessions.
 */

import * as path from 'path';
import { StackFrame, Source } from '@vscode/debugadapter';
import type { SourceMapAnchor } from '../../mapping/parser';
import { findAnchorLine, findSegmentForAddress, SourceMapIndex } from '../../mapping/source-map';
import { findNearestSymbol } from './symbol-service';
import { canonicalizeDebuggerSourcePath } from './path-utils';

export interface SourceLookupOptions {
  mappingIndex?: SourceMapIndex;
  sourceFile?: string;
  symbolAnchors?: SourceMapAnchor[];
  lookupAnchors?: SourceMapAnchor[];
  stackPointer?: number;
  maxStackFrames?: number;
  readMemory?: (address: number) => number;
  resolveMappedPath: (filePath: string) => string | undefined;
  getAddressAliases?: (address: number) => number[];
}

export function buildStackFrames(
  pc: number,
  options: SourceLookupOptions
): { stackFrames: StackFrame[]; totalFrames: number } {
  const resolved = resolveSourceForAddress(pc, options);
  const source = new Source(path.basename(resolved.path), resolved.path);
  const name = resolveFrameName(pc, options);
  const stackFrames = [new StackFrame(0, name, source, resolved.line)];
  stackFrames.push(...buildReturnStackFrames(options));
  return {
    stackFrames,
    totalFrames: stackFrames.length,
  };
}

function resolveFrameName(pc: number, options: SourceLookupOptions): string {
  const anchors = options.symbolAnchors ?? [];
  const lookupAnchors = options.lookupAnchors ?? [];
  if (anchors.length === 0 && lookupAnchors.length === 0) {
    return 'main';
  }

  const addresses = options.getAddressAliases?.(pc) ?? [pc];
  for (const address of addresses) {
    const symbol = findNearestSymbol(address & 0xffff, { anchors, lookupAnchors });
    if (symbol === null) {
      continue;
    }
    const offset = (address & 0xffff) - symbol.address;
    return offset > 0 ? `${symbol.name}+${offset}` : symbol.name;
  }
  return 'main';
}

function buildReturnStackFrames(options: SourceLookupOptions): StackFrame[] {
  if (
    options.stackPointer === undefined ||
    options.readMemory === undefined ||
    options.mappingIndex === undefined
  ) {
    return [];
  }
  const max = Math.max(0, Math.min(options.maxStackFrames ?? 8, 8));
  const frames: StackFrame[] = [];
  for (let i = 0; i < max; i += 1) {
    const stackAddress = (options.stackPointer + i * 2) & 0xffff;
    const address = readWord(options.readMemory, stackAddress);
    const mapped = resolveSourceForAddressInternal(address, options);
    const name = mapped
      ? resolveFrameName(address, options)
      : `$${formatHex16(address)} (likely data)`;
    if (mapped) {
      const resolved = finalizeSourcePath(mapped);
      const source = new Source(path.basename(resolved.path), resolved.path);
      frames.push(new StackFrame(i + 1, name, source, resolved.line));
    } else {
      frames.push(new StackFrame(i + 1, name));
    }
  }
  return trimTrailingLikelyData(frames);
}

function trimTrailingLikelyData(frames: StackFrame[]): StackFrame[] {
  let end = frames.length;
  while (end > 0 && frames[end - 1]?.source === undefined) {
    end -= 1;
  }
  if (end === 0) {
    return frames.slice(0, 1);
  }
  return frames.slice(0, end);
}

function readWord(readMemory: (address: number) => number, address: number): number {
  const lo = readMemory(address & 0xffff) & 0xff;
  const hi = readMemory((address + 1) & 0xffff) & 0xff;
  return lo | (hi << 8);
}

function formatHex16(address: number): string {
  return (address & 0xffff).toString(16).padStart(4, '0');
}

export function resolveSourceForAddress(
  address: number,
  options: SourceLookupOptions
): { path: string; line: number } {
  const fallback = finalizeSourcePath({ path: options.sourceFile ?? '', line: 1 });

  const resolved = resolveSourceForAddressInternal(address, options);
  if (resolved) {
    return finalizeSourcePath(resolved);
  }

  const aliases = options.getAddressAliases ? options.getAddressAliases(address) : [address];
  for (const alias of aliases) {
    if (alias === address) {
      continue;
    }
    const resolvedAlias = resolveSourceForAddressInternal(alias, options);
    if (resolvedAlias) {
      return finalizeSourcePath(resolvedAlias);
    }
  }

  return fallback;
}

function finalizeSourcePath(loc: { path: string; line: number }): { path: string; line: number } {
  if (!loc.path) {
    return loc;
  }
  return { line: loc.line, path: canonicalizeDebuggerSourcePath(loc.path) };
}

function resolveSourceForAddressInternal(
  address: number,
  options: SourceLookupOptions
): { path: string; line: number } | null {
  const index = options.mappingIndex;
  if (!index) {
    diagLog(`  [internal] no mappingIndex`);
    return null;
  }
  const segment = findSegmentForAddress(index, address);
  if (segment === undefined) {
    diagLog(`  [internal] findSegmentForAddress → no segment`);
    return null;
  }
  if (segment.loc.file === null) {
    diagLog(
      `  [internal] segment [0x${segment.start.toString(16)}-0x${segment.end.toString(16)}] loc.file=null`
    );
    return null;
  }

  diagLog(
    `  [internal] segment [0x${segment.start.toString(16)}-0x${segment.end.toString(16)}] file="${segment.loc.file}" line=${segment.loc.line}`
  );
  const resolvedPath = options.resolveMappedPath(segment.loc.file);
  if (resolvedPath === undefined || resolvedPath.length === 0) {
    diagLog(`  [internal] resolveMappedPath("${segment.loc.file}") → undefined`);
    return null;
  }

  diagLog(`  [internal] resolved → "${resolvedPath}"`);
  if (segment.loc.line !== null && segment.loc.line >= 1) {
    return { path: resolvedPath, line: segment.loc.line };
  }

  const anchorLine = findAnchorLine(index, resolvedPath, address);
  if (anchorLine !== null) {
    return { path: resolvedPath, line: anchorLine };
  }

  return null;
}

let diagLogEnabled = false;
const diagBuffer: string[] = [];

export function setDiagnosticsEnabled(enabled: boolean): void {
  diagLogEnabled = enabled;
}

export function isDiagnosticsEnabled(): boolean {
  return diagLogEnabled;
}

function diagLog(msg: string): void {
  if (diagLogEnabled) {
    diagBuffer.push(msg);
  }
}

export function flushDiagLog(): string[] {
  const lines = [...diagBuffer];
  diagBuffer.length = 0;
  return lines;
}
