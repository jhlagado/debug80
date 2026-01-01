#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function loadModule(relPath) {
  const full = path.join(process.cwd(), relPath);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing build output at ${relPath}. Run \"yarn build\" first.`);
  }
  return require(full);
}

const { parseMapping } = loadModule('out/mapping-parser.js');
const { applyLayer2 } = loadModule('out/mapping-layer2.js');

function resolveForListing(lstPath) {
  const lstDir = path.dirname(lstPath);
  const candidateRoots = [lstDir, path.resolve(lstDir, '..', 'src')];
  return (file) => {
    if (path.isAbsolute(file)) {
      return fs.existsSync(file) ? file : undefined;
    }
    for (const root of candidateRoots) {
      const candidate = path.resolve(root, file);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return undefined;
  };
}

function analyze(lstPath) {
  const content = fs.readFileSync(lstPath, 'utf-8');
  const mapping = parseMapping(content);
  const result = applyLayer2(mapping, { resolvePath: resolveForListing(lstPath) });

  const total = mapping.segments.length;
  const byteSegments = mapping.segments.filter((seg) => seg.end > seg.start);
  const fileMapped = byteSegments.filter((seg) => seg.loc.file !== null).length;
  const lineMapped = byteSegments.filter((seg) => seg.loc.line !== null).length;
  const conf = {
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };
  for (const seg of byteSegments) {
    conf[seg.confidence] += 1;
  }

  return {
    lstPath,
    totalSegments: total,
    byteSegments: byteSegments.length,
    fileMapped,
    lineMapped,
    confidence: conf,
    missingSources: Array.from(new Set(result.missingSources)),
  };
}

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('usage: node tools/analyze-layer2-coverage.js <lstPath> [lstPath...]');
  process.exit(2);
}

const results = targets.map(analyze);
console.log(JSON.stringify(results, null, 2));
