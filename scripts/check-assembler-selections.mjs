#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  normalizeZ80AssemblerFlavour,
  Z80_ASSEMBLER_FLAVOUR,
} from "@jhlagado/z80-tool-services";

const ignoredDirectories = new Set([
  ".git",
  ".worktrees",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);
const assemblyExtensions = new Set([".asm", ".inc", ".z80"]);
const retirementInventoryPath = path.join(
  "docs",
  "specifications",
  "azm-retirement-inventory.json",
);

async function findProjectFiles(directory, result = []) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        await findProjectFiles(path.join(directory, entry.name), result);
      }
    } else if (entry.isFile() && entry.name === "debug80.json") {
      result.push(path.join(directory, entry.name));
    }
  }
  return result;
}

function assemblyTargets(project) {
  const targets = project.targets;
  if (
    targets !== null &&
    typeof targets === "object" &&
    !Array.isArray(targets)
  ) {
    return Object.entries(targets);
  }
  return [["<root>", project]];
}

function normalizeConcreteAssembler(value) {
  try {
    return normalizeZ80AssemblerFlavour(value, { allowAuto: false });
  } catch {
    return undefined;
  }
}

const root = process.cwd();
const failures = [];
const selectedAzmTargets = new Set();
for (const filename of await findProjectFiles(root)) {
  const project = JSON.parse(await fs.readFile(filename, "utf8"));
  for (const [targetName, target] of assemblyTargets(project)) {
    if (target === null || typeof target !== "object" || Array.isArray(target))
      continue;
    const source = target.sourceFile ?? target.asm;
    if (typeof source !== "string") {
      continue;
    }
    const extension = path.extname(source).toLowerCase();
    const targetAssembler = target.assembler;
    const assemblyAssembler = normalizeConcreteAssembler(targetAssembler);
    if (assemblyExtensions.has(extension) && assemblyAssembler === undefined) {
      failures.push(
        `${path.relative(root, filename)} target ${targetName} must select assembler \"atom\" or \"azm\"`,
      );
    } else if (assemblyExtensions.has(extension) && assemblyAssembler === Z80_ASSEMBLER_FLAVOUR.azm) {
      selectedAzmTargets.add(`${path.relative(root, filename)}#${targetName}`);
    }
  }
}

const inventory = JSON.parse(
  await fs.readFile(path.join(root, retirementInventoryPath), "utf8"),
);
if (
  inventory.schema !== "debug80-azm-retirement/v1" ||
  !Array.isArray(inventory.targets)
) {
  failures.push(
    `${retirementInventoryPath} must use debug80-azm-retirement/v1`,
  );
} else {
  const inventoried = new Set();
  for (const entry of inventory.targets) {
    const key = `${entry.project}#${entry.target}`;
    if (
      typeof entry.project !== "string" ||
      typeof entry.target !== "string" ||
      typeof entry.blocker !== "string" ||
      entry.blocker.trim() === ""
    ) {
      failures.push(
        `${retirementInventoryPath} has an invalid entry for ${key}`,
      );
      continue;
    }
    if (inventoried.has(key)) {
      failures.push(`${retirementInventoryPath} repeats ${key}`);
    }
    inventoried.add(key);
    if (!selectedAzmTargets.has(key)) {
      failures.push(`${retirementInventoryPath} has stale AZM target ${key}`);
    }
  }
  for (const key of selectedAzmTargets) {
    if (!inventoried.has(key)) {
      failures.push(`${key} selects AZM without a retirement blocker`);
    }
  }
}

if (failures.length !== 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `All checked-in assembly targets select a backend; ${selectedAzmTargets.size} AZM targets have explicit retirement blockers.\n`,
  );
}
