#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const REVIEW_TRIGGER = 500;
const SOFT_LIMIT = 750;
const HARD_LIMIT = 1000;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_ROOTS = [
  "apps/debug80-vscode/src",
  "apps/debug80-vscode/webview",
  "packages/azm/src",
  "packages/debug80-runtime/src",
  "packages/glimmer/src",
];
const DEFAULT_ALLOWLIST_FILE = path.resolve(
  SCRIPT_DIR,
  "source-file-size-allowlist.json",
);

// Policy:
// - files over the review trigger are always reported for review attention
// - files over the soft limit are elevated warnings
// - files over the hard cap must either be absent or pinned in the allowlist
// - allowlisted files may not grow past their recorded ceiling and must carry a reason

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function parseArgs(argv) {
  const options = {
    enforceHardCap: false,
    rootDirs: [],
    allowlistFile: DEFAULT_ALLOWLIST_FILE,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--enforce-hard-cap") {
      options.enforceHardCap = true;
      continue;
    }
    if (arg === "--root") {
      options.rootDirs.push(resolveRequiredArg(argv, ++i, "--root"));
      continue;
    }
    if (arg === "--allowlist-file") {
      options.allowlistFile = resolveRequiredArg(argv, ++i, "--allowlist-file");
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.rootDirs.length === 0) {
    options.rootDirs = DEFAULT_ROOTS.map((rootDir) =>
      path.resolve(REPO_ROOT, rootDir),
    );
  }
  return options;
}

function resolveRequiredArg(argv, index, flag) {
  const value = argv[index];
  if (!value) {
    throw new Error(`${flag} requires a path argument`);
  }
  return path.resolve(process.cwd(), value);
}

async function collectSourceFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const childPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        return collectSourceFiles(childPath);
      }
      return entry.isFile() && /\.tsx?$/.test(entry.name) ? [childPath] : [];
    }),
  );
  return nested.flat();
}

async function countLines(filePath) {
  const text = await readFile(filePath, "utf8");
  return text.length === 0
    ? 0
    : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

function toRepoRelative(filePath) {
  return normalizePath(
    path.relative(REPO_ROOT, filePath) || path.basename(filePath),
  );
}

async function loadAllowlist(allowlistFile) {
  const raw = await readFile(allowlistFile, "utf8");
  const parsed = JSON.parse(raw);
  const hardCap = parsed?.hardCap;
  if (
    hardCap === null ||
    typeof hardCap !== "object" ||
    Array.isArray(hardCap)
  ) {
    throw new Error(`Invalid hardCap map in ${allowlistFile}`);
  }

  const entries = new Map();
  for (const [key, value] of Object.entries(hardCap)) {
    assertAllowlistEntry(key, value, allowlistFile);
    entries.set(normalizePath(key), {
      ceiling: value.ceiling,
      reason: value.reason.trim(),
    });
  }
  return entries;
}

function assertAllowlistEntry(key, value, allowlistFile) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid hard-cap entry for ${key} in ${allowlistFile}`);
  }
  if (!Number.isInteger(value.ceiling) || value.ceiling < HARD_LIMIT) {
    throw new Error(`Invalid hard-cap ceiling for ${key} in ${allowlistFile}`);
  }
  if (typeof value.reason !== "string" || value.reason.trim().length === 0) {
    throw new Error(`Invalid hard-cap reason for ${key} in ${allowlistFile}`);
  }
}

async function collectFileSizeRows(rootDirs) {
  const files = (
    await Promise.all(rootDirs.map((rootDir) => collectSourceFiles(rootDir)))
  ).flat();
  const rows = await Promise.all(
    files.map(async (filePath) => ({
      path: toRepoRelative(filePath),
      lines: await countLines(filePath),
    })),
  );
  return rows.sort(
    (left, right) =>
      right.lines - left.lines || left.path.localeCompare(right.path),
  );
}

function classifySizeBreaches(rows, hardCapAllowlist) {
  const allowedHardBreaches = [];
  const hardViolations = [];
  for (const row of rows.filter((candidate) => candidate.lines > HARD_LIMIT)) {
    const entry = hardCapAllowlist.get(row.path);
    if (entry === undefined) {
      hardViolations.push({ ...row, kind: "unallowlisted" });
    } else if (row.lines > entry.ceiling) {
      hardViolations.push({ ...row, kind: "grew", ceiling: entry.ceiling });
    } else {
      allowedHardBreaches.push({ ...row, ...entry });
    }
  }
  return {
    allowedHardBreaches,
    hardViolations,
    softBreaches: rows.filter(
      (row) => row.lines > SOFT_LIMIT && row.lines <= HARD_LIMIT,
    ),
    reviewBreaches: rows.filter(
      (row) => row.lines > REVIEW_TRIGGER && row.lines <= SOFT_LIMIT,
    ),
  };
}

function printRows(title, rows, formatRow) {
  if (rows.length === 0) return;
  console.log(`${title}:`);
  for (const row of rows) console.log(`- ${formatRow(row)}`);
}

function printSizeReport(breaches) {
  const total = Object.values(breaches).reduce(
    (count, rows) => count + rows.length,
    0,
  );
  if (total === 0) {
    console.log(
      `source-file-size-guard: ok (review ${REVIEW_TRIGGER}, soft ${SOFT_LIMIT}, hard ${HARD_LIMIT})`,
    );
    return;
  }

  console.log(
    `source-file-size-guard: review>${REVIEW_TRIGGER}, soft>${SOFT_LIMIT}, hard>${HARD_LIMIT}`,
  );
  printRows(
    "review-trigger warnings",
    breaches.reviewBreaches,
    (row) => `${row.path}: ${row.lines}`,
  );
  printRows(
    "soft-limit warnings",
    breaches.softBreaches,
    (row) => `${row.path}: ${row.lines}`,
  );
  printRows(
    "hard-cap breaches (allowlisted ceilings)",
    breaches.allowedHardBreaches,
    (row) =>
      `${row.path}: ${row.lines} (ceiling ${row.ceiling}; reason: ${row.reason})`,
  );
  printRows("hard-cap violations", breaches.hardViolations, (row) =>
    row.kind === "unallowlisted"
      ? `${row.path}: ${row.lines} (not allowlisted)`
      : `${row.path}: ${row.lines} (ceiling ${row.ceiling})`,
  );
}

async function main() {
  const { enforceHardCap, rootDirs, allowlistFile } = parseArgs(
    process.argv.slice(2),
  );
  const rows = await collectFileSizeRows(rootDirs);
  const hardCapAllowlist = await loadAllowlist(allowlistFile);
  const breaches = classifySizeBreaches(rows, hardCapAllowlist);
  printSizeReport(breaches);
  process.exit(enforceHardCap && breaches.hardViolations.length > 0 ? 1 : 0);
}

await main();
