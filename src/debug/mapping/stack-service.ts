/**
 * @fileoverview Stack frame helpers for debug sessions.
 */

import * as path from 'path';
import { StackFrame, Source } from '@vscode/debugadapter';
import { ListingInfo } from '../../z80/loaders';
import type { SourceMapAnchor } from '../../mapping/parser';
import { findAnchorLine, findSegmentForAddress, SourceMapIndex } from '../../mapping/source-map';
import { findNearestSymbol } from './symbol-service';
import { canonicalizeDebuggerSourcePath } from './path-utils';

export interface SourceLookupOptions {
  listing?: ListingInfo;
  listingPath?: string;
  mappingIndex?: SourceMapIndex;
  sourceFile?: string;
  symbolAnchors?: SourceMapAnchor[];
  lookupAnchors?: SourceMapAnchor[];
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
  return {
    stackFrames: [new StackFrame(0, name, source, resolved.line)],
    totalFrames: 1,
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

export function resolveSourceForAddress(
  address: number,
  options: SourceLookupOptions
): { path: string; line: number } {
  const listingPath = options.listingPath;
  const listingLine = options.listing?.addressToLine.get(address) ?? 1;
  const sourcePath = options.sourceFile ?? listingPath ?? '';
  const fallbackLine = listingPath !== undefined && sourcePath === listingPath ? listingLine : 1;
  const fallback = finalizeSourcePath({ path: sourcePath, line: fallbackLine });

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
