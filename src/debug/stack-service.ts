/**
 * @fileoverview Stack frame helpers for debug sessions.
 */

import * as path from 'path';
import { StackFrame, Source } from '@vscode/debugadapter';
import { ListingInfo } from '../z80/loaders';
import { findAnchorLine, findSegmentForAddress, SourceMapIndex } from '../mapping/source-map';

export interface SourceLookupOptions {
  listing?: ListingInfo;
  listingPath?: string;
  mappingIndex?: SourceMapIndex;
  sourceFile?: string;
  resolveMappedPath: (filePath: string) => string | undefined;
  getAddressAliases?: (address: number) => number[];
}

export function buildStackFrames(
  pc: number,
  options: SourceLookupOptions
): { stackFrames: StackFrame[]; totalFrames: number } {
  const resolved = resolveSourceForAddress(pc, options);
  const source = new Source(path.basename(resolved.path), resolved.path);
  return {
    stackFrames: [new StackFrame(0, 'main', source, resolved.line)],
    totalFrames: 1,
  };
}

export function resolveSourceForAddress(
  address: number,
  options: SourceLookupOptions
): { path: string; line: number } {
  const listingPath = options.listingPath;
  const listingLine = options.listing?.addressToLine.get(address) ?? 1;
  const sourcePath = options.sourceFile ?? listingPath ?? '';
  const fallbackLine = listingPath !== undefined && sourcePath === listingPath ? listingLine : 1;
  const fallback = { path: sourcePath, line: fallbackLine };

  const resolved = resolveSourceForAddressInternal(address, options);
  if (resolved) {
    return resolved;
  }

  const aliases = options.getAddressAliases ? options.getAddressAliases(address) : [address];
  for (const alias of aliases) {
    if (alias === address) {
      continue;
    }
    const resolvedAlias = resolveSourceForAddressInternal(alias, options);
    if (resolvedAlias) {
      return resolvedAlias;
    }
  }

  return fallback;
}

function resolveSourceForAddressInternal(
  address: number,
  options: SourceLookupOptions
): { path: string; line: number } | null {
  const index = options.mappingIndex;
  if (!index) {
    return null;
  }
  const segment = findSegmentForAddress(index, address);
  if (segment === undefined || segment.loc.file === null) {
    return null;
  }

  const resolvedPath = options.resolveMappedPath(segment.loc.file);
  if (resolvedPath === undefined || resolvedPath.length === 0) {
    return null;
  }

  if (segment.loc.line !== null) {
    return { path: resolvedPath, line: segment.loc.line };
  }

  const anchorLine = findAnchorLine(index, resolvedPath, address);
  if (anchorLine !== null) {
    return { path: resolvedPath, line: anchorLine };
  }

  return null;
}
