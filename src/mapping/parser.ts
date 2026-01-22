export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SourceLocation {
  file: string | null;
  line: number | null;
}

export interface LstInfo {
  line: number;
  text: string;
}

export interface SourceMapSegment {
  start: number;
  end: number;
  loc: SourceLocation;
  lst: LstInfo;
  confidence: Confidence;
}

export interface SourceMapAnchor {
  address: number;
  symbol: string;
  file: string;
  line: number;
}

export interface MappingParseResult {
  segments: SourceMapSegment[];
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

const BYTE_TOKEN = /^[0-9A-Fa-f]{2}$/;
const LISTING_LINE = /^([0-9A-Fa-f]{4})\s+(.*)$/;
const ANCHOR_LINE = /^\s*([A-Za-z_.$][\w.$]*):\s+([0-9A-Fa-f]{4})\s+DEFINED AT LINE\s+(\d+)\s+IN\s+(.+)$/;

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
