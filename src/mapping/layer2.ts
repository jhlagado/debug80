/**
 * @fileoverview Layer 2 source mapping refinement.
 * Improves mapping accuracy by matching listing text to source file content.
 */

import * as fs from 'fs';
import * as path from 'path';
import { MappingParseResult, SourceMapAnchor, SourceMapSegment } from './parser';

/**
 * Options for Layer 2 processing.
 */
export interface Layer2Options {
  /** Function to resolve file paths to absolute paths */
  resolvePath: (file: string) => string | undefined;
  /** Additional source files to consider when the listing has no reliable file anchor. */
  candidateFiles?: string[];
}

/**
 * Result of Layer 2 processing.
 */
export interface Layer2Result {
  /** Source files that could not be loaded */
  missingSources: string[];
}

/** Internal representation of loaded source file */
interface SourceFileData {
  path: string;
  lines: string[];
  normLines: string[];
}

/** Pattern to detect data directives (DB, DW, etc.) */
const DATA_DIRECTIVE = /^(DB|DW|DS|DEFB|DEFW|DEFS|INCBIN)\b/;

const SOURCE_EXTENSIONS = /\.(z80|asm)$/i;

/**
 * asm80 symbol tables often report "DEFINED AT LINE N IN parent.z80" for code that
 * was assembled from an included file (e.g. glcd_library.z80) while reusing the
 * included file's line number but the parent's path. If the parent file has no such
 * line or the line does not define the symbol, search sibling sources in the same folder.
 *
 * Also run when loading a native `.d8.json` (ZAX etc.): those maps embed the same
 * asm80 paths and never went through {@link applyLayer2} from a listing rebuild.
 */
export type IncludeAnchorRemap = {
  address: number;
  oldFile: string;
  newFile: string;
};

export function remapAsm80MisassignedIncludeAnchors(
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

function lineDefinesLabel(symbol: string, rawLine: string): boolean {
  const sym = symbol.replace(/:$/, '').trim();
  if (sym.length === 0) {
    return false;
  }
  const escaped = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*${escaped}\\s*:`, 'i').test(rawLine.trim());
}

/**
 * For segments whose start address had an anchor remapped, copy the anchor's
 * file/line onto the segment. Scoped to {@link remapAsm80MisassignedIncludeAnchors}
 * output so we do not override unrelated instruction mappings.
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
 * First address after {@link remapAsm80MisassignedIncludeAnchors} region: next symbol that still
 * maps to the parent file and whose label actually appears on that line in the parent source.
 */
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
    if (li >= 0 && li < parentLines.length && lineDefinesLabel(next.symbol, parentLines[li] ?? '')) {
      return next.address;
    }
  }
  return 0x10000;
}

/**
 * asm80/D8 often tag every byte in an included routine with the parent file. After anchors are
 * remapped to the real include (e.g. glcd_library.z80), copy that file onto all segments in the
 * address range until the next genuine parent-file symbol so step-in/stack mapping follows GLCD
 * source, not only the entry label.
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

/**
 * Applies Layer 2 refinement to improve source mapping accuracy.
 *
 * Layer 2 processing:
 * 1. Loads source files referenced by the mapping
 * 2. Matches listing text to source lines using normalized comparison
 * 3. Adjusts confidence levels based on match quality
 * 4. Handles macro blocks and data directives specially
 *
 * The mapping object is modified in place.
 *
 * @param mapping - Mapping to refine (modified in place)
 * @param options - Layer 2 options including path resolver
 * @returns Result indicating any missing source files
 *
 * @example
 * ```typescript
 * const result = applyLayer2(mapping, {
 *   resolvePath: (file) => path.resolve(srcDir, file)
 * });
 * if (result.missingSources.length > 0) {
 *   console.warn('Missing:', result.missingSources);
 * }
 * ```
 */
export function applyLayer2(mapping: MappingParseResult, options: Layer2Options): Layer2Result {
  const includeRemaps = remapAsm80MisassignedIncludeAnchors(mapping.anchors, options.resolvePath);
  propagateMisassignedIncludeSegments(mapping, includeRemaps, options.resolvePath);

  const files = collectSourceFiles(mapping);
  for (const file of options.candidateFiles ?? []) {
    files.add(file);
  }
  const { fileData, missingSources } = loadSourceFiles(files, options.resolvePath);

  const anchorByAddress = new Map<number, SourceMapAnchor>();
  const duplicateAddresses = new Set<number>();
  for (const anchor of mapping.anchors) {
    if (!anchorByAddress.has(anchor.address)) {
      anchorByAddress.set(anchor.address, anchor);
    } else {
      duplicateAddresses.add(anchor.address);
    }
  }

  const anchorUsed = new Set<number>();
  let currentFile: string | null = null;
  let hintLine: number | null = null;
  let macroBlock = false;

  for (const segment of mapping.segments) {
    const anchor = anchorByAddress.get(segment.start);
    if (anchor && !anchorUsed.has(segment.start)) {
      segment.loc.file = anchor.file;
      segment.loc.line = anchor.line;
      segment.confidence = duplicateAddresses.has(anchor.address) ? 'MEDIUM' : 'HIGH';
      currentFile = anchor.file;
      hintLine = anchor.line;
      macroBlock = false;
      anchorUsed.add(segment.start);
      continue;
    }

    if (segment.loc.file === null) {
      currentFile = null;
      hintLine = null;
      macroBlock = false;
      continue;
    }

    if (segment.loc.file !== currentFile) {
      currentFile = segment.loc.file;
      hintLine = segment.loc.line ?? null;
      macroBlock = false;
    }

    if (isMacroMarker(segment.lst.text)) {
      macroBlock = true;
      continue;
    }

    if (isLabelOnly(segment)) {
      macroBlock = false;
    }

    const fileInfo = currentFile ? fileData.get(currentFile) : undefined;
    if (!fileInfo) {
      continue;
    }

    const norm = normalizeAsm(segment.lst.text);
    if (norm === '') {
      continue;
    }

    const isData = DATA_DIRECTIVE.test(norm);
    let matchedFile = currentFile;
    const matches = findMatches(fileInfo.normLines, norm, hintLine);
    let { line, ambiguous } = chooseMatch(matches, hintLine);

    if (line === null && options.candidateFiles !== undefined) {
      const candidate = findCandidateMatch(options.candidateFiles, fileData, norm, hintLine);
      if (candidate !== null) {
        matchedFile = candidate.file;
        line = candidate.line;
        ambiguous = candidate.ambiguous;
      }
    }

    if (line === null) {
      if ((isData || macroBlock) && segment.confidence !== 'HIGH') {
        segment.confidence = 'LOW';
      }
      continue;
    }

    if (hintLine !== null && line < hintLine - 80) {
      if ((isData || macroBlock) && segment.confidence !== 'HIGH') {
        segment.confidence = 'LOW';
      }
      continue;
    }

    segment.loc.file = matchedFile;
    segment.loc.line = line;
    if (segment.confidence !== 'HIGH') {
      if (isData || macroBlock) {
        segment.confidence = 'LOW';
      } else if (ambiguous) {
        segment.confidence = 'MEDIUM';
      } else {
        segment.confidence = 'HIGH';
      }
    }
    hintLine = line;
  }

  return { missingSources };
}

function findCandidateMatch(
  candidateFiles: string[],
  fileData: Map<string, SourceFileData>,
  norm: string,
  hintLine: number | null
): { file: string; line: number; ambiguous: boolean } | null {
  for (const candidateFile of candidateFiles) {
    const candidateInfo = fileData.get(candidateFile);
    if (!candidateInfo) {
      continue;
    }
    const matches = findMatches(candidateInfo.normLines, norm, hintLine);
    const { line, ambiguous } = chooseMatch(matches, hintLine);
    if (line !== null) {
      return { file: candidateFile, line, ambiguous };
    }
  }
  return null;
}

function collectSourceFiles(mapping: MappingParseResult): Set<string> {
  const files = new Set<string>();
  for (const anchor of mapping.anchors) {
    files.add(anchor.file);
  }
  for (const segment of mapping.segments) {
    if (segment.loc.file !== null) {
      files.add(segment.loc.file);
    }
  }
  return files;
}

function loadSourceFiles(
  files: Set<string>,
  resolvePath: (file: string) => string | undefined
): { fileData: Map<string, SourceFileData>; missingSources: string[] } {
  const fileData = new Map<string, SourceFileData>();
  const missingSources: string[] = [];

  for (const file of files) {
    const resolved = resolvePath(file);
    if (resolved === undefined || resolved.length === 0) {
      missingSources.push(file);
      continue;
    }
    if (fileData.has(file)) {
      continue;
    }
    const content = fs.readFileSync(resolved, 'utf-8');
    const lines = content.split(/\r?\n/);
    const normLines = lines.map((line) => normalizeAsm(line));
    fileData.set(file, { path: resolved, lines, normLines });
  }

  return { fileData, missingSources };
}

function normalizeAsm(line: string): string {
  const stripped = stripComment(line);
  let text = stripped.trim();
  if (text.length === 0) {
    return '';
  }
  text = text.replace(/\s+/g, ' ');
  text = text.toUpperCase();
  text = text.replace(/\s*,\s*/g, ',');
  text = text.replace(/\s*([+\-*/()])\s*/g, '$1');
  return text;
}

function stripComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (ch === ';' && !inSingle && !inDouble) {
      return line.slice(0, i);
    }
  }
  return line;
}

function findMatches(normLines: string[], target: string, hintLine: number | null): number[] {
  const total = normLines.length;
  let start = 1;
  let end = total;
  if (hintLine !== null) {
    start = Math.max(1, hintLine - 40);
    end = Math.min(total, hintLine + 200);
  }
  const matches: number[] = [];
  for (let i = start; i <= end; i += 1) {
    if (normLines[i - 1] === target) {
      matches.push(i);
    }
  }
  return matches;
}

function chooseMatch(
  matches: number[],
  hintLine: number | null
): { line: number | null; ambiguous: boolean } {
  if (matches.length === 0) {
    return { line: null, ambiguous: false };
  }
  let chosen = matches[0];
  if (hintLine !== null) {
    const forward = matches.find((m) => m >= hintLine);
    if (forward !== undefined) {
      chosen = forward;
    }
  }
  return { line: chosen ?? null, ambiguous: matches.length > 1 };
}

function isMacroMarker(text: string): boolean {
  return /Macro unroll/i.test(text);
}

function isLabelOnly(segment: SourceMapSegment): boolean {
  if (segment.end !== segment.start) {
    return false;
  }
  const trimmed = segment.lst.text.trim();
  return trimmed.endsWith(':');
}
