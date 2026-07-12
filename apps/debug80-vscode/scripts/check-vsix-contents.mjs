#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

import { removeStage, stageExtension } from './stage-extension.mjs';

const REQUIRED_ENTRIES = [
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

function main() {
  const stage = stageExtension();
  let entries;
  try {
    entries = normalizeEntries(runVsceLs(stage));
  } finally {
    removeStage(stage);
  }
  const result = verifyEntries(entries);

  if (result.missingRequired.length > 0 || result.forbiddenEntries.length > 0) {
    printFailure(result);
    process.exitCode = 1;
    return;
  }

  console.log(`VSIX contents verification passed (${entries.length} packaged entries checked).`);
}

main();
