#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REVIEW_TRIGGER = 500;
const SOFT_LIMIT = 750;
const HARD_LIMIT = 1000;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '../src');
const DEFAULT_ALLOWLIST_FILE = path.resolve(SCRIPT_DIR, 'source-file-size-allowlist.json');

// Policy:
// - files over the review trigger are always reported for review attention
// - files over the soft limit are elevated warnings
// - files over the hard cap must either be absent or pinned in the allowlist
// - allowlisted files may not grow past their recorded ceiling and must carry a reason

function normalizePathForOutput(filePath) {
  return filePath.split(path.sep).join('/');
}

function parseArgs(argv) {
  let enforceHardCap = false;
  let rootDir = DEFAULT_ROOT;
  let allowlistFile = DEFAULT_ALLOWLIST_FILE;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--enforce-hard-cap') {
      enforceHardCap = true;
      continue;
    }
    if (arg === '--root') {
      const next = argv[i + 1];
      if (!next) throw new Error('--root requires a path argument');
      rootDir = path.resolve(process.cwd(), next);
      i += 1;
      continue;
    }
    if (arg === '--allowlist-file') {
      const next = argv[i + 1];
      if (!next) throw new Error('--allowlist-file requires a path argument');
      allowlistFile = path.resolve(process.cwd(), next);
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { enforceHardCap, rootDir, allowlistFile };
}

async function collectTsFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const childPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTsFiles(childPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(childPath);
    }
  }

  return files;
}

async function countLines(filePath) {
  const text = await readFile(filePath, 'utf8');
  if (text.length === 0) return 0;
  let lines = 1;
  for (const ch of text) {
    if (ch === '\n') lines += 1;
  }
  if (text.endsWith('\n')) lines -= 1;
  return lines;
}

function toRootRelative(filePath, rootDir) {
  const baseDir = path.dirname(rootDir);
  const rel = path.relative(baseDir, filePath);
  return normalizePathForOutput(rel || path.basename(filePath));
}

async function loadAllowlist(allowlistFile) {
  const raw = await readFile(allowlistFile, 'utf8');
  const parsed = JSON.parse(raw);
  const hardCap = parsed?.hardCap;
  if (hardCap === null || typeof hardCap !== 'object' || Array.isArray(hardCap)) {
    throw new Error(`Invalid hardCap map in ${allowlistFile}`);
  }

  const out = new Map();
  for (const [key, value] of Object.entries(hardCap)) {
    let ceiling;
    let reason = '';
    if (typeof value === 'number') {
      ceiling = value;
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      ceiling = value.ceiling;
      reason = value.reason ?? '';
    }

    if (typeof ceiling !== 'number' || !Number.isInteger(ceiling) || ceiling < HARD_LIMIT) {
      throw new Error(`Invalid hard-cap ceiling for ${key} in ${allowlistFile}`);
    }
    if (typeof reason !== 'string') {
      throw new Error(`Invalid hard-cap reason for ${key} in ${allowlistFile}`);
    }
    out.set(normalizePathForOutput(key), { ceiling, reason: reason.trim() });
  }
  return out;
}

async function main() {
  const { enforceHardCap, rootDir, allowlistFile } = parseArgs(process.argv.slice(2));
  const files = await collectTsFiles(rootDir);
  const hardCapAllowlist = await loadAllowlist(allowlistFile);
  const rows = [];

  for (const filePath of files) {
    rows.push({
      path: toRootRelative(filePath, rootDir),
      lines: await countLines(filePath),
    });
  }

  rows.sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));

  const allowedHardBreaches = [];
  const hardViolations = [];
  for (const row of rows.filter((candidate) => candidate.lines > HARD_LIMIT)) {
    const entry = hardCapAllowlist.get(row.path);
    if (entry === undefined) {
      hardViolations.push({ ...row, kind: 'unallowlisted' });
      continue;
    }
    if (row.lines > entry.ceiling) {
      hardViolations.push({ ...row, kind: 'grew', ceiling: entry.ceiling });
      continue;
    }
    allowedHardBreaches.push({ ...row, ceiling: entry.ceiling, reason: entry.reason });
  }
  const reviewBreaches = rows.filter((row) => row.lines > REVIEW_TRIGGER && row.lines <= SOFT_LIMIT);
  const softBreaches = rows.filter((row) => row.lines > SOFT_LIMIT && row.lines <= HARD_LIMIT);

  if (
    allowedHardBreaches.length === 0 &&
    hardViolations.length === 0 &&
    softBreaches.length === 0 &&
    reviewBreaches.length === 0
  ) {
    console.log(
      `source-file-size-guard: ok (review ${REVIEW_TRIGGER}, soft ${SOFT_LIMIT}, hard ${HARD_LIMIT})`,
    );
    process.exit(0);
  }

  console.log(
    `source-file-size-guard: review>${REVIEW_TRIGGER}, soft>${SOFT_LIMIT}, hard>${HARD_LIMIT}`,
  );

  if (reviewBreaches.length > 0) {
    console.log('review-trigger warnings:');
    for (const row of reviewBreaches) {
      console.log(`- ${row.path}: ${row.lines}`);
    }
  }

  if (allowedHardBreaches.length > 0) {
    console.log('hard-cap breaches (allowlisted ceilings):');
    for (const row of allowedHardBreaches) {
      const reasonSuffix = row.reason ? `; reason: ${row.reason}` : '';
      console.log(`- ${row.path}: ${row.lines} (ceiling ${row.ceiling}${reasonSuffix})`);
    }
  }

  if (hardViolations.length > 0) {
    console.log('hard-cap violations:');
    for (const row of hardViolations) {
      if (row.kind === 'unallowlisted') {
        console.log(`- ${row.path}: ${row.lines} (not allowlisted)`);
        continue;
      }
      console.log(`- ${row.path}: ${row.lines} (ceiling ${row.ceiling})`);
    }
  }

  if (softBreaches.length > 0) {
    console.log('soft-limit warnings:');
    for (const row of softBreaches) {
      console.log(`- ${row.path}: ${row.lines}`);
    }
  }

  process.exit(enforceHardCap && hardViolations.length > 0 ? 1 : 0);
}

await main();
