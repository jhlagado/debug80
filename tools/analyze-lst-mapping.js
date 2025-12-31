#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const lstPath = process.argv[2] ?? 'examples/Caverns/build/main.lst';
const srcDir = process.argv[3] ?? path.join(path.dirname(lstPath), '..', 'src');

function parseListingEntries(content) {
  const entries = [];
  const lines = content.split(/\r?\n/);
  const lineRegex = /^([0-9A-Fa-f]{4})\s+(.*)$/;

  lines.forEach((line, idx) => {
    const match = lineRegex.exec(line);
    if (!match) {
      return;
    }
    const address = parseInt(match[1], 16);
    const remainder = match[2] ?? '';
    let bytesPart = '';
    let asmText = remainder.replace(/\s+$/g, '');
    if (/^[0-9A-Fa-f]{2}(\s|$)/.test(remainder)) {
      const split = remainder.match(/^((?:[0-9A-Fa-f]{2}(?:\s+|$))+)(.*)$/);
      bytesPart = (split?.[1] ?? '').trim();
      asmText = (split?.[2] ?? '').replace(/^\s+/, '').replace(/\s+$/g, '');
    }
    const byteTokens = bytesPart.match(/\b[0-9A-Fa-f]{2}\b/g) ?? [];

    entries.push({
      lineNumber: idx + 1,
      address,
      byteCount: byteTokens.length,
      asmText,
    });
  });

  return entries;
}

function parseAnchors(content) {
  const anchors = [];
  const lines = content.split(/\r?\n/);
  const anchorRegex = /^\s*([A-Za-z_.$][\w.$]*):\s+([0-9A-Fa-f]{4})\s+DEFINED AT LINE\s+(\d+)\s+IN\s+(.+)$/;
  let nonHexCount = 0;

  for (const line of lines) {
    if (!line.includes('DEFINED AT LINE')) {
      continue;
    }
    const match = anchorRegex.exec(line);
    if (!match) {
      nonHexCount += 1;
      continue;
    }
    const symbol = match[1];
    const address = parseInt(match[2], 16);
    const lineNum = Number.parseInt(match[3], 10);
    const file = match[4].trim();
    if (Number.isNaN(lineNum)) {
      continue;
    }
    anchors.push({ symbol, address, file, line: lineNum });
  }

  return { anchors, nonHexCount };
}

function stripComment(line) {
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

function normalizeAsm(line) {
  let text = stripComment(line);
  text = text.trim();
  if (text.length === 0) {
    return '';
  }
  text = text.replace(/\s+/g, ' ');
  text = text.toUpperCase();
  text = text.replace(/\s*,\s*/g, ',');
  text = text.replace(/\s*([+\-*/()])\s*/g, '$1');
  return text;
}

function isDataDirective(norm) {
  return /^(DB|DW|DS|DEFB|DEFW|DEFS|INCBIN)\b/.test(norm);
}

function isMacroMarker(text) {
  return /Macro unroll/i.test(text);
}

function loadAsmFiles(files, baseDir) {
  const map = new Map();
  const missing = [];
  for (const file of files) {
    if (map.has(file)) {
      continue;
    }
    const candidate = path.isAbsolute(file) ? file : path.join(baseDir, file);
    if (!fs.existsSync(candidate)) {
      missing.push(file);
      continue;
    }
    const content = fs.readFileSync(candidate, 'utf8');
    const lines = content.split(/\r?\n/);
    const normLines = lines.map((line) => normalizeAsm(line));
    map.set(file, { lines, normLines, path: candidate });
  }
  return { map, missing };
}

function findMatches(normLines, target, hintLine) {
  const total = normLines.length;
  let start = 1;
  let end = total;
  if (hintLine !== null) {
    start = Math.max(1, hintLine - 40);
    end = Math.min(total, hintLine + 200);
  }
  const matches = [];
  for (let i = start; i <= end; i += 1) {
    if (normLines[i - 1] === target) {
      matches.push(i);
    }
  }
  return matches;
}

function chooseMatch(matches, hintLine) {
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
  return { line: chosen, ambiguous: matches.length > 1 };
}

const lstContent = fs.readFileSync(lstPath, 'utf8');
const entries = parseListingEntries(lstContent);
const { anchors, nonHexCount } = parseAnchors(lstContent);

const anchorByAddress = new Map();
let duplicateAnchorCount = 0;
for (const anchor of anchors) {
  if (anchorByAddress.has(anchor.address)) {
    duplicateAnchorCount += 1;
    continue;
  }
  anchorByAddress.set(anchor.address, anchor);
}

const anchorFiles = new Set(anchors.map((a) => a.file));
const { map: asmFiles, missing: missingFiles } = loadAsmFiles(anchorFiles, srcDir);

// Layer 1 mapping
let currentFile = null;
let currentLineHint = null;
const anchorUsed = new Set();

for (const entry of entries) {
  const anchor = anchorByAddress.get(entry.address);
  if (anchor && !anchorUsed.has(entry.address)) {
    entry.file = anchor.file;
    entry.line = anchor.line;
    entry.confidence = 'HIGH';
    currentFile = anchor.file;
    currentLineHint = anchor.line;
    anchorUsed.add(entry.address);
    entry.anchor = true;
    continue;
  }
  if (currentFile) {
    entry.file = currentFile;
    entry.line = null;
    entry.confidence = 'MEDIUM';
  } else {
    entry.file = null;
    entry.line = null;
    entry.confidence = 'LOW';
  }
}

// Layer 2 refinement
let currentFileL2 = null;
let hintLine = null;
for (const entry of entries) {
  if (!entry.file) {
    currentFileL2 = null;
    hintLine = null;
    continue;
  }
  if (entry.confidence === 'HIGH' && entry.line !== null) {
    currentFileL2 = entry.file;
    hintLine = entry.line;
    continue;
  }
  if (entry.file !== currentFileL2) {
    currentFileL2 = entry.file;
    hintLine = entry.line ?? null;
  }
  if (entry.byteCount === 0) {
    continue;
  }
  const asmFile = asmFiles.get(entry.file);
  if (!asmFile) {
    continue;
  }
  const text = entry.asmText ?? '';
  if (isMacroMarker(text)) {
    continue;
  }
  const norm = normalizeAsm(text);
  if (norm === '') {
    continue;
  }

  const dataish = isDataDirective(norm);
  const matches = findMatches(asmFile.normLines, norm, hintLine);
  const { line, ambiguous } = chooseMatch(matches, hintLine);
  if (line === null) {
    if (dataish && entry.confidence !== 'HIGH') {
      entry.confidence = 'LOW';
    }
    continue;
  }
  if (hintLine !== null && line < hintLine - 80) {
    if (dataish && entry.confidence !== 'HIGH') {
      entry.confidence = 'LOW';
    }
    continue;
  }
  entry.line = line;
  if (entry.confidence !== 'HIGH') {
    if (dataish) {
      entry.confidence = 'LOW';
    } else if (ambiguous) {
      entry.confidence = 'MEDIUM';
    } else {
      entry.confidence = 'HIGH';
    }
  }
  hintLine = line;
}

function count(predicate) {
  return entries.filter(predicate).length;
}

const totalEntries = entries.length;
const byteEntries = count((e) => e.byteCount > 0);
const zeroByteEntries = totalEntries - byteEntries;

const fileMapped = count((e) => e.byteCount > 0 && e.file);
const lineMapped = count((e) => e.byteCount > 0 && e.line !== null);

const confidenceCounts = {
  HIGH: count((e) => e.byteCount > 0 && e.confidence === 'HIGH'),
  MEDIUM: count((e) => e.byteCount > 0 && e.confidence === 'MEDIUM'),
  LOW: count((e) => e.byteCount > 0 && e.confidence === 'LOW'),
};

const dataishCount = count((e) => e.byteCount > 0 && isDataDirective(normalizeAsm(e.asmText ?? '')));
const macroMarkerCount = count((e) => isMacroMarker(e.asmText ?? ''));

const matchedNonData = count(
  (e) =>
    e.byteCount > 0 &&
    e.line !== null &&
    !isDataDirective(normalizeAsm(e.asmText ?? ''))
);

const totals = {
  totalEntries,
  byteEntries,
  zeroByteEntries,
  fileMapped,
  lineMapped,
  confidenceCounts,
  dataishCount,
  matchedNonData,
  anchorCount: anchors.length,
  duplicateAnchorCount,
  nonHexAnchorCount: nonHexCount,
  missingFiles,
  macroMarkerCount,
};

console.log(JSON.stringify(totals, null, 2));
