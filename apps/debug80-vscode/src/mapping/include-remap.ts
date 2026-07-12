/**
 * @fileoverview Repairs known include-file attribution issues in AZM D8 maps.
 */

import * as fs from 'fs';
import * as path from 'path';
import { MappingParseResult, SourceMapAnchor } from './types';

const SOURCE_EXTENSIONS = /\.(z80|asm)$/i;

/**
 * Some symbol tables report "DEFINED AT LINE N IN parent.z80" for code that
 * was assembled from an included file while reusing the included file's line
 * number but the parent's path. If the parent file does not define the symbol
 * at that line, search sibling sources in the same folder.
 */
export type IncludeAnchorRemap = {
  address: number;
  oldFile: string;
  newFile: string;
};

export function remapMisassignedIncludeAnchors(
  anchors: SourceMapAnchor[],
  resolvePath: (file: string) => string | undefined
): IncludeAnchorRemap[] {
  const remaps: IncludeAnchorRemap[] = [];
  for (const anchor of anchors) {
    const oldFile = anchor.file;
    const resolved = resolvePath(oldFile);
    if (resolved === undefined || resolved.length === 0) {
      continue;
    }
    let lines: string[];
    try {
      lines = fs.readFileSync(resolved, 'utf-8').split(/\r?\n/);
    } catch {
      continue;
    }
    const idx = anchor.line - 1;
    if (idx >= 0 && idx < lines.length && lineDefinesLabel(anchor.symbol, lines[idx] ?? '')) {
      continue;
    }
    let names: string[];
    try {
      names = fs.readdirSync(path.dirname(resolved)).filter((n) => SOURCE_EXTENSIONS.test(n));
    } catch {
      continue;
    }
    const base = path.basename(oldFile);
    const matches: string[] = [];
    for (const name of names) {
      if (name === base) {
        continue;
      }
      const sibling = path.join(path.dirname(resolved), name);
      let src: string[];
      try {
        src = fs.readFileSync(sibling, 'utf-8').split(/\r?\n/);
      } catch {
        continue;
      }
      const lineNo = anchor.line - 1;
      if (lineNo < 0 || lineNo >= src.length) {
        continue;
      }
      if (lineDefinesLabel(anchor.symbol, src[lineNo] ?? '')) {
        matches.push(name);
      }
    }
    if (matches.length === 1) {
      const only = matches[0];
      if (only !== undefined) {
        anchor.file = only;
        remaps.push({ address: anchor.address, oldFile, newFile: only });
      }
    }
  }
  return remaps;
}

/**
 * For segments whose start address had an anchor remapped, copy the anchor's
 * file/line onto the segment without overriding unrelated instruction mappings.
 */
export function syncSegmentLocationsFromAnchors(
  mapping: MappingParseResult,
  remappedAddresses: Set<number>
): void {
  if (remappedAddresses.size === 0) {
    return;
  }
  const primary = new Map<number, SourceMapAnchor>();
  for (const a of mapping.anchors) {
    if (!primary.has(a.address)) {
      primary.set(a.address, a);
    }
  }
  for (const seg of mapping.segments) {
    if (!remappedAddresses.has(seg.start)) {
      continue;
    }
    const a = primary.get(seg.start);
    if (a !== undefined) {
      seg.loc.file = a.file;
      seg.loc.line = a.line;
    }
  }
}

/**
 * D8 maps can tag every byte in an included routine with the parent file. After
 * anchors are remapped to the real include, copy that file onto all segments in
 * the address range until the next genuine parent-file symbol.
 */
export function propagateMisassignedIncludeSegments(
  mapping: MappingParseResult,
  remaps: IncludeAnchorRemap[],
  resolvePath: (file: string) => string | undefined
): void {
  if (remaps.length === 0) {
    return;
  }
  const sortedRemaps = [...remaps].sort((a, b) => a.address - b.address);
  const endByRemapAddress = new Map<number, number>();
  for (const r of sortedRemaps) {
    endByRemapAddress.set(r.address, findIncludeRegionEnd(r, mapping, resolvePath));
  }

  for (const seg of mapping.segments) {
    if (seg.loc.file === null) {
      continue;
    }
    let best: IncludeAnchorRemap | undefined;
    let bestAddr = -1;
    for (const r of sortedRemaps) {
      if (r.oldFile !== seg.loc.file) {
        continue;
      }
      const end = endByRemapAddress.get(r.address) ?? 0x10000;
      if (seg.start >= r.address && seg.start < end && r.address >= bestAddr) {
        best = r;
        bestAddr = r.address;
      }
    }
    if (best !== undefined) {
      seg.loc.file = best.newFile;
    }
  }
}

function lineDefinesLabel(symbol: string, rawLine: string): boolean {
  const sym = symbol.replace(/:$/, '').trim();
  if (sym.length === 0) {
    return false;
  }
  const escaped = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*${escaped}\\s*:`, 'i').test(rawLine.trim());
}

function findIncludeRegionEnd(
  remap: IncludeAnchorRemap,
  mapping: MappingParseResult,
  resolvePath: (file: string) => string | undefined
): number {
  const parentPath = resolvePath(remap.oldFile);
  let parentLines: string[] | null = null;
  if (parentPath !== undefined) {
    try {
      parentLines = fs.readFileSync(parentPath, 'utf-8').split(/\r?\n/);
    } catch {
      parentLines = null;
    }
  }

  const sorted = [...mapping.anchors].sort((a, b) => a.address - b.address);
  for (const next of sorted) {
    if (next.address <= remap.address) {
      continue;
    }
    if (next.file !== remap.oldFile) {
      continue;
    }
    if (parentLines === null) {
      continue;
    }
    const li = next.line - 1;
    if (
      li >= 0 &&
      li < parentLines.length &&
      lineDefinesLabel(next.symbol, parentLines[li] ?? '')
    ) {
      return next.address;
    }
  }
  return 0x10000;
}
