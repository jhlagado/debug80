#!/usr/bin/env node
/**
 * Glimmer CLI.
 *
 *   glimmer <entry.glim> [-o output.asm] [--org <addr>]
 *
 * Compiles Glimmer meta-source to a generated AZM source file, ready for the
 * AZM assembler: `glimmer counter.glim && azm counter.main.asm`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

import { compileToAzm } from './index.js';
import { parseNumber } from './parse.js';

const require = createRequire(import.meta.url);

function usage(): string {
  return [
    'Usage: glimmer [options] <entry.glim>',
    '',
    'Options:',
    '  -o, --output <file>   Output AZM path (default: <entry>.main.asm, the Debug80 entry-point convention)',
    '  --org <addr>          Assembly origin, e.g. $4000 (default: $4000)',
    '  -V, --version         Print package version',
    '  -h, --help            Print this help',
  ].join('\n');
}

export function main(argv: string[]): number {
  let entry: string | null = null;
  let output: string | null = null;
  let org: number | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg === '-h' || arg === '--help') {
      console.log(usage());
      return 0;
    }
    if (arg === '-V' || arg === '--version') {
      const pkg = require('../../package.json') as { version: string };
      console.log(pkg.version);
      return 0;
    }
    if (arg === '-o' || arg === '--output') {
      output = argv[++i] ?? null;
      if (output === null) {
        console.error('Missing value for --output.');
        return 1;
      }
      continue;
    }
    if (arg === '--org') {
      const value = argv[++i];
      const parsed = value === undefined ? null : parseNumber(value);
      if (parsed === null) {
        console.error(`Invalid --org value: ${value ?? '(missing)'}.`);
        return 1;
      }
      org = parsed;
      continue;
    }
    if (arg.startsWith('-')) {
      console.error(`Unknown option: ${arg}\n\n${usage()}`);
      return 1;
    }
    if (entry !== null) {
      console.error('Only one entry file is supported.');
      return 1;
    }
    entry = arg;
  }

  if (entry === null) {
    console.error(usage());
    return 1;
  }

  let source: string;
  try {
    source = readFileSync(entry, 'utf8');
  } catch (cause) {
    console.error(`Cannot read ${entry}: ${(cause as Error).message}`);
    return 1;
  }

  const result = compileToAzm(source, org === undefined ? {} : { org });
  if (result.source === null) {
    for (const diagnostic of result.diagnostics) {
      const where = diagnostic.line > 0 ? `${entry}:${diagnostic.line}` : entry;
      console.error(`${where}: ${diagnostic.message}`);
    }
    return 1;
  }

  // Debug80 recognizes entry points named main.asm or <name>.main.asm;
  // the generated file is a program entry, so it follows the convention.
  const outPath =
    output ??
    path.join(path.dirname(entry), `${path.basename(entry, path.extname(entry))}.main.asm`);
  writeFileSync(outPath, result.source);
  console.log(`Wrote ${outPath}`);
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  process.exit(main(process.argv.slice(2)));
}
