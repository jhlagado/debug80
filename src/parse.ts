/**
 * Parser for the Glimmer meta-source format (.glim).
 *
 * The format is line-oriented. Top-level statements:
 *
 *   program <Name>
 *   platform <name>          (optional; currently tec1g-mon3)
 *   display <name>           (optional; currently matrix8x8, needs platform)
 *   state <Name> : <byte|word> [= <value>] [dirty_on_start]
 *   pulse <Name>
 *   bind key <KEY_NAME> rising -> <PulseName>
 *   effect <Name>
 *       phase <derive|logic|render>     (optional; defaults to logic)
 *       on <Cell>[, <Cell>...]
 *       writes <Cell>[, <Cell>...]
 *   begin
 *       ...verbatim Z80 fragment body...
 *   end
 *
 * Comments start with ';' outside z80 bodies. Bodies are kept verbatim.
 */

import type {
  Binding,
  EffectDecl,
  EffectPhase,
  GlimmerDiagnostic,
  GlimmerProgram,
  PulseDecl,
  StateDecl,
} from './model.js';
import { EFFECT_PHASES, TEC1G_KEY_CODES } from './model.js';

const PLATFORMS = ['tec1g-mon3'];
const DISPLAYS = ['matrix8x8'];

export interface ParseResult {
  program: GlimmerProgram | null;
  diagnostics: GlimmerDiagnostic[];
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const STATE_RE =
  /^state\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(byte|word)(?:\s*=\s*(\S+))?(\s+dirty_on_start)?$/;
const BIND_KEY_RE =
  /^bind\s+key\s+([A-Za-z_][A-Za-z0-9_]*)\s+rising\s*->\s*([A-Za-z_][A-Za-z0-9_]*)$/;

function stripComment(line: string): string {
  const semi = line.indexOf(';');
  return semi >= 0 ? line.slice(0, semi) : line;
}

export function parseNumber(text: string): number | null {
  let value: number;
  if (text.startsWith('$')) {
    value = Number.parseInt(text.slice(1), 16);
  } else if (/^0x/i.test(text)) {
    value = Number.parseInt(text.slice(2), 16);
  } else if (text.startsWith('%')) {
    value = Number.parseInt(text.slice(1), 2);
  } else if (/^[0-9]+$/.test(text)) {
    value = Number.parseInt(text, 10);
  } else {
    return null;
  }
  return Number.isNaN(value) ? null : value;
}

export function parseGlimmer(source: string): ParseResult {
  const lines = source.split(/\r?\n/);
  const diagnostics: GlimmerDiagnostic[] = [];
  const error = (line: number, message: string): void => {
    diagnostics.push({ line, message });
  };

  let programName: string | null = null;
  let platform: string | null = null;
  let display: string | null = null;
  const states: StateDecl[] = [];
  const pulses: PulseDecl[] = [];
  const bindings: Binding[] = [];
  const effects: EffectDecl[] = [];

  let i = 0;
  while (i < lines.length) {
    const lineNo = i + 1;
    const text = stripComment(lines[i] ?? '').trim();
    i += 1;
    if (text === '') continue;

    if (text.startsWith('program ')) {
      const name = text.slice('program '.length).trim();
      if (!IDENT.test(name)) {
        error(lineNo, `Invalid program name "${name}".`);
      } else if (programName !== null) {
        error(lineNo, 'Duplicate program declaration.');
      } else {
        programName = name;
      }
      continue;
    }

    if (text.startsWith('platform ')) {
      const name = text.slice('platform '.length).trim();
      if (!PLATFORMS.includes(name)) {
        error(lineNo, `Unknown platform "${name}". Supported: ${PLATFORMS.join(', ')}.`);
      } else if (platform !== null) {
        error(lineNo, 'Duplicate platform declaration.');
      } else {
        platform = name;
      }
      continue;
    }

    if (text.startsWith('display ')) {
      const name = text.slice('display '.length).trim();
      if (!DISPLAYS.includes(name)) {
        error(lineNo, `Unknown display "${name}". Supported: ${DISPLAYS.join(', ')}.`);
      } else if (display !== null) {
        error(lineNo, 'Duplicate display declaration.');
      } else {
        display = name;
      }
      continue;
    }

    if (text.startsWith('state ')) {
      const match = STATE_RE.exec(text);
      if (!match) {
        error(lineNo, `Invalid state declaration: "${text}".`);
        continue;
      }
      const [, name, type, initialText, dirtyFlag] = match;
      let initial = 0;
      if (initialText !== undefined) {
        const parsed = parseNumber(initialText);
        if (parsed === null) {
          error(lineNo, `Invalid initial value "${initialText}" for state ${name}.`);
          continue;
        }
        initial = parsed;
      }
      states.push({
        name: name as string,
        type: type as StateDecl['type'],
        initial,
        dirtyOnStart: dirtyFlag !== undefined,
        line: lineNo,
      });
      continue;
    }

    if (text.startsWith('pulse ')) {
      const name = text.slice('pulse '.length).trim();
      if (!IDENT.test(name)) {
        error(lineNo, `Invalid pulse name "${name}".`);
        continue;
      }
      pulses.push({ name, line: lineNo });
      continue;
    }

    if (text.startsWith('bind ')) {
      const match = BIND_KEY_RE.exec(text);
      if (!match) {
        error(
          lineNo,
          `Unsupported binding: "${text}". v0 supports: bind key <KEY> rising -> <Pulse>.`,
        );
        continue;
      }
      bindings.push({
        kind: 'key',
        key: match[1] as string,
        edge: 'rising',
        target: match[2] as string,
        line: lineNo,
      });
      continue;
    }

    if (text.startsWith('effect ')) {
      const name = text.slice('effect '.length).trim();
      if (!IDENT.test(name)) {
        error(lineNo, `Invalid effect name "${name}".`);
      }
      // Logic is the default phase; only derive and render need stating.
      let phase: EffectPhase = 'logic';
      const depends: string[] = [];
      const writes: string[] = [];

      // Effect header lines until the begin body opens.
      let sawBody = false;
      while (i < lines.length) {
        const headerLineNo = i + 1;
        const header = stripComment(lines[i] ?? '').trim();
        i += 1;
        if (header === '') continue;
        if (header === 'begin') {
          sawBody = true;
          break;
        }
        if (header.startsWith('phase ')) {
          const value = header.slice('phase '.length).trim();
          if ((EFFECT_PHASES as readonly string[]).includes(value)) {
            phase = value as EffectPhase;
          } else {
            error(
              headerLineNo,
              `Unknown effect phase "${value}". Expected one of: ${EFFECT_PHASES.join(', ')}.`,
            );
          }
          continue;
        }
        if (header.startsWith('on ')) {
          depends.push(...splitNames(header.slice('on '.length)));
          continue;
        }
        if (header.startsWith('writes ')) {
          writes.push(...splitNames(header.slice('writes '.length)));
          continue;
        }
        error(headerLineNo, `Unexpected line in effect ${name}: "${header}".`);
      }

      if (!sawBody) {
        error(lineNo, `Effect ${name} has no begin...end body.`);
        continue;
      }

      // Body lines are verbatim until a line containing only "end".
      const body: string[] = [];
      let sawEnd = false;
      while (i < lines.length) {
        const raw = lines[i] ?? '';
        i += 1;
        if (raw.trim() === 'end') {
          sawEnd = true;
          break;
        }
        body.push(raw);
      }
      if (!sawEnd) {
        error(lineNo, `Effect ${name}: missing end.`);
        continue;
      }

      if (depends.length === 0) {
        error(lineNo, `Effect ${name} has no "on" triggers; it would never run.`);
        continue;
      }
      effects.push({ name, phase, depends, writes, body, line: lineNo });
      continue;
    }

    error(lineNo, `Unknown statement: "${text}".`);
  }

  if (programName === null) {
    error(0, 'Missing program declaration.');
  }
  if (display !== null && platform === null) {
    error(0, `display ${display} requires a platform declaration.`);
  }
  if (platform !== null && display === null) {
    error(0, `platform ${platform} currently requires a display declaration.`);
  }
  if (platform === 'tec1g-mon3') {
    for (const binding of bindings) {
      if (!TEC1G_KEY_CODES.has(binding.key)) {
        error(
          binding.line,
          `Unknown tec1g-mon3 key "${binding.key}". Known keys: KEY_0..KEY_F, KEY_PLUS, KEY_MINUS, KEY_GO, KEY_AD.`,
        );
      }
    }
  }

  validateReferences({ states, pulses, bindings, effects }, diagnostics);

  if (diagnostics.length > 0 || programName === null) {
    return { program: null, diagnostics };
  }
  return {
    program: { name: programName, platform, display, states, pulses, bindings, effects },
    diagnostics,
  };
}

function splitNames(text: string): string[] {
  return text
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');
}

function validateReferences(
  parts: Pick<GlimmerProgram, 'states' | 'pulses' | 'bindings' | 'effects'>,
  diagnostics: GlimmerDiagnostic[],
): void {
  const error = (line: number, message: string): void => {
    diagnostics.push({ line, message });
  };

  const cellNames = new Set<string>();
  for (const cell of [...parts.states, ...parts.pulses]) {
    if (cellNames.has(cell.name)) {
      error(cell.line, `Duplicate state/pulse name "${cell.name}".`);
    }
    cellNames.add(cell.name);
  }

  const stateNames = new Set(parts.states.map((state) => state.name));
  const pulseNames = new Set(parts.pulses.map((pulse) => pulse.name));

  for (const binding of parts.bindings) {
    if (!pulseNames.has(binding.target)) {
      error(binding.line, `Binding target "${binding.target}" is not a declared pulse.`);
    }
  }

  const effectNames = new Set<string>();
  for (const effect of parts.effects) {
    if (effectNames.has(effect.name)) {
      error(effect.line, `Duplicate effect name "${effect.name}".`);
    }
    effectNames.add(effect.name);
    for (const dep of effect.depends) {
      if (!cellNames.has(dep)) {
        error(effect.line, `Effect ${effect.name} triggers on undeclared cell "${dep}".`);
      }
    }
    for (const target of effect.writes) {
      if (!stateNames.has(target)) {
        error(effect.line, `Effect ${effect.name} writes undeclared state "${target}".`);
      }
    }
  }
}
