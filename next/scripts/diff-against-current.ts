#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { compareRunResults } from '../test/differential/compare-results.js';
import { runCurrentAzmSource } from '../test/differential/current-azm-runner.js';
import { runNextAzmSource } from '../test/differential/next-azm-runner.js';

const DEFAULT_FIXTURES_DIR = 'next/test/differential/fixtures';
const KNOWN_UNSUPPORTED_FIXTURES = new Set(['enum_and_storage.asm']);

type ArgState = {
  fixturesDir: string;
  explicitFiles: string[];
  includeFilters: Set<string>;
  skipUnsupported: boolean;
  showHelp: boolean;
};

function parseArgs(argv: string[]): ArgState {
  const state: ArgState = {
    fixturesDir: DEFAULT_FIXTURES_DIR,
    explicitFiles: [],
    includeFilters: new Set(),
    skipUnsupported: false,
    showHelp: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      state.showHelp = true;
      break;
    }
    if (arg === '--fixtures-dir') {
      index += 1;
      const value = argv[index];
      if (!value) {
        throw new Error('--fixtures-dir requires a path');
      }
      state.fixturesDir = value;
      continue;
    }
    if (arg === '--include') {
      index += 1;
      const value = argv[index];
      if (!value) {
        throw new Error('--include requires a fixture file name');
      }
      state.includeFilters.add(value);
      continue;
    }
    if (arg === '--skip-unsupported') {
      state.skipUnsupported = true;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`unknown option: ${arg}`);
    }
    state.explicitFiles.push(arg);
  }

  return state;
}

function printUsage(): void {
  console.log(`Usage:
node next/scripts/diff-against-current.mjs [--fixtures-dir <path>] [--include <file> ...] [--skip-unsupported] [<fixture-file> ...]

Options:
  --fixtures-dir <path>   Directory containing .asm fixtures (default: ${DEFAULT_FIXTURES_DIR})
  --include <file>        Include fixture files explicitly (can repeat)
  --skip-unsupported      Skip known intentionally unsupported fixtures instead of failing
  -h, --help             Show this message`);
}

let state: ArgState;
try {
  state = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  printUsage();
  process.exit(1);
}

if (state.showHelp) {
  printUsage();
  process.exit(0);
}

const fixtureDir = path.resolve(process.cwd(), state.fixturesDir);

async function main(): Promise<void> {
  const fixtureNames = state.explicitFiles.length > 0 ? state.explicitFiles : await readdir(fixtureDir);
  const selected = fixtureNames
    .filter((name) => name.toLowerCase().endsWith('.asm'))
    .filter((name) =>
      state.includeFilters.size === 0 ? true : state.includeFilters.has(name),
    )
    .filter((name) => {
      if (!KNOWN_UNSUPPORTED_FIXTURES.has(name)) {
        return true;
      }
      if (!state.skipUnsupported) {
        throw new Error(
          `fixture ${name} is known-unsupported and not included in this script slice. ` +
            'Run with --skip-unsupported to bypass or remove the fixture from scope.',
        );
      }
      return false;
    });

  if (selected.length === 0) {
    console.error('No fixture files selected for differential sweep.');
    process.exit(1);
  }

  let failures = 0;
  for (const file of selected.sort()) {
    const filePath = path.resolve(fixtureDir, file);
    const source = await readFile(filePath, 'utf8');
    const current = await runCurrentAzmSource(source);
    const next = runNextAzmSource(source);
    const differences = compareRunResults(current, next);

    if (differences.length === 0) {
      console.log(`PASS ${file}`);
      continue;
    }

    failures += 1;
    console.error(`FAIL ${file}`);
    for (const diff of differences) {
      console.error(`  field=${diff.field}`);
      console.error(`    expected: ${diff.expected}`);
      console.error(`    actual:   ${diff.actual}`);
    }
  }

  if (failures === 0) {
    console.log(`Differential sweep passed for ${selected.length} fixture(s).`);
    return;
  }

  console.error(`Differential sweep failed: ${failures} fixture(s) mismatched.`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
