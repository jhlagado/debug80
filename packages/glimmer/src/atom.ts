/** Atom projection of Glimmer's generated assembly subset. */

import { translateAzmSourceToAtom } from 'atom-z80';

import type { GlimmerDiagnostic, GlimmerProgram } from './model.js';
import { generateAzm, type GenerateOptions, type GenerateResult } from './generate.js';

const ATOM_NAME_LENGTH = 8;

interface PreparedSource {
  source: string;
  diagnostics: GlimmerDiagnostic[];
}

interface EnumValue {
  qualified: string;
  symbol: string;
  value: number;
}

interface GeneratedOp {
  name: string;
  parameters: string[];
  body: string[];
}

function diagnostic(message: string, line = 0): GlimmerDiagnostic {
  return { line, message };
}

function sourceLine(error: unknown): number {
  if (typeof error !== 'object' || error === null) return 0;
  const line = (error as { line?: unknown }).line;
  return typeof line === 'number' && Number.isInteger(line) ? line : 0;
}

function sourceMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function splitComment(line: string): { code: string; comment: string } {
  let quote = '';
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index] as string;
    if (quote !== '' && escaped) {
      escaped = false;
    } else if (quote !== '' && character === '\\') {
      escaped = true;
    } else if (character === quote) {
      quote = '';
    } else if (quote === '' && (character === '"' || character === "'")) {
      quote = character;
    } else if (quote === '' && character === ';') {
      return { code: line.slice(0, index), comment: line.slice(index) };
    }
  }
  return { code: line, comment: '' };
}

function enumLines(
  line: string,
  lineNumber: number,
): { lines: string[]; values: EnumValue[]; diagnostic?: GlimmerDiagnostic } {
  const { code, comment } = splitComment(line);
  const match = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s+\.enum\s+(.+?)\s*$/.exec(code);
  if (match === null) return { lines: [line], values: [] };
  const [, leading, enumName, operand] = match as RegExpExecArray & {
    1: string;
    2: string;
    3: string;
  };
  const names = operand.split(',').map((name) => name.trim());
  if (names.length === 0 || names.some((name) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))) {
    return {
      lines: [],
      values: [],
      diagnostic: diagnostic('Atom emission requires simple generated enum members.', lineNumber),
    };
  }
  const values = names.map((name, value) => ({
    qualified: `${enumName}.${name}`,
    symbol: `${enumName}_${name}`,
    value,
  }));
  return {
    lines: values.map(
      ({ symbol, value }, index) =>
        `${leading}${symbol} .equ ${value}${index === 0 && comment !== '' ? ` ${comment}` : ''}`,
    ),
    values,
  };
}

function splitArguments(operand: string): string[] {
  return operand.split(',').map((argument) => argument.trim());
}

function generatedOps(source: string): {
  definitions: Map<string, GeneratedOp>;
  definitionLines: Set<number>;
  diagnostics: GlimmerDiagnostic[];
} {
  const definitions = new Map<string, GeneratedOp>();
  const definitionLines = new Set<number>();
  const diagnostics: GlimmerDiagnostic[] = [];
  const lines = source.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const code = splitComment(lines[index] as string).code;
    const start = /^\s*op\s+([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*$/i.exec(code);
    if (start === null) continue;
    const name = start[1] as string;
    const parameters = splitArguments(start[2] as string).map((declaration) => {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)\b/.exec(declaration);
      return match?.[1] ?? '';
    });
    if (parameters.length === 0 || parameters.some((parameter) => parameter === '')) {
      diagnostics.push(
        diagnostic(`Generated op ${name} has an invalid parameter list.`, index + 1),
      );
      continue;
    }
    const body: string[] = [];
    const firstLine = index;
    definitionLines.add(index);
    let ended = false;
    for (index += 1; index < lines.length; index += 1) {
      definitionLines.add(index);
      const bodyLine = lines[index] as string;
      if (splitComment(bodyLine).code.trim().toLowerCase() === 'end') {
        ended = true;
        break;
      }
      body.push(bodyLine);
    }
    if (!ended) {
      diagnostics.push(diagnostic(`Generated op ${name} is missing END.`, firstLine + 1));
      break;
    }
    const key = name.toUpperCase();
    if (definitions.has(key)) {
      diagnostics.push(
        diagnostic(`Generated op ${name} is declared more than once.`, firstLine + 1),
      );
      continue;
    }
    definitions.set(key, { name, parameters, body });
  }
  return { definitions, definitionLines, diagnostics };
}

function substituteOpLine(line: string, values: ReadonlyMap<string, string>): string {
  const parts = splitComment(line);
  const code = parts.code.replace(
    /[A-Za-z_][A-Za-z0-9_]*/g,
    (name) => values.get(name.toUpperCase()) ?? name,
  );
  return `${code}${parts.comment}`;
}

function lowerGeneratedOps(source: string): PreparedSource {
  const parsed = generatedOps(source);
  if (parsed.diagnostics.length > 0) return { source: '', diagnostics: parsed.diagnostics };
  if (parsed.definitions.size === 0) return { source, diagnostics: [] };
  const output: string[] = [];
  const lines = source.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (parsed.definitionLines.has(index)) continue;
    const line = lines[index] as string;
    const parts = splitComment(line);
    const invocation = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s+(.+?)\s*$/.exec(parts.code);
    const op =
      invocation === null
        ? undefined
        : parsed.definitions.get((invocation[2] as string).toUpperCase());
    if (invocation === null || op === undefined) {
      output.push(line);
      continue;
    }
    const arguments_ = splitArguments(invocation[3] as string);
    if (arguments_.length !== op.parameters.length) {
      return {
        source: '',
        diagnostics: [
          diagnostic(
            `Generated op ${op.name} expects ${op.parameters.length} operands but received ${arguments_.length}.`,
            index + 1,
          ),
        ],
      };
    }
    const values = new Map(
      op.parameters.map((parameter, operand) => [
        parameter.toUpperCase(),
        arguments_[operand] as string,
      ]),
    );
    op.body.forEach((bodyLine, bodyIndex) => {
      const lowered = substituteOpLine(bodyLine, values);
      output.push(
        bodyIndex === 0 && parts.comment !== '' ? `${lowered} ${parts.comment}` : lowered,
      );
    });
  }
  return { source: output.join('\n'), diagnostics: [] };
}

function normalizeMetadata(source: string): PreparedSource & { enumValues: EnumValue[] } {
  const lowered = lowerGeneratedOps(source);
  if (lowered.diagnostics.length > 0) {
    return { source: '', diagnostics: lowered.diagnostics, enumValues: [] };
  }
  const diagnostics: GlimmerDiagnostic[] = [];
  const lines: string[] = [];
  const enumValues: EnumValue[] = [];
  const sourceLines = lowered.source.split('\n');
  for (let index = 0; index < sourceLines.length; index += 1) {
    const line = sourceLines[index] as string;
    const lineNumber = index + 1;
    if (/^\s*\.contracts\b/i.test(line)) {
      lines.push(line.replace(/^(\s*)\.contracts\b/i, '$1;@CONTRACTS'));
      continue;
    }
    if (/^\s*\.import\b/i.test(line)) {
      diagnostics.push(
        diagnostic(
          'Atom emission does not yet support Glimmer module imports; emit ordered source parts before selecting Atom.',
          lineNumber,
        ),
      );
      lines.push(line);
      continue;
    }
    if (
      /^\s*\.(?:type|typealias|union|field|byte|word|addr|endtype|endunion|op|endop)\b/i.test(line)
    ) {
      diagnostics.push(
        diagnostic('This Glimmer declaration has no Atom source projection.', lineNumber),
      );
      lines.push(line);
      continue;
    }
    const expanded = enumLines(line, lineNumber);
    if (expanded.diagnostic !== undefined) diagnostics.push(expanded.diagnostic);
    lines.push(...expanded.lines);
    enumValues.push(...expanded.values);
  }
  return { source: lines.join('\n'), diagnostics, enumValues };
}

function declaredSymbols(source: string): string[] {
  const names: string[] = [];
  for (const line of source.split('\n')) {
    const code = splitComment(line).code;
    const label = /^\s*(@?[A-Za-z_][A-Za-z0-9_]*):/.exec(code);
    if (label !== null) names.push(label[1] as string);
    const equate = /^\s*(@?[A-Za-z_][A-Za-z0-9_]*)\s+\.?(?:equ)\b/i.exec(code);
    if (equate !== null) names.push(equate[1] as string);
  }
  return names;
}

function base36(value: number, digits: number): string {
  return value.toString(36).toUpperCase().padStart(digits, '0');
}

function buildSymbolMap(source: string): { mapping: Map<string, string>; error?: string } {
  const definitions = declaredSymbols(source);
  const globals = new Map<string, string>();
  const locals = new Map<string, string>();
  const used = new Set<string>();
  for (const rawName of definitions) {
    const name = rawName.startsWith('@') ? rawName.slice(1) : rawName;
    if (name.startsWith('_')) continue;
    const key = name.toUpperCase();
    const previous = globals.get(key);
    if (previous !== undefined && previous !== name) {
      return {
        mapping: new Map(),
        error: `Symbols ${previous} and ${name} collide in Atom's case-insensitive namespace.`,
      };
    }
    globals.set(key, name);
    if (name.length <= ATOM_NAME_LENGTH) used.add(key);
  }

  const mapping = new Map<string, string>();
  let globalOrdinal = 0;
  for (const [key, name] of globals) {
    if (name.length <= ATOM_NAME_LENGTH) {
      if (definitions.includes(`@${name}`)) mapping.set(`@${key}`, name);
      continue;
    }
    let replacement: string;
    do {
      replacement = `G${base36(globalOrdinal, 7)}`;
      globalOrdinal += 1;
    } while (used.has(replacement));
    used.add(replacement);
    mapping.set(key, replacement);
    mapping.set(`@${key}`, replacement);
  }

  let localOrdinal = 0;
  for (const rawName of definitions) {
    const name = rawName.startsWith('@') ? rawName.slice(1) : rawName;
    if (!name.startsWith('_')) continue;
    const key = name.toUpperCase();
    if (locals.has(key)) continue;
    if (name.length <= ATOM_NAME_LENGTH + 1) {
      locals.set(key, name);
      continue;
    }
    const replacement = `_L${base36(localOrdinal, 6)}`;
    localOrdinal += 1;
    locals.set(key, replacement);
    mapping.set(key, replacement);
  }
  return { mapping };
}

function rewriteCode(
  code: string,
  mapping: ReadonlyMap<string, string>,
  qualified: ReadonlyMap<string, string>,
): string {
  let output = '';
  let quote = '';
  let escaped = false;
  for (let index = 0; index < code.length;) {
    const character = code[index] as string;
    if (quote !== '') {
      output += character;
      index += 1;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      output += character;
      index += 1;
      continue;
    }
    const exported = /^@([A-Za-z_][A-Za-z0-9_]*)/.exec(code.slice(index));
    if (exported !== null) {
      const full = exported[0];
      const key = `@${(exported[1] as string).toUpperCase()}`;
      output += mapping.get(key) ?? (exported[1] as string);
      index += full.length;
      continue;
    }
    const identifier = /^[A-Za-z_][A-Za-z0-9_]*/.exec(code.slice(index));
    if (identifier !== null) {
      const name = identifier[0];
      const member = /^\.([A-Za-z_][A-Za-z0-9_]*)/.exec(code.slice(index + name.length));
      if (member !== null) {
        const qualifiedName = `${name}.${member[1] as string}`;
        const replacement = qualified.get(qualifiedName.toUpperCase());
        if (replacement !== undefined) {
          output += mapping.get(replacement.toUpperCase()) ?? replacement;
          index += name.length + member[0].length;
          continue;
        }
      }
      output += mapping.get(name.toUpperCase()) ?? name;
      index += name.length;
      continue;
    }
    output += character;
    index += 1;
  }
  return output;
}

function prepareGeneratedSource(source: string): PreparedSource {
  const normalized = normalizeMetadata(source);
  if (normalized.diagnostics.length > 0) {
    return { source: '', diagnostics: normalized.diagnostics };
  }
  const symbols = buildSymbolMap(normalized.source);
  if (symbols.error !== undefined) {
    return { source: '', diagnostics: [diagnostic(symbols.error)] };
  }
  const qualified = new Map(
    normalized.enumValues.map(({ qualified: name, symbol }) => [name.toUpperCase(), symbol]),
  );
  const rewritten = normalized.source
    .split('\n')
    .map((line) => {
      const parts = splitComment(line);
      return `${rewriteCode(parts.code, symbols.mapping, qualified)}${parts.comment}`;
    })
    .join('\n');
  try {
    return {
      source: translateAzmSourceToAtom(rewritten, { sourceName: '<generated-glimmer>' }),
      diagnostics: [],
    };
  } catch (error) {
    return {
      source: '',
      diagnostics: [
        diagnostic(
          `Generated source cannot be represented by Atom: ${sourceMessage(error)}`,
          sourceLine(error),
        ),
      ],
    };
  }
}

/**
 * Generate strict Atom source for the Glimmer subset Atom can represent.
 * Unsupported constructs return diagnostics and never produce partial source.
 */
export function generateAtom(
  program: GlimmerProgram,
  options: GenerateOptions = {},
): GenerateResult {
  const generated = generateAzm(program, options);
  if (generated.diagnostics.length > 0) return generated;
  return prepareGeneratedSource(generated.source);
}

export const atomEmissionInternals = Object.freeze({ prepareGeneratedSource });
