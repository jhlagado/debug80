import type {
  CurveDecl,
  CurvePreset,
  PulseDecl,
  RampDecl,
  SoundDecl,
  StateDecl,
  TimerDecl,
  TypeDecl,
  TypeFieldDecl,
} from './model.js';
import {
  CURVE_PRESETS,
  CURVE_RE,
  FIELD_TYPE_RE,
  IDENT,
  parseNumber,
  RAMP_RE,
  SOUND_RE,
  STATE_RE,
  stripComment,
  TIMER_RE,
  TYPE_EXPR_RE,
} from './parse-syntax.js';

export function parseDataDeclaration(options: {
  text: string;
  lineNo: number;
  lines: readonly string[];
  nextLine: number;
  types: TypeDecl[];
  states: StateDecl[];
  pulses: PulseDecl[];
  timers: TimerDecl[];
  ramps: RampDecl[];
  sounds: SoundDecl[];
  curves: CurveDecl[];
  error: (line: number, message: string) => void;
}): number | undefined {
  const { text, lineNo, lines, types, states, pulses, timers, ramps, sounds, curves, error } =
    options;
  let i = options.nextLine;
  let handled = false;

  do {
    if (text.startsWith('state ')) {
      handled = true;
      const match = STATE_RE.exec(text);
      if (!match) {
        error(lineNo, `Invalid state declaration: "${text}".`);
        continue;
      }
      const [, name, typeText, initialText, changedFlag] = match;
      const typeMatch = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[(\S+)\])?$/.exec(typeText as string);
      if (!typeMatch) {
        error(lineNo, `State ${name}: invalid type "${typeText}".`);
        continue;
      }
      const baseType = typeMatch[1] as string;
      const lengthText = typeMatch[2];
      const isScalar = baseType === 'byte' || baseType === 'word';

      let length: number | undefined;
      if (lengthText !== undefined) {
        if (isScalar && baseType !== 'byte') {
          error(lineNo, `State ${name}: only byte arrays are supported.`);
          continue;
        }
        const parsedLength = parseNumber(lengthText);
        if (parsedLength === null || parsedLength < 1 || parsedLength > 256) {
          error(lineNo, `State ${name}: array length must be between 1 and 256.`);
          continue;
        }
        length = parsedLength;
      } else if (typeText !== baseType) {
        error(lineNo, `State ${name}: invalid type "${typeText}".`);
        continue;
      }

      if (initialText !== undefined && (length !== undefined || !isScalar)) {
        error(
          lineNo,
          `State ${name}: ${isScalar ? 'array' : 'typed'} state takes no initializer (storage is zero-filled).`,
        );
        continue;
      }
      let initial = 0;
      if (initialText !== undefined) {
        const parsed = parseNumber(initialText);
        if (parsed === null) {
          error(lineNo, `Invalid initial value "${initialText}" for state ${name}.`);
          continue;
        }
        initial = parsed;
      }
      const state: StateDecl = {
        name: name as string,
        type: isScalar ? (baseType as StateDecl['type']) : 'byte',
        initial,
        changedOnStart: changedFlag !== undefined,
        line: lineNo,
      };
      if (!isScalar) state.typeName = baseType;
      if (length !== undefined) state.length = length;
      states.push(state);
      continue;
    }

    if (text.startsWith('type ')) {
      handled = true;
      const rest = text.slice('type '.length).trim();
      const aliasMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\S+)$/.exec(rest);
      if (aliasMatch) {
        const [, name, expr] = aliasMatch;
        if (!TYPE_EXPR_RE.test(expr as string)) {
          error(lineNo, `Type ${name}: invalid alias target "${expr}".`);
          continue;
        }
        types.push({ name: name as string, alias: expr as string, fields: [], line: lineNo });
        continue;
      }
      if (!IDENT.test(rest)) {
        error(
          lineNo,
          `Invalid type declaration: "${text}". Expected: type <Name> or type <Name> = <TypeExpr>.`,
        );
        continue;
      }
      // Field lines (name : fieldtype) until a line containing only "end".
      const fields: TypeFieldDecl[] = [];
      const fieldNames = new Set<string>();
      let sawEnd = false;
      let malformed = false;
      while (i < lines.length) {
        const fieldLineNo = i + 1;
        const fieldText = stripComment(lines[i] ?? '').trim();
        i += 1;
        if (fieldText === '') continue;
        if (fieldText === 'end') {
          sawEnd = true;
          break;
        }
        // A new top-level statement means the closing `end` was forgotten;
        // hand the line back rather than swallowing the next declaration.
        if (
          /^(program|platform|display|part|import|type|state|pulse|timer|ramp|sound|curve|shape|bind|effect|compute|render|routine|card)\b/.test(
            fieldText,
          )
        ) {
          i -= 1;
          break;
        }
        const fieldMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(\S+)$/.exec(fieldText);
        if (!fieldMatch || !FIELD_TYPE_RE.test(fieldMatch[2] as string)) {
          error(
            fieldLineNo,
            `Type ${rest}: invalid field "${fieldText}". Expected: <name> : <byte|word|addr|N|Type[N]>.`,
          );
          malformed = true;
          continue;
        }
        const fieldName = fieldMatch[1] as string;
        if (fieldName.startsWith('_')) {
          error(
            fieldLineNo,
            `Type ${rest}: reserved field name "${fieldName}" — a leading "_" is AZM local-label syntax.`,
          );
          malformed = true;
          continue;
        }
        if (fieldNames.has(fieldName)) {
          error(fieldLineNo, `Type ${rest}: duplicate field "${fieldName}".`);
          malformed = true;
          continue;
        }
        fieldNames.add(fieldName);
        fields.push({ name: fieldName, type: fieldMatch[2] as string, line: fieldLineNo });
      }
      if (!sawEnd) {
        error(lineNo, `Type ${rest}: missing end.`);
        continue;
      }
      if (fields.length === 0 && !malformed) {
        error(lineNo, `Type ${rest} has no fields.`);
        continue;
      }
      if (malformed) continue;
      types.push({ name: rest, fields, line: lineNo });
      continue;
    }

    if (text.startsWith('pulse ')) {
      handled = true;
      const name = text.slice('pulse '.length).trim();
      if (!IDENT.test(name)) {
        error(lineNo, `Invalid pulse name "${name}".`);
        continue;
      }
      pulses.push({ name, line: lineNo });
      continue;
    }

    if (text.startsWith('timer ')) {
      handled = true;
      const match = TIMER_RE.exec(text);
      if (!match) {
        error(
          lineNo,
          `Invalid timer declaration: "${text}". Expected: timer <Name> : <byte|word> = <N> -> <Pulse> [once].`,
        );
        continue;
      }
      const initial = parseNumber(match[3] as string);
      const once = match[5] !== undefined;
      // A once timer may start at 0: idle until code writes the
      // countdown (the armed-on-demand pattern). Oscillators need a
      // real period.
      if (initial === null || (!once && initial < 1)) {
        error(lineNo, `Timer ${match[1]}: period must be a number of at least 1.`);
        continue;
      }
      timers.push({
        name: match[1] as string,
        type: match[2] as TimerDecl['type'],
        initial,
        target: match[4] as string,
        once,
        line: lineNo,
      });
      continue;
    }

    if (text.startsWith('ramp ')) {
      handled = true;
      const match = RAMP_RE.exec(text);
      if (!match) {
        error(
          lineNo,
          `Invalid ramp declaration: "${text}". Expected: ramp <Name> : byte steps <N> -> <Pulse>.`,
        );
        continue;
      }
      const steps = parseNumber(match[2] as string);
      if (steps === null || steps < 2 || steps > 256) {
        error(lineNo, `Ramp ${match[1]}: steps must be between 2 and 256.`);
        continue;
      }
      ramps.push({
        name: match[1] as string,
        steps,
        target: match[3] as string,
        line: lineNo,
      });
      continue;
    }

    if (text.startsWith('sound ')) {
      handled = true;
      const match = SOUND_RE.exec(text);
      if (!match) {
        error(
          lineNo,
          `Invalid sound declaration: "${text}". Expected: sound <Name> len <N> div <N>.`,
        );
        continue;
      }
      const len = parseNumber(match[2] as string);
      if (len === null || len < 1 || len > 255) {
        error(lineNo, `Sound ${match[1]}: len must be between 1 and 255 row ticks.`);
        continue;
      }
      const div = parseNumber(match[3] as string);
      if (div === null || div < 1 || div > 255) {
        error(lineNo, `Sound ${match[1]}: div must be between 1 and 255.`);
        continue;
      }
      sounds.push({ name: match[1] as string, len, div, line: lineNo });
      continue;
    }

    if (text.startsWith('curve ')) {
      handled = true;
      const match = CURVE_RE.exec(text);
      if (!match) {
        error(
          lineNo,
          `Invalid curve declaration: "${text}". Expected: curve <Name> <preset> steps <N> [from <N> to <N>].`,
        );
        continue;
      }
      const name = match[1] as string;
      const preset = match[2] as string;
      if (!CURVE_PRESETS.includes(preset as CurvePreset)) {
        error(lineNo, `Curve ${name}: unknown preset "${preset}".`);
        continue;
      }
      const steps = parseNumber(match[3] as string);
      if (steps === null || steps < 2 || steps > 256) {
        error(lineNo, `Curve ${name}: steps must be between 2 and 256.`);
        continue;
      }
      const from = match[4] === undefined ? 0 : parseNumber(match[4]);
      const to = match[5] === undefined ? steps - 1 : parseNumber(match[5]);
      if (from === null || to === null || from < 0 || from > 255 || to < 0 || to > 255) {
        error(lineNo, `Curve ${name}: from/to values must be bytes between 0 and 255.`);
        continue;
      }
      curves.push({ name, preset: preset as CurvePreset, steps, from, to, line: lineNo });
      continue;
    }
  } while (false);

  return handled ? i : undefined;
}
