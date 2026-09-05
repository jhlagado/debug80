#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const inventoryPath = path.join(
  "docs",
  "specifications",
  "azm-direct-dependency-inventory.json",
);

const ignoredDirectories = new Set([
  ".git",
  ".worktrees",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

const scannedExtensions = new Set([".js", ".mjs", ".ts", ".mts", ".cts"]);
const azmImportPattern = /(?:from\s+|import\s*\(|require\.resolve\s*\()\s*["']@jhlagado\/azm(?:\/(?:compile|package\.json))?["']/;

async function findSourceFiles(directory, result = []) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        await findSourceFiles(child, result);
      }
    } else if (entry.isFile() && scannedExtensions.has(path.extname(entry.name))) {
      result.push(child);
    }
  }
  return result;
}

function isAzmPackageSelfReference(file) {
  return file.startsWith(`packages${path.sep}azm${path.sep}`);
}

async function directAzmImports(root) {
  const files = await findSourceFiles(root);
  const imports = [];
  for (const absoluteFile of files) {
    const relativeFile = path.relative(root, absoluteFile);
    if (isAzmPackageSelfReference(relativeFile)) continue;
    const text = await fs.readFile(absoluteFile, "utf8");
    if (azmImportPattern.test(text)) {
      imports.push(relativeFile.split(path.sep).join("/"));
    }
  }
  return imports.sort();
}

function validateInventoryEntry(entry, index) {
  const prefix = `${inventoryPath} imports[${index}]`;
  const failures = [];
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    return [`${prefix} must be an object`];
  }
  for (const field of ["file", "classification", "owner", "retirement"]) {
    if (typeof entry[field] !== "string" || entry[field].trim() === "") {
      failures.push(`${prefix}.${field} must be a non-empty string`);
    }
  }
  const allowedClassifications = new Set([
    "azm-backend",
    "azm-headless-integration",
    "atom-oracle",
    "archived-tooling",
    "nucleus-proof-comparison",
    "nucleus-runtime-fallback",
    "cpm22-development-tooling",
  ]);
  if (
    typeof entry.classification === "string" &&
    !allowedClassifications.has(entry.classification)
  ) {
    failures.push(
      `${prefix}.classification must be one of ${[...allowedClassifications].join(", ")}`,
    );
  }
  return failures;
}

const root = process.cwd();
const failures = [];
const inventory = JSON.parse(
  await fs.readFile(path.join(root, inventoryPath), "utf8"),
);

if (
  inventory.schema !== "debug80-azm-direct-dependency-inventory/v1" ||
  !Array.isArray(inventory.imports)
) {
  failures.push(
    `${inventoryPath} must use debug80-azm-direct-dependency-inventory/v1`,
  );
} else {
  const discovered = new Set(await directAzmImports(root));
  const inventoried = new Set();
  inventory.imports.forEach((entry, index) => {
    failures.push(...validateInventoryEntry(entry, index));
    if (typeof entry?.file !== "string") return;
    if (inventoried.has(entry.file)) {
      failures.push(`${inventoryPath} repeats ${entry.file}`);
    }
    inventoried.add(entry.file);
    if (!discovered.has(entry.file)) {
      failures.push(`${inventoryPath} has stale AZM import ${entry.file}`);
    }
  });
  for (const file of discovered) {
    if (!inventoried.has(file)) {
      failures.push(`${file} imports AZM without inventory classification`);
    }
  }
}

if (failures.length !== 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `All direct AZM imports outside packages/azm are inventoried; ${inventory.imports.length} compatibility paths classified.\n`,
  );
}
