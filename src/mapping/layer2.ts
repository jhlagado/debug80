import * as fs from 'fs';
import { MappingParseResult, SourceMapAnchor, SourceMapSegment } from './parser';

export interface Layer2Options {
  resolvePath: (file: string) => string | undefined;
}

export interface Layer2Result {
  missingSources: string[];
}

interface SourceFileData {
  path: string;
  lines: string[];
  normLines: string[];
}

const DATA_DIRECTIVE = /^(DB|DW|DS|DEFB|DEFW|DEFS|INCBIN)\b/;

export function applyLayer2(mapping: MappingParseResult, options: Layer2Options): Layer2Result {
  const files = collectSourceFiles(mapping);
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
    const matches = findMatches(fileInfo.normLines, norm, hintLine);
    const { line, ambiguous } = chooseMatch(matches, hintLine);

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
    if (ch === '\'' && !inDouble) {
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

function chooseMatch(matches: number[], hintLine: number | null): { line: number | null; ambiguous: boolean } {
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
