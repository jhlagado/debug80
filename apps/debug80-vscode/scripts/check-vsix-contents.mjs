#!/usr/bin/env node
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { removeStage, stageExtension } from './stage-extension.mjs';

const REQUIRED_ENTRIES = [
  { label: 'out/', matches: hasTopLevelDirectory('out') },
  { label: 'resources/', matches: hasTopLevelDirectory('resources') },
  { label: 'roms/', matches: hasTopLevelDirectory('roms') },
  { label: 'schemas/', matches: hasTopLevelDirectory('schemas') },
  { label: 'language-configuration/', matches: hasTopLevelDirectory('language-configuration') },
  { label: 'syntaxes/', matches: hasTopLevelDirectory('syntaxes') },
  { label: 'assets/native-core.json', matches: (entry) => entry === 'assets/native-core.json' },
  { label: 'README.md', matches: (entry) => entry === 'README.md' },
  {
    label: 'LICENSE.txt',
    matches: (entry) => entry === 'LICENSE.txt' || entry === 'LICENSE',
  },
  { label: 'THIRD_PARTY_NOTICES.md', matches: (entry) => entry === 'THIRD_PARTY_NOTICES.md' },
];

const ALLOWED_TOP_LEVEL_ENTRIES = new Set([
  'CHANGELOG.md',
  'LICENSE',
  'LICENSE.txt',
  'README.md',
  'SUPPORT.md',
  'THIRD_PARTY_NOTICES.md',
  'assets',
  'language-configuration',
  'null-language.json',
  'out',
  'package.json',
  'resources',
  'roms',
  'schemas',
  'syntaxes',
  'tec-1g.CoolTermSettings',
]);

const FORBIDDEN_TOP_LEVEL_ENTRIES = new Set([
  'build',
  'coverage',
  'docs',
  'scripts',
  'src',
  'test',
  'tests',
  'webview',
]);

const ATOM_CORE_SYMBOLS = [
  'AtomAssemble',
  'AtomHostResidentEnd',
  'AtomSinkBegin',
  'AtomSinkImageByte',
  'AtomSinkPatchByte',
  'AtomSinkPatchWord',
  'AtomSinkCommit',
  'AtomSinkAbort',
  'AtomSourceReadByte',
];

function hasTopLevelDirectory(directory) {
  return (entry) => entry === directory || entry.startsWith(`${directory}/`);
}

function runVsceLs(cwd) {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(command, ['vsce', 'ls', '--no-dependencies'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    const message = stderr ? `\n${stderr}` : '';
    throw new Error(`npx vsce ls failed with exit code ${result.status}.${message}`);
  }

  return result.stdout;
}

function normalizeEntries(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function verifyEntries(entries) {
  const missingRequired = REQUIRED_ENTRIES.filter(
    (required) => !entries.some((entry) => required.matches(entry))
  ).map((required) => required.label);

  const forbiddenEntries = entries.filter((entry) => {
    const topLevel = entry.split('/', 1)[0];
    return (
      topLevel === undefined ||
      FORBIDDEN_TOP_LEVEL_ENTRIES.has(topLevel) ||
      !ALLOWED_TOP_LEVEL_ENTRIES.has(topLevel)
    );
  });

  return { missingRequired, forbiddenEntries };
}

function printFailure({ missingRequired, forbiddenEntries }) {
  console.error('VSIX contents verification failed.');

  if (missingRequired.length > 0) {
    console.error('\nMissing required packaged entries:');
    for (const missing of missingRequired) {
      console.error(`  - ${missing}`);
    }
  }

  if (forbiddenEntries.length > 0) {
    console.error('\nForbidden top-level entries included in package:');
    for (const entry of forbiddenEntries) {
      console.error(`  - ${entry}`);
    }
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function verifyBundledAtomRuntime(stage) {
  const extensionBundlePath = path.join(stage, 'out', 'extension', 'extension.js');
  const nativeCorePath = path.resolve(
    path.dirname(extensionBundlePath),
    '..',
    '..',
    'assets',
    'native-core.json'
  );
  const bundle = fs.readFileSync(extensionBundlePath, 'utf8');
  const failures = [];

  if (!bundle.includes('return await Promise.resolve().then(function () { return index; });')) {
    failures.push('Atom compiler API is not bundled into the extension output');
  }
  if (bundle.includes('import("atom-z80")') || bundle.includes("import('atom-z80')")) {
    failures.push('extension output still contains a runtime import of atom-z80');
  }
  if (!bundle.includes('new URL("../../assets/native-core.json", import.meta.url)')) {
    failures.push('bundled Atom native runner does not resolve assets/native-core.json');
  }

  let core;
  try {
    core = readJson(nativeCorePath);
  } catch (error) {
    failures.push(`Atom native core asset cannot be read: ${error.message}`);
  }
  if (core !== undefined) {
    if (core.format !== 'atom-native-core' || core.version !== 1) {
      failures.push('Atom native core asset has an unsupported format');
    }
    if (typeof core.hexText !== 'string') {
      failures.push('Atom native core asset omits hexText');
    } else if (
      createHash('sha256').update(core.hexText, 'utf8').digest('hex') !== core.hexSha256
    ) {
      failures.push('Atom native core HEX digest does not match');
    }
    const symbols = core.symbols;
    if (symbols === null || typeof symbols !== 'object' || Array.isArray(symbols)) {
      failures.push('Atom native core asset omits symbols');
    } else {
      for (const name of ATOM_CORE_SYMBOLS) {
        if (!Number.isInteger(symbols[name])) {
          failures.push(`Atom native core asset omits ${name}`);
        }
      }
      if (Number.isInteger(symbols.AtomHostResidentEnd) && symbols.AtomHostResidentEnd > 0x4000) {
        failures.push('Atom native core exceeds the one-bank resident limit');
      }
    }
  }

  return failures;
}

function main() {
  const stage = stageExtension();
  let entries;
  let bundledAtomFailures = [];
  try {
    entries = normalizeEntries(runVsceLs(stage));
    bundledAtomFailures = verifyBundledAtomRuntime(stage);
  } finally {
    removeStage(stage);
  }
  const result = verifyEntries(entries);

  if (
    result.missingRequired.length > 0 ||
    result.forbiddenEntries.length > 0 ||
    bundledAtomFailures.length > 0
  ) {
    printFailure(result);
    if (bundledAtomFailures.length > 0) {
      console.error('\nBundled Atom runtime verification failed:');
      for (const failure of bundledAtomFailures) {
        console.error(`  - ${failure}`);
      }
    }
    process.exitCode = 1;
    return;
  }

  console.log(`VSIX contents verification passed (${entries.length} packaged entries checked).`);
}

main();
