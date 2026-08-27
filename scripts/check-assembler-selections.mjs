#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

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
const assemblyBackends = new Set(["atom", "azm"]);

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
  if (targets !== null && typeof targets === "object" && !Array.isArray(targets)) {
    return Object.entries(targets);
  }
  return [["<root>", project]];
}

const root = process.cwd();
const failures = [];
for (const filename of await findProjectFiles(root)) {
  const project = JSON.parse(await fs.readFile(filename, "utf8"));
  for (const [targetName, target] of assemblyTargets(project)) {
    if (target === null || typeof target !== "object" || Array.isArray(target)) continue;
    const source = target.sourceFile ?? target.asm;
    if (typeof source !== "string" || !assemblyExtensions.has(path.extname(source).toLowerCase())) {
      continue;
    }
    const assembler = typeof target.assembler === "string" ? target.assembler.toLowerCase() : "";
    if (!assemblyBackends.has(assembler)) {
      failures.push(
        `${path.relative(root, filename)} target ${targetName} must select assembler \"atom\" or \"azm\"`,
      );
    }
  }
}

if (failures.length !== 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("All checked-in assembly targets select Atom or AZM explicitly.\n");
}
