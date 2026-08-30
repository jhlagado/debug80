#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compile } from "@jhlagado/azm/compile";

import {
  assembleAtomProject,
  materializeAtomGeneration,
  translateAzmSourceToAtom,
} from "../../packages/atom/src/host/index.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..", "..");
const outputDirectory = join(
  repositoryRoot,
  "apps",
  "debug80-vscode",
  "roms",
  "cpm22",
);
const thirdPartyDirectory = join(repositoryRoot, "third_party", "cpm22");
const converter = join(scriptDirectory, "convert-8080-to-z80.mjs");

const converted8080Candidates = Object.freeze([
  { name: "ccp", input: "ccp.asm", origin: "$E400" },
  { name: "bdos", input: "bdos.asm", origin: "$EC00" },
]);

const projectOwnedCandidates = Object.freeze([
  "bootstrap.asm",
  "bios.asm",
  "smoke.asm",
  "editor.asm",
]);

const expectedBlockers = Object.freeze({
  "bdos": "forward-equate",
  "bios.asm": "symbol-length",
  "bootstrap.asm": "symbol-length",
  "ccp": "symbol-length",
  "editor.asm": "unsupported-directive",
  "smoke.asm": "symbol-length",
});

function fail(message) {
  throw new Error(message);
}

async function assembleAzm(source) {
  const result = await compile(source, {
    emitBin: true,
    emitHex: false,
    emitD8m: false,
    emitLst: false,
    registerContracts: "off",
  });
  const errors = result.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (errors.length !== 0) {
    fail(
      errors
        .map(
          (diagnostic) =>
            `${diagnostic.sourceName}:${diagnostic.line}:${diagnostic.column}: ${diagnostic.message}`,
        )
        .join("\n"),
    );
  }
  const binary = result.artifacts.find((artifact) => artifact.kind === "bin");
  if (binary?.kind !== "bin") fail(`AZM omitted binary for ${source}`);
  return binary.bytes;
}

async function assembleAtom(root, entry) {
  const result = await assembleAtomProject({
    root,
    entry,
    target: { start: 0, capacity: 0xffff },
    maxInstructions: 50_000_000,
    maxCycles: 500_000_000,
  });
  const base = result.generation.images.reduce(
    (minimum, image) => Math.min(minimum, image.address),
    0xffff,
  );
  return materializeAtomGeneration(result.generation, {
    base,
  }).bytes;
}

async function checkConverted8080Candidate(temporaryDirectory, candidate) {
  const azmSource = join(temporaryDirectory, `${candidate.name}.azm.asm`);
  const atomSource = join(temporaryDirectory, `${candidate.name}.atom.asm`);
  for (const [dialect, output] of [
    ["azm", azmSource],
    ["atom", atomSource],
  ]) {
    const converted = spawnSync(
      process.execPath,
      [
        converter,
        join(thirdPartyDirectory, candidate.input),
        output,
        candidate.origin,
        dialect,
      ],
      { cwd: repositoryRoot, encoding: "utf8" },
    );
    if (converted.status !== 0) {
      fail(
        converted.stderr ||
          converted.stdout ||
          `conversion failed for ${candidate.input}`,
      );
    }
  }
  try {
    translateAzmSourceToAtom(await readFile(atomSource, "utf8"), {
      sourceName: `${candidate.name}.atom.asm`,
    });
  } catch (error) {
    return {
      name: candidate.name,
      status: "blocked",
      code: error.code ?? "unknown",
      message: error.message,
      line: error.diagnostic?.line,
      column: error.diagnostic?.column,
    };
  }
  const [azmBytes, atomBytes] = await Promise.all([
    assembleAzm(azmSource),
    assembleAtom(temporaryDirectory, `${candidate.name}.atom.asm`),
  ]);
  if (
    azmBytes.length !== atomBytes.length ||
    azmBytes.some((byte, index) => byte !== atomBytes[index])
  ) {
    fail(`${candidate.name}: Atom output differs from AZM output`);
  }
  return { name: candidate.name, status: "ready", bytes: atomBytes.length };
}

async function classifyProjectOwnedCandidate(name) {
  const source = await readFile(join(outputDirectory, name), "utf8");
  try {
    translateAzmSourceToAtom(source, { sourceName: name });
    return { name, status: "unexpected-ready" };
  } catch (error) {
    return {
      name,
      status: "blocked",
      code: error.code ?? "unknown",
      message: error.message,
      line: error.diagnostic?.line,
      column: error.diagnostic?.column,
    };
  }
}

const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "debug80-cpm22-atom-candidates-"),
);
try {
  const results = [];
  for (const candidate of converted8080Candidates) {
    results.push(await checkConverted8080Candidate(temporaryDirectory, candidate));
  }

  for (const name of projectOwnedCandidates) {
    const result = await classifyProjectOwnedCandidate(name);
    results.push(result);
  }

  for (const result of results) {
    if (result.status === "ready") continue;
    if (result.status !== "blocked") {
      fail(`${result.name}: expected ready or blocked, got ${result.status}`);
    }
    if (result.code !== expectedBlockers[result.name]) {
      fail(`${result.name}: expected ${expectedBlockers[result.name]}, got ${result.code}`);
    }
  }

  process.stdout.write("CP/M Atom assembly candidates\n");
  for (const result of results.filter((result) => result.status === "ready")) {
    process.stdout.write(`ready\t${result.name}\t${result.bytes} bytes byte-identical\n`);
  }
  for (const result of results.filter((result) => result.status === "blocked")) {
    process.stdout.write(
      `blocked\t${result.name}\t${result.code}\t${result.line}:${result.column}\t${result.message}\n`,
    );
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
