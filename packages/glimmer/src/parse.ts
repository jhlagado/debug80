/** Parser facade and multi-file program assembly for Glimmer source. */

import type {
  Binding,
  CardDecl,
  CurveDecl,
  EffectDecl,
  GlimmerDiagnostic,
  GlimmerProgram,
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
import { CURRENT_CARD, TEC1G_KEY_CODES } from './model.js';
import { parseUnit, type ParsedUnit } from './parse-unit.js';
import { validateReferences } from './parse-validation.js';

export { parseNumber } from './parse-syntax.js';
export { parseUnit } from './parse-unit.js';
export type { ParsedUnit } from './parse-unit.js';

export interface ParseResult {
  program: GlimmerProgram | null;
  diagnostics: GlimmerDiagnostic[];
}

/**
 * Merge parsed units (the entry first, then its parts in declaration
 * order) into one program and validate the whole. Parts contribute to
 * the same single namespace: the compilation unit is the project.
 */
export function assembleProgram(units: ParsedUnit[]): ParseResult {
  const diagnostics: GlimmerDiagnostic[] = [];
  const entry = units[0];
  if (entry === undefined) {
    return { program: null, diagnostics: [{ line: 0, message: 'Nothing to assemble.' }] };
  }
  for (const unit of units) diagnostics.push(...unit.diagnostics);

  const fileOf = new Map<object, string | undefined>();
  const merged = {
    types: [] as TypeDecl[],
    states: [] as StateDecl[],
    pulses: [] as PulseDecl[],
    timers: [] as TimerDecl[],
    ramps: [] as RampDecl[],
    sounds: [] as SoundDecl[],
    curves: [] as CurveDecl[],
    shapes: [] as ShapeDecl[],
    sprites: [] as SpriteDecl[],
    tiles: [] as TileDecl[],
    texts: [] as TextDecl[],
    bindings: [] as Binding[],
    effects: [] as EffectDecl[],
    routines: [] as RoutineDecl[],
    cards: [] as CardDecl[],
    imports: [] as ImportDecl[],
  };
  for (const unit of units) {
    for (const key of Object.keys(merged) as (keyof typeof merged)[]) {
      for (const decl of unit[key]) {
        fileOf.set(decl, unit.file);
        (merged[key] as object[]).push(decl);
      }
    }
  }
  // Blocks carry their declaring file into the model: the debug-map
  // rewrite attributes generated body lines back to the right .glim file.
  for (const effect of merged.effects) {
    const file = fileOf.get(effect);
    if (file !== undefined) effect.file = file;
  }
  for (const routine of merged.routines) {
    const file = fileOf.get(routine);
    if (file !== undefined) routine.file = file;
  }
  // Card sections may repeat (re-entering a card, or a part contributing
  // blocks to a card the entry declared): one card per name, in order of
  // first appearance. The first card is the one the program starts in.
  const seenCards = new Set<string>();
  merged.cards = merged.cards.filter((card) => {
    if (seenCards.has(card.name)) return false;
    seenCards.add(card.name);
    return true;
  });
  // goto is an update of CurrentCard: fold it into `updates` so change
  // masks, rollover, and the dependency report all see the real dataflow.
  for (const effect of merged.effects) {
    if (effect.goto !== undefined && !effect.updates.includes(CURRENT_CARD)) {
      effect.updates.push(CURRENT_CARD);
    }
  }
  const error = (owner: { line: number } | number, message: string): void => {
    if (typeof owner === 'number') {
      diagnostics.push({ line: owner, message, file: entry.file } as GlimmerDiagnostic);
      return;
    }
    const file = fileOf.get(owner);
    diagnostics.push(
      file === undefined ? { line: owner.line, message } : { line: owner.line, message, file },
    );
  };

  const { programName, platform, display } = entry;
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
    for (const binding of merged.bindings) {
      if (binding.key === 'any') {
        if (binding.edge === 'held') {
          error(
            binding,
            'bind key any supports rising only: "any" has no single key to autorepeat.',
          );
        }
        continue;
      }
      if (!TEC1G_KEY_CODES.has(binding.key)) {
        error(
          binding,
          `Unknown tec1g-mon3 key "${binding.key}". Known keys: KEY_0..KEY_F, KEY_PLUS, KEY_MINUS, KEY_GO, KEY_AD.`,
        );
      }
    }
  } else {
    for (const binding of merged.bindings) {
      if (binding.edge === 'held') {
        error(binding, 'Held bindings require platform tec1g-mon3.');
      }
      if (binding.key === 'any') {
        error(binding, 'bind key any requires platform tec1g-mon3.');
      }
    }
  }
  if (merged.sounds.length > 0 && !(platform === 'tec1g-mon3' && display === 'matrix8x8')) {
    for (const sound of merged.sounds) {
      error(sound, 'Sound cues require platform tec1g-mon3 with display matrix8x8.');
    }
  }
  if (merged.shapes.length > 0 && !(platform === 'tec1g-mon3' && display === 'matrix8x8')) {
    for (const shape of merged.shapes) {
      error(shape, 'Shape resources require platform tec1g-mon3 with display matrix8x8.');
    }
  }
  if (
    (merged.sprites.length > 0 || merged.tiles.length > 0) &&
    !(platform === 'tec1g-mon3' && display === 'tms9918')
  ) {
    for (const decl of [...merged.sprites, ...merged.tiles]) {
      error(decl, 'Sprite and tile resources require platform tec1g-mon3 with display tms9918.');
    }
  }
  if (merged.texts.length > 0 && platform !== 'tec1g-mon3') {
    for (const textDecl of merged.texts) {
      error(textDecl, 'Text resources require platform tec1g-mon3 (the board LCD).');
    }
  }
  if (merged.sprites.length > 31) {
    error(
      merged.sprites[31] as SpriteDecl,
      'At most 31 sprites (slot 31 stays the hidden terminator).',
    );
  }

  validateReferences(merged, diagnostics, (owner) => fileOf.get(owner));

  const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity !== 'warning');
  if (hasErrors || programName === null) {
    return { program: null, diagnostics };
  }
  return {
    program: {
      name: programName,
      platform,
      display,
      ...merged,
    },
    diagnostics,
  };
}

/**
 * Parse a single-file program. Multi-file programs (`part` declarations)
 * need file loading: use loadGlimmerProgram or the CLI.
 */
export function parseGlimmer(source: string): ParseResult {
  const unit = parseUnit(source, { kind: 'entry' });
  if (unit.parts.length > 0) {
    unit.diagnostics.push({
      line: unit.parts[0]?.line ?? 0,
      message:
        'part declarations need file loading: compile with the glimmer CLI (or loadGlimmerProgram).',
    });
  }
  return assembleProgram([unit]);
}
