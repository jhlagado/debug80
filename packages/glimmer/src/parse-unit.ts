import type {
  Binding,
  CardDecl,
  CurveDecl,
  EffectDecl,
  EffectPhase,
  GlimmerDiagnostic,
  PulseDecl,
  RampDecl,
  RoutineDecl,
  ShapeDecl,
  SoundDecl,
  SpriteDecl,
  StateDecl,
  TextDecl,
  TileDecl,
  TimerDecl,
  TypeDecl,
} from './model.js';
import type { ImportDecl } from './model.js';
import { CURRENT_CARD } from './model.js';
import {
  BIND_KEY_RE,
  DISPLAYS,
  IDENT,
  IMPORT_RE,
  parseNumber,
  PART_RE,
  PLATFORMS,
  splitNames,
  stripComment,
} from './parse-syntax.js';
import { parseDataDeclaration } from './parse-data-declarations.js';
import { parseResourceDeclaration } from './parse-resource-declarations.js';

/** One parsed source file: an entry or a part, before program assembly. */
export interface ParsedUnit {
  kind: 'entry' | 'part';
  file: string | undefined;
  programName: string | null;
  platform: string | null;
  display: string | null;
  parts: ImportDecl[];
  imports: ImportDecl[];
  types: TypeDecl[];
  states: StateDecl[];
  pulses: PulseDecl[];
  timers: TimerDecl[];
  ramps: RampDecl[];
  sounds: SoundDecl[];
  curves: CurveDecl[];
  shapes: ShapeDecl[];
  sprites: SpriteDecl[];
  tiles: TileDecl[];
  texts: TextDecl[];
  bindings: Binding[];
  effects: EffectDecl[];
  routines: RoutineDecl[];
  cards: CardDecl[];
  diagnostics: GlimmerDiagnostic[];
}

export function parseUnit(
  source: string,
  opts: { kind: 'entry' | 'part'; file?: string } = { kind: 'entry' },
): ParsedUnit {
  const lines = source.split(/\r?\n/);
  const diagnostics: GlimmerDiagnostic[] = [];
  const error = (line: number, message: string): void => {
    diagnostics.push(
      opts.file === undefined ? { line, message } : { line, message, file: opts.file },
    );
  };
  const entryOnly = (lineNo: number, what: string): void => {
    error(
      lineNo,
      `Only the entry file declares ${what}; parts contribute cells, resources, bindings, and blocks.`,
    );
  };

  const parts: ImportDecl[] = [];
  const imports: ImportDecl[] = [];
  let programName: string | null = null;
  let platform: string | null = null;
  let display: string | null = null;
  const types: TypeDecl[] = [];
  const states: StateDecl[] = [];
  const pulses: PulseDecl[] = [];
  const timers: TimerDecl[] = [];
  const ramps: RampDecl[] = [];
  const sounds: SoundDecl[] = [];
  const curves: CurveDecl[] = [];
  const shapes: ShapeDecl[] = [];
  const sprites: SpriteDecl[] = [];
  const tiles: TileDecl[] = [];
  const texts: TextDecl[] = [];
  const bindings: Binding[] = [];
  const effects: EffectDecl[] = [];
  const routines: RoutineDecl[] = [];
  const cards: CardDecl[] = [];
  let currentCard: string | null = null;

  let i = 0;
  while (i < lines.length) {
    const lineNo = i + 1;
    const text = stripComment(lines[i] ?? '').trim();
    i += 1;
    if (text === '') continue;

    if (text.startsWith('part ')) {
      const match = PART_RE.exec(text);
      if (!match) {
        error(lineNo, `Invalid part declaration: "${text}". Expected: part "file.glim".`);
      } else if (opts.kind === 'part') {
        entryOnly(lineNo, 'parts');
      } else {
        parts.push({ path: match[1] as string, line: lineNo });
      }
      continue;
    }

    if (text.startsWith('import ')) {
      const match = IMPORT_RE.exec(text);
      if (!match) {
        error(lineNo, `Invalid import declaration: "${text}". Expected: import "module.asm".`);
      } else {
        imports.push({ path: match[1] as string, line: lineNo });
      }
      continue;
    }

    if (text.startsWith('program ')) {
      const name = text.slice('program '.length).trim();
      if (opts.kind === 'part') {
        entryOnly(lineNo, 'the program name');
        continue;
      }
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
      if (opts.kind === 'part') {
        entryOnly(lineNo, 'the platform');
        continue;
      }
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
      if (opts.kind === 'part') {
        entryOnly(lineNo, 'the display');
        continue;
      }
      if (!DISPLAYS.includes(name)) {
        error(lineNo, `Unknown display "${name}". Supported: ${DISPLAYS.join(', ')}.`);
      } else if (display !== null) {
        error(lineNo, 'Duplicate display declaration.');
      } else {
        display = name;
      }
      continue;
    }

    const nextDataLine = parseDataDeclaration({
      text,
      lineNo,
      lines,
      nextLine: i,
      types,
      states,
      pulses,
      timers,
      ramps,
      sounds,
      curves,
      error,
    });
    if (nextDataLine !== undefined) {
      i = nextDataLine;
      continue;
    }

    const nextResourceLine = parseResourceDeclaration({
      text,
      lineNo,
      lines,
      nextLine: i,
      texts,
      sprites,
      tiles,
      shapes,
      error,
    });
    if (nextResourceLine !== undefined) {
      i = nextResourceLine;
      continue;
    }

    if (text.startsWith('bind ')) {
      const match = BIND_KEY_RE.exec(text);
      if (!match) {
        error(
          lineNo,
          `Invalid binding: "${text}". Expected: bind key <KEY> rising -> <Pulse>, or bind key <KEY> held period <N> -> <Pulse>.`,
        );
        continue;
      }
      const trigger = match[2] as string;
      if (trigger === 'rising') {
        bindings.push({
          kind: 'key',
          key: match[1] as string,
          edge: 'rising',
          target: match[3] as string,
          line: lineNo,
        });
      } else {
        const period = parseNumber(trigger.replace(/^held\s+period\s+/, ''));
        if (period === null || period < 1 || period > 255) {
          error(lineNo, `Held binding period must be between 1 and 255.`);
          continue;
        }
        bindings.push({
          kind: 'key',
          key: match[1] as string,
          edge: 'held',
          period,
          target: match[3] as string,
          line: lineNo,
        });
      }
      continue;
    }

    if (text.startsWith('routine ')) {
      const name = text.slice('routine '.length).trim();
      if (!IDENT.test(name)) {
        error(lineNo, `Invalid routine name "${name}".`);
        continue;
      }
      // Routines have no triggers and no dispatch: the header is bare.
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
        error(
          headerLineNo,
          header.startsWith('on ') || header.startsWith('updates ')
            ? `Routine ${name} takes no "${header.split(/\s/)[0]}": routines have no triggers or dispatch — they are called from block bodies.`
            : `Unexpected line in routine ${name}: "${header}".`,
        );
      }
      if (!sawBody) {
        error(lineNo, `routine ${name} has no begin...end body.`);
        continue;
      }
      const bodyLine = i + 1;
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
        error(lineNo, `routine ${name}: missing end.`);
        continue;
      }
      routines.push({ name, body, line: lineNo, bodyLine });
      continue;
    }

    if (text.startsWith('card ')) {
      const name = text.slice('card '.length).trim();
      if (!IDENT.test(name)) {
        error(lineNo, `Invalid card name "${name}".`);
        continue;
      }
      // A card line starts a block-dispatch section: subsequent blocks
      // are gated to that card until the next card line or end of file.
      // Repeating a card name re-enters its section (also across parts).
      if (name.startsWith('_')) {
        error(lineNo, `Reserved card name "${name}": a leading "_" is AZM local-label syntax.`);
        continue;
      }
      if (!cards.some((card) => card.name === name)) {
        cards.push({ name, line: lineNo });
      }
      currentCard = name;
      continue;
    }

    const blockMatch = /^(effect|compute|render|enter)\s+(.*)$/.exec(text);
    if (blockMatch) {
      // Block declarations: the keyword is the phase.
      //   compute X  — derive phase; state computed from other state
      //   effect Y   — logic phase; ordinary game/app behaviour
      //   render Z   — render phase; state depicted, never updated
      //   enter W    — logic phase; runs once on entry to its card
      const keyword = blockMatch[1] as 'effect' | 'compute' | 'render' | 'enter';
      const phase: EffectPhase =
        keyword === 'compute' ? 'derive' : keyword === 'render' ? 'render' : 'logic';
      const parts = (blockMatch[2] ?? '').trim().split(/\s+/);
      const name = parts[0] ?? '';
      if (!IDENT.test(name)) {
        error(lineNo, `Invalid ${keyword} name "${name}".`);
      }
      if (parts.length > 1) {
        error(
          lineNo,
          `${keyword} takes a single name; unexpected "${parts[1]}". (Phase modifiers were replaced by the compute/render keywords.)`,
        );
      }
      if (keyword === 'enter' && currentCard === null) {
        error(lineNo, `enter ${name} must be inside a card section: enter runs on card entry.`);
        continue;
      }
      const depends: string[] = [];
      const updates: string[] = [];
      let gotoTarget: string | undefined;

      // Header lines until the begin body opens. A block with goto may
      // close with a bare end instead: header-only routing blocks.
      let sawBody = false;
      let bodyOptional = false;
      while (i < lines.length) {
        const headerLineNo = i + 1;
        const header = stripComment(lines[i] ?? '').trim();
        i += 1;
        if (header === '') continue;
        if (header === 'begin') {
          sawBody = true;
          break;
        }
        if (header === 'end' && gotoTarget !== undefined) {
          bodyOptional = true;
          break;
        }
        if (header.startsWith('on ')) {
          if (keyword === 'enter') {
            error(
              headerLineNo,
              `enter ${name} takes no "on": card entry is its trigger (CurrentCard changing to ${currentCard ?? 'its card'}).`,
            );
            continue;
          }
          depends.push(...splitNames(header.slice('on '.length)));
          continue;
        }
        if (header.startsWith('updates ')) {
          updates.push(...splitNames(header.slice('updates '.length)));
          continue;
        }
        if (header.startsWith('goto ')) {
          const target = header.slice('goto '.length).trim();
          if (!IDENT.test(target)) {
            error(headerLineNo, `Invalid goto target "${target}" in ${keyword} ${name}.`);
            continue;
          }
          if (keyword === 'render') {
            error(
              headerLineNo,
              `render ${name} cannot goto: render blocks depict state. Route from effect or enter.`,
            );
            continue;
          }
          if (gotoTarget !== undefined) {
            error(headerLineNo, `${keyword} ${name} declares more than one goto.`);
            continue;
          }
          gotoTarget = target;
          continue;
        }
        error(headerLineNo, `Unexpected line in ${keyword} ${name}: "${header}".`);
      }

      if (!sawBody && !bodyOptional) {
        error(lineNo, `${keyword} ${name} has no begin...end body.`);
        continue;
      }

      // Body lines are verbatim until a line containing only "end".
      // The first body line's source position anchors the debug map.
      const bodyLine = i + 1;
      const body: string[] = [];
      if (sawBody) {
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
          error(lineNo, `${keyword} ${name}: missing end.`);
          continue;
        }
      }

      if (keyword === 'enter') {
        // Card entry is the trigger: CurrentCard changed to this card.
        depends.push(CURRENT_CARD);
      } else if (depends.length === 0) {
        error(lineNo, `${keyword} ${name} has no "on" triggers; it would never run.`);
        continue;
      }
      // The keyword carries its constraints.
      if (keyword === 'render' && updates.length > 0) {
        error(
          lineNo,
          `render ${name} cannot update state cells: render blocks depict state. Use effect or compute.`,
        );
        continue;
      }
      if (keyword === 'compute' && updates.length === 0) {
        error(
          lineNo,
          `compute ${name} must declare updates: computing state is a compute block's purpose.`,
        );
        continue;
      }
      const effect: EffectDecl = { name, phase, depends, updates, body, line: lineNo, bodyLine };
      if (currentCard !== null) effect.card = currentCard;
      if (keyword === 'enter') effect.enter = true;
      if (gotoTarget !== undefined) effect.goto = gotoTarget;
      effects.push(effect);
      continue;
    }

    error(lineNo, `Unknown statement: "${text}".`);
  }

  return {
    kind: opts.kind,
    file: opts.file,
    programName,
    platform,
    display,
    parts,
    imports,
    types,
    states,
    pulses,
    timers,
    ramps,
    sounds,
    curves,
    shapes,
    sprites,
    tiles,
    texts,
    bindings,
    effects,
    routines,
    cards,
    diagnostics,
  };
}
