#!/usr/bin/env node

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SOURCE_EXTENSIONS = new Set(['.asm', '.z80']);
const CONTRACT_KEYS = ['in', 'out', 'maybe-out', 'clobbers', 'preserves'];
const CONTRACT_CARRIERS = new Set(
  'A B C D E H L AF BC DE HL IX IY IXH IXL IYH IYL SP SPH SPL F carry zero Z sign S parity PV P/V halfCarry HFLAG'
    .split(' ')
    .map((value) => value.toLowerCase()),
);
const EXCLUDED_DIRECTORIES = new Set(['node_modules', 'build', 'dist', 'coverage', 'out']);
const FINDING_KINDS = new Set([
  'definite_contract_violation',
  'flag_lifetime_risk',
  'missing_callee_contract',
  'unknown_control_flow',
  'external_interface_unknown',
  'output_candidate',
]);

function quotedReason(reason) {
  return `"${reason.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function legacyCommentPayload(line) {
  const match = /^(\s*);\s*!\s*(.*?)\s*$/u.exec(line);
  if (!match) return undefined;
  const payload = match[2] ?? '';
  return /^(?:in|out|maybe-out|clobbers|preserves|contracts|rc-ignore-next|extern|end)\b/iu.test(
    payload,
  )
    ? { indent: match[1] ?? '', payload }
    : undefined;
}

function parseContractPayload(payload) {
  const clauses = [];
  for (const rawClause of payload.split(';')) {
    const clause = rawClause.trim();
    const match = /^(in|out|maybe-out|clobbers|preserves)\s+(.+)$/iu.exec(clause);
    if (!match) return { error: `unsupported legacy contract: ${clause}` };
    const carriers = match[2].trim();
    if (/^\{[^}]+\}\s+\S/u.test(carriers)) {
      return { error: 'named outputs are not supported by AZM 0.3 .routine contracts' };
    }
    const tokens = carrierTokens(carriers);
    if (
      tokens === undefined ||
      tokens.some((token) => !CONTRACT_CARRIERS.has(token.toLowerCase()))
    ) {
      return { error: `invalid register carrier list: ${carriers}` };
    }
    clauses.push({ key: match[1].toLowerCase(), carriers: tokens.join(',') });
  }
  return { clauses };
}

function carrierTokens(carriers) {
  const match = /^\{([^}]+)\}$/u.exec(carriers);
  const payload = match ? match[1] : carriers;
  if (carriers.startsWith('{') !== carriers.endsWith('}')) return undefined;
  const tokens = match
    ? payload.split(',').map((token) => token.trim())
    : payload
        .trim()
        .split(/(?:\s*,\s*|\s+)/u)
        .map((token) => token.trim());
  return tokens.length > 0 && tokens.every(Boolean) ? tokens : undefined;
}

function renderContract(clauses) {
  const ordered = [];
  for (const key of CONTRACT_KEYS) {
    for (const clause of clauses) {
      if (clause.key === key) ordered.push(`${key} ${clause.carriers}`);
    }
  }
  return `.routine${ordered.length > 0 ? ` ${ordered.join(' ')}` : ''}`;
}

function directLegacyDirective(indent, payload) {
  const removedInterfaceForm = /^(extern|end)\b/iu.exec(payload);
  if (removedInterfaceForm) {
    return {
      error: `legacy ;! ${removedInterfaceForm[1].toLowerCase()} requires manual migration to an .asmi interface`,
    };
  }
  const policy = /^contracts\s+(strict|audit|off)$/iu.exec(payload);
  if (policy) return { text: `${indent}.contracts ${policy[1].toLowerCase()}` };

  const suppression = /^rc-ignore-next\s+(\S+)\s*:\s*(.+)$/iu.exec(payload);
  if (suppression) {
    const findingKind = suppression[1];
    return FINDING_KINDS.has(findingKind)
      ? { text: `${indent}.rcignore ${findingKind} ${quotedReason(suppression[2].trim())}` }
      : { error: `unknown register-contract finding kind: ${findingKind}` };
  }
  return undefined;
}

function expectOutDirective(line) {
  const match = /^(\s*);\s*expects\s+out\s+(.+?)\s*$/iu.exec(line);
  if (!match) return undefined;
  const carriers = (match[2] ?? '').trim();
  const tokens = carrierTokens(carriers);
  return tokens !== undefined && tokens.every((token) => CONTRACT_CARRIERS.has(token.toLowerCase()))
    ? { text: `${match[1] ?? ''}.expectout ${tokens.join(',')}` }
    : { error: `invalid .expectout carrier list: ${carriers}` };
}

function declarationLabel(line) {
  return /^(\s*)(@?)([A-Za-z_][A-Za-z0-9_]*):(.*)$/u.exec(line);
}

export function migrateAzm03Source(source, options = {}) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const hadFinalNewline = source.endsWith('\n');
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  if (hadFinalNewline) lines.pop();

  const output = [];
  const diagnostics = [];
  let pending;
  let routinePending = false;
  let invalidLegacyContractPending = false;

  function flushPendingUnchanged() {
    if (!pending) return;
    output.push(...pending.originals, ...pending.gap);
    pending = undefined;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (/^\s*\.routine(?:\s|;|$)/iu.test(line)) {
      flushPendingUnchanged();
      output.push(line);
      routinePending = true;
      continue;
    }
    if (routinePending && /^\s*\.[A-Za-z]/u.test(line)) {
      output.push(line);
      continue;
    }
    const legacy = legacyCommentPayload(line);
    if (legacy) {
      const direct = directLegacyDirective(legacy.indent, legacy.payload);
      if (direct !== undefined) {
        flushPendingUnchanged();
        if (direct.error !== undefined) {
          diagnostics.push({ line: index + 1, message: direct.error });
          output.push(line);
          invalidLegacyContractPending = true;
        } else {
          output.push(direct.text);
        }
        continue;
      }
      const parsed = parseContractPayload(legacy.payload);
      if (parsed.error !== undefined) {
        flushPendingUnchanged();
        diagnostics.push({
          line: index + 1,
          message: parsed.error,
        });
        output.push(line);
        invalidLegacyContractPending = true;
        continue;
      }
      pending ??= { indent: legacy.indent, clauses: [], originals: [], gap: [] };
      pending.clauses.push(...parsed.clauses);
      pending.originals.push(line);
      continue;
    }

    if (pending && (/^\s*$/u.test(line) || /^\s*;/u.test(line))) {
      pending.gap.push(line);
      continue;
    }

    if (routinePending && (/^\s*$/u.test(line) || /^\s*;/u.test(line))) {
      output.push(line);
      continue;
    }

    const label = declarationLabel(line);
    if (label) {
      const indent = label[1] ?? '';
      const exportMarker = label[2] ?? '';
      const name = label[3] ?? '';
      if (exportMarker === '@' && name.startsWith('_')) {
        diagnostics.push({
          line: index + 1,
          message: `cannot migrate contradictory export @${name}`,
        });
      }
      if (pending || (exportMarker === '@' && !routinePending && !invalidLegacyContractPending)) {
        output.push(`${pending?.indent ?? indent}${renderContract(pending?.clauses ?? [])}`);
      }
      if (pending) output.push(...pending.gap);
      const migratedExport = exportMarker === '@' && options.stripExports !== true ? '@' : '';
      output.push(`${indent}${migratedExport}${name}:${label[4] ?? ''}`);
      pending = undefined;
      routinePending = false;
      invalidLegacyContractPending = false;
      continue;
    }

    if (pending) {
      diagnostics.push({
        line: index + 1,
        message: 'legacy routine contract is not followed by a non-local label',
      });
      flushPendingUnchanged();
    }

    const expectOut = expectOutDirective(line);
    if (expectOut?.error !== undefined) {
      diagnostics.push({ line: index + 1, message: expectOut.error });
      output.push(line);
    } else {
      output.push(expectOut?.text ?? line);
    }
    routinePending = false;
    if (!/^\s*(?:;|$)/u.test(line)) invalidLegacyContractPending = false;
  }

  flushPendingUnchanged();
  return {
    text: `${output.join(newline)}${hadFinalNewline ? newline : ''}`,
    diagnostics,
  };
}

export async function collectMigrationSourceFiles(path) {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => undefined);
  if (entries === undefined)
    return SOURCE_EXTENSIONS.has(extname(path).toLowerCase()) ? [path] : [];
  const nested = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith('.') && !EXCLUDED_DIRECTORIES.has(entry.name))
      .map((entry) => collectMigrationSourceFiles(resolve(path, entry.name))),
  );
  return nested.flat();
}

async function main(args) {
  const write = args.includes('--write');
  const stripExports = args.includes('--strip-exports');
  const paths = args.filter((arg) => !arg.startsWith('--'));
  if (paths.length === 0) {
    console.error('Usage: migrate-azm-0.3.mjs [--write] [--strip-exports] <file-or-directory>...');
    process.exitCode = 2;
    return;
  }

  const files = [
    ...new Set(
      (await Promise.all(paths.map((path) => collectMigrationSourceFiles(resolve(path))))).flat(),
    ),
  ];
  let changed = 0;
  let errors = 0;
  for (const file of files.sort()) {
    const source = await readFile(file, 'utf8');
    const result = migrateAzm03Source(source, { stripExports });
    for (const diagnostic of result.diagnostics) {
      console.error(`${file}:${diagnostic.line}: ${diagnostic.message}`);
      errors += 1;
    }
    if (result.text === source) continue;
    changed += 1;
    console.log(file);
    if (write && result.diagnostics.length === 0) await writeFile(file, result.text, 'utf8');
  }
  console.log(
    `${write ? 'migrated' : 'would migrate'} ${changed} file(s); ${errors} diagnostic(s)`,
  );
  if (errors > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main(process.argv.slice(2));
}
