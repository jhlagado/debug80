#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');

const REQUIRED_ENTRIES = [
  {
    label: 'node_modules/asm80/',
    matches: (entry) => entry === 'node_modules/asm80' || entry.startsWith('node_modules/asm80/'),
  },
  {
    label: 'node_modules/@jhlagado/zax/',
    matches: (entry) =>
      entry === 'node_modules/@jhlagado/zax' || entry.startsWith('node_modules/@jhlagado/zax/'),
  },
  { label: 'out/', matches: hasTopLevelDirectory('out') },
  { label: 'resources/', matches: hasTopLevelDirectory('resources') },
  { label: 'roms/', matches: hasTopLevelDirectory('roms') },
  { label: 'schemas/', matches: hasTopLevelDirectory('schemas') },
  { label: 'language-configuration/', matches: hasTopLevelDirectory('language-configuration') },
  { label: 'syntaxes/', matches: hasTopLevelDirectory('syntaxes') },
  { label: 'README.md', matches: (entry) => entry === 'README.md' },
  {
    label: 'LICENSE.txt',
    matches: (entry) => entry === 'LICENSE.txt' || entry === 'LICENSE',
  },
  { label: 'THIRD_PARTY_NOTICES.md', matches: (entry) => entry === 'THIRD_PARTY_NOTICES.md' },
];

const FORBIDDEN_TOP_LEVEL_ENTRIES = [
  'src',
  'tests',
  'docs',
  'coverage',
  '.fallow',
  '.claude',
  '.cursor',
  '.github',
  '.vscode',
];

function hasTopLevelDirectory(directory) {
  return (entry) => entry === directory || entry.startsWith(`${directory}/`);
}

function runVsceLs() {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(command, ['vsce', 'ls'], {
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
    (required) => !entries.some((entry) => required.matches(entry)),
  ).map((required) => required.label);

  const forbiddenEntries = entries.filter((entry) =>
    FORBIDDEN_TOP_LEVEL_ENTRIES.some(
      (forbidden) => entry === forbidden || entry.startsWith(`${forbidden}/`),
    ),
  );

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

function main() {
  const entries = normalizeEntries(runVsceLs());
  const result = verifyEntries(entries);

  if (result.missingRequired.length > 0 || result.forbiddenEntries.length > 0) {
    printFailure(result);
    process.exitCode = 1;
    return;
  }

  console.log(`VSIX contents verification passed (${entries.length} packaged entries checked).`);
}

main();
