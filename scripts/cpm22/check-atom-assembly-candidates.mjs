#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compile } from "@jhlagado/azm/compile";

import {
  assembleConvertedWithAtom,
  assembleProjectOwnedWithAtom,
  converted8080Candidates,
  projectOwnedCandidates,
} from "./atom-projection.mjs";

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

const expectedBlockers = Object.freeze({});

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

async function checkConverted8080Candidate(temporaryDirectory, candidate) {
  const azmSource = join(temporaryDirectory, `${candidate.name}.azm.asm`);
  const converted = spawnSync(
    process.execPath,
    [
      converter,
      join(thirdPartyDirectory, candidate.input),
      azmSource,
      candidate.origin,
      "azm",
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
  const azmBytes = await assembleAzm(azmSource);
  try {
    const atomBytes = await assembleConvertedWithAtom({
      repositoryRoot,
      thirdPartyDirectory,
      converter,
      temporaryDirectory,
      candidate,
      azmBytes,
    });
    return { name: candidate.name, status: "ready", bytes: atomBytes.length };
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
}

async function classifyProjectOwnedCandidate(candidate) {
  const name = typeof candidate === "string" ? candidate : candidate.name;
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "debug80-cpm22-project-owned-"),
  );
  try {
    const azmBytes = await assembleAzm(join(outputDirectory, name));
    const atomBytes = await assembleProjectOwnedWithAtom({
      outputDirectory,
      temporaryDirectory,
      candidate,
      azmBytes,
    });
    return { name, status: "ready", bytes: atomBytes.length };
  } catch (error) {
    return {
      name,
      status: "blocked",
      code: error.code ?? "unknown",
      message: error.message,
      line: error.diagnostic?.line,
      column: error.diagnostic?.column,
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
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

  for (const candidate of projectOwnedCandidates) {
    results.push(await classifyProjectOwnedCandidate(candidate));
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
