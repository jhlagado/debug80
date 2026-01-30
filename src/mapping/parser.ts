/**
 * @fileoverview Parser for Z80 assembler listing files.
 * Extracts address mappings and symbol anchors from listing output.
 */

/**
 * Confidence level for source mapping accuracy.
 * - HIGH: Exact match from symbol anchor
 * - MEDIUM: Inferred from context or has duplicate addresses
 * - LOW: Unable to determine source location
 */
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Source file location reference.
 */
export interface SourceLocation {
  /** Source file path (null if unknown) */
  file: string | null;
  /** Line number in source file (null if unknown) */
  line: number | null;
}

/**
 * Listing file information for a segment.
 */
export interface LstInfo {
  /** Line number in the listing file */
  line: number;
  /** Assembly text from the listing */
  text: string;
}

/**
 * A contiguous segment of memory with source mapping.
 */
export interface SourceMapSegment {
  /** Start address (inclusive) */
  start: number;
  /** End address (exclusive) */
  end: number;
  /** Source location reference */
  loc: SourceLocation;
  /** Listing file information */
  lst: LstInfo;
  /** Confidence level of the mapping */
  confidence: Confidence;
}

/**
 * A symbol anchor linking an address to source location.
 */
export interface SourceMapAnchor {
  /** Memory address of the symbol */
  address: number;
  /** Symbol name */
  symbol: string;
  /** Source file containing the symbol */
  file: string;
  /** Line number in the source file */
  line: number;
}

/**
 * Result of parsing a listing file.
 */
export interface MappingParseResult {
  /** Memory segments with source mappings */
  segments: SourceMapSegment[];
  /** Symbol anchors for address-to-source lookup */
  anchors: SourceMapAnchor[];
}

interface ListingEntry {
  startAddr: number;
  endAddr: number;
  byteCount: number;
  asmText: string;
  lstLineNumber: number;
}

interface AnchorParseResult {
  anchors: SourceMapAnchor[];
  duplicateAddresses: Set<number>;
  anchorByAddress: Map<number, SourceMapAnchor>;
}

/** Pattern to match a single hex byte token */
const BYTE_TOKEN = /^[0-9A-Fa-f]{2}$/;
/** Pattern to match a listing line with address */
const LISTING_LINE = /^([0-9A-Fa-f]{4})\s+(.*)$/;
/** Pattern to match symbol definition anchor lines */
const ANCHOR_LINE = /^\s*([A-Za-z_.$][\w.$]*):\s+([0-9A-Fa-f]{4})\s+DEFINED AT LINE\s+(\d+)\s+IN\s+(.+)$/;

/**
 * Parses assembler listing content into source map segments and anchors.
 *
 * The parser extracts:
 * - Memory address mappings from listing lines
 * - Symbol anchors from "DEFINED AT LINE" entries
 * - Byte counts for each instruction/data segment
 *
 * @param content - Raw listing file content
 * @returns Parsed mapping result with segments and anchors
 *
 * @example
 * ```typescript
 * const content = fs.readFileSync('program.lst', 'utf-8');
 * const mapping = parseMapping(content);
 * console.log(`Found ${mapping.segments.length} segments`);
 * ```
 */
export function parseMapping(content: string): MappingParseResult {
  const entries: ListingEntry[] = [];
  const anchors: SourceMapAnchor[] = [];
  let inSymbolTable = false;

  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (!inSymbolTable && line.includes('DEFINED AT LINE')) {
      inSymbolTable = true;
    }

    if (inSymbolTable) {
      const anchor = parseAnchorLine(line);
      if (anchor) {
        anchors.push(anchor);
      }
      continue;
    }

    const entry = parseListingLine(line, i + 1);
    if (entry) {
      entries.push(entry);
    }
  }

  const { anchorByAddress, duplicateAddresses } = buildAnchorIndex(anchors);

  const segments = attachAnchors(entries, anchorByAddress, duplicateAddresses);
  return { segments, anchors };
}

function parseListingLine(line: string, lstLineNumber: number): ListingEntry | undefined {
  const match = LISTING_LINE.exec(line);
  if (!match) {
    return undefined;
  }
  const addressStr = match[1];
  if (addressStr === undefined || addressStr.length === 0) {
    return undefined;
  }
  const remainder = match[2] ?? '';
  const startAddr = parseInt(addressStr, 16);

  const byteTokens: string[] = [];
  let asmText = '';
  const firstToken = remainder.match(/^([0-9A-Fa-f]{2})(?:\s+|$)/);
  if (firstToken) {
    let rest = remainder;
    while (rest.length > 0) {
      const tokenMatch = rest.match(/^([0-9A-Fa-f]{2})(?:\s+|$)(.*)$/);
      if (!tokenMatch) {
        break;
      }
      const token = tokenMatch[1] ?? '';
      if (token === '' || !BYTE_TOKEN.test(token)) {
        break;
      }
      byteTokens.push(token);
      rest = tokenMatch[2] ?? '';
    }
    asmText = rest.replace(/\s+$/g, '');
  } else {
    asmText = remainder.replace(/\s+$/g, '');
  }

  const byteCount = byteTokens.length;
  const endAddr = startAddr + byteCount;

  return {
    startAddr,
    endAddr,
    byteCount,
    asmText,
    lstLineNumber,
  };
}

function parseAnchorLine(line: string): SourceMapAnchor | undefined {
  if (line.includes('USED AT LINE')) {
    return undefined;
  }
  const match = ANCHOR_LINE.exec(line);
  if (!match) {
    return undefined;
  }
  const symbol = match[1];
  const addressStr = match[2];
  const lineStr = match[3];
  const fileRaw = match[4];
  if (
    symbol === undefined ||
    addressStr === undefined ||
    lineStr === undefined ||
    fileRaw === undefined ||
    symbol.length === 0 ||
    addressStr.length === 0 ||
    lineStr.length === 0 ||
    fileRaw.length === 0
  ) {
    return undefined;
  }
  const address = parseInt(addressStr, 16);
  const lineNumber = Number.parseInt(lineStr, 10);
  const file = fileRaw.trim();
  if (!Number.isFinite(lineNumber)) {
    return undefined;
  }
  return {
    symbol,
    address,
    file,
    line: lineNumber,
  };
}

function buildAnchorIndex(anchors: SourceMapAnchor[]): AnchorParseResult {
  const anchorByAddress = new Map<number, SourceMapAnchor>();
  const duplicateAddresses = new Set<number>();

  for (const anchor of anchors) {
    if (!anchorByAddress.has(anchor.address)) {
      anchorByAddress.set(anchor.address, anchor);
    } else {
      duplicateAddresses.add(anchor.address);
    }
  }

  return { anchors, duplicateAddresses, anchorByAddress };
}

function attachAnchors(
  entries: ListingEntry[],
  anchorByAddress: Map<number, SourceMapAnchor>,
  duplicateAddresses: Set<number>
): SourceMapSegment[] {
  const segments: SourceMapSegment[] = [];
  const anchorUsed = new Set<number>();
  let currentFile: string | null = null;

  for (const entry of entries) {
    const anchor = anchorByAddress.get(entry.startAddr);
    if (anchor && !anchorUsed.has(entry.startAddr)) {
      const confidence: Confidence = duplicateAddresses.has(entry.startAddr) ? 'MEDIUM' : 'HIGH';
      segments.push({
        start: entry.startAddr,
        end: entry.endAddr,
        loc: { file: anchor.file, line: anchor.line },
        lst: { line: entry.lstLineNumber, text: entry.asmText },
        confidence,
      });
      currentFile = anchor.file;
      anchorUsed.add(entry.startAddr);
      continue;
    }

    if (currentFile === null) {
      segments.push({
        start: entry.startAddr,
        end: entry.endAddr,
        loc: { file: null, line: null },
        lst: { line: entry.lstLineNumber, text: entry.asmText },
        confidence: 'LOW',
      });
      continue;
    }

    segments.push({
      start: entry.startAddr,
      end: entry.endAddr,
      loc: { file: currentFile, line: null },
      lst: { line: entry.lstLineNumber, text: entry.asmText },
      confidence: 'MEDIUM',
    });
  }

  return segments;
}
