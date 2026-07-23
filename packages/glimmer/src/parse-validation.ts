import type {
  EffectDecl,
  GlimmerDiagnostic,
  GlimmerProgram,
  StateDecl,
  TypeDecl,
} from './model.js';
import { CURRENT_CARD, FRAME_COUNT } from './model.js';

export function validateReferences(
  parts: Pick<
    GlimmerProgram,
    | 'types'
    | 'states'
    | 'pulses'
    | 'timers'
    | 'ramps'
    | 'sounds'
    | 'curves'
    | 'shapes'
    | 'sprites'
    | 'tiles'
    | 'texts'
    | 'bindings'
    | 'effects'
    | 'routines'
    | 'cards'
  >,
  diagnostics: GlimmerDiagnostic[],
  fileOf: (owner: object) => string | undefined = () => undefined,
): void {
  const error = (owner: { line: number }, message: string): void => {
    const file = fileOf(owner);
    diagnostics.push(
      file === undefined ? { line: owner.line, message } : { line: owner.line, message, file },
    );
  };
  const warn = (owner: { line: number }, message: string): void => {
    const file = fileOf(owner);
    diagnostics.push({
      line: owner.line,
      message,
      severity: 'warning',
      ...(file === undefined ? {} : { file }),
    });
  };

  // All declared names — states, pulses, effects (and future constructs) —
  // share one namespace: they all project into one flat AZM symbol space.
  // Names that would collide with generated or profile symbols are
  // reserved so the diagnostic points at the .glim line, with AZM's
  // global-uniqueness check as the backstop.
  const declaredNames = new Set<string>();
  const declare = (owner: { line: number }, name: string, kind: string): void => {
    if (declaredNames.has(name)) {
      error(owner, `Duplicate name "${name}": all declared names share one namespace.`);
    }
    declaredNames.add(name);
    if (name.startsWith('_')) {
      // AZM 0.3: a leading `_` is local-label syntax (and `__` is
      // reserved for AZM implementation symbols); declared .glim names
      // become file-level AZM symbols and cannot use it.
      error(
        owner,
        `Reserved name "${name}": a leading "_" is AZM local-label syntax, so ${kind}s cannot start with "_".`,
      );
      return;
    }
    if (
      /^(Glim|Snd_|Curve_|Shape_|ShapeRot_|ShapeId_|CHG_|KEY_|API_|VC_|VDP_|VRAM_)/.test(name) ||
      RESERVED_NAMES.has(name)
    ) {
      error(
        owner,
        `Reserved name "${name}": it belongs to the generated runtime (${kind}s cannot use Glim*/Snd_*/Curve_*/Shape_*/CHG_* or runtime symbols).`,
      );
    }
  };

  for (const type of parts.types) declare(type, type.name, 'type');
  for (const state of parts.states) declare(state, state.name, 'state');
  for (const pulse of parts.pulses) declare(pulse, pulse.name, 'pulse');
  for (const timer of parts.timers) declare(timer, timer.name, 'timer');
  for (const ramp of parts.ramps) declare(ramp, ramp.name, 'ramp');
  for (const sound of parts.sounds) declare(sound, sound.name, 'sound');
  for (const curve of parts.curves) declare(curve, curve.name, 'curve');
  for (const shape of parts.shapes) declare(shape, shape.name, 'shape');
  for (const sprite of parts.sprites) declare(sprite, sprite.name, 'sprite');
  for (const tile of parts.tiles) declare(tile, tile.name, 'tile');
  for (const textDecl of parts.texts) declare(textDecl, textDecl.name, 'text');
  for (const effect of parts.effects) declare(effect, effect.name, 'effect');
  for (const routine of parts.routines) declare(routine, routine.name, 'routine');

  // `on` accepts anything with a change flag: states, pulses, ramps, and
  // the built-in FrameCount. `updates` accepts what code may write:
  // states, timers (the period register), and ramps (retriggering).
  // Timer cells carry no flag — the pulse is the notification — so they
  // cannot appear in `on`.
  const pulseNames = new Set(parts.pulses.map((pulse) => pulse.name));
  const timerNames = new Set(parts.timers.map((timer) => timer.name));
  const hasCards = parts.cards.length > 0;
  const cardNames = new Set(parts.cards.map((card) => card.name));
  const onNames = new Set([
    ...parts.states.map((s) => s.name),
    ...pulseNames,
    ...parts.ramps.map((r) => r.name),
    FRAME_COUNT,
    ...(hasCards ? [CURRENT_CARD] : []),
  ]);
  const updateNames = new Set([
    ...parts.states.map((s) => s.name),
    ...timerNames,
    ...parts.ramps.map((r) => r.name),
    ...(hasCards ? [CURRENT_CARD] : []),
  ]);

  for (const binding of parts.bindings) {
    if (!pulseNames.has(binding.target)) {
      error(binding, `Binding target "${binding.target}" is not a declared pulse.`);
    }
  }
  for (const timer of parts.timers) {
    if (!pulseNames.has(timer.target)) {
      error(timer, `Timer ${timer.name} fires "${timer.target}", which is not a declared pulse.`);
    }
  }
  for (const ramp of parts.ramps) {
    if (!pulseNames.has(ramp.target)) {
      error(ramp, `Ramp ${ramp.name} fires "${ramp.target}", which is not a declared pulse.`);
    }
  }

  for (const effect of parts.effects) {
    for (const dep of effect.depends) {
      if (!onNames.has(dep)) {
        const hint = timerNames.has(dep)
          ? ` (timer cells carry no change flag; trigger on the timer's pulse instead)`
          : '';
        error(effect, `Effect ${effect.name} triggers on undeclared cell "${dep}".${hint}`);
      }
    }
    for (const target of effect.updates) {
      if (!updateNames.has(target)) {
        error(effect, `Effect ${effect.name} updates undeclared state "${target}".`);
      }
    }
  }

  for (const effect of parts.effects) {
    if (effect.goto !== undefined && !cardNames.has(effect.goto)) {
      error(effect, `${effect.name}: goto target "${effect.goto}" is not a declared card.`);
    }
  }

  // Blocks in one dispatch pass execute sequentially against live memory. A
  // shared trigger proves that both blocks are scheduled, but `updates` cannot
  // prove a conditional Z80 body actually stores. Warn on that declaration-level
  // overlap. Different unconditional goto targets are the one definite conflict:
  // both wrappers necessarily store distinct CurrentCard values.
  for (let rightIndex = 1; rightIndex < parts.effects.length; rightIndex += 1) {
    const right = parts.effects[rightIndex] as EffectDecl;
    for (let leftIndex = 0; leftIndex < rightIndex; leftIndex += 1) {
      const left = parts.effects[leftIndex] as EffectDecl;
      if (left.phase !== right.phase) continue;
      if (left.card !== undefined && right.card !== undefined && left.card !== right.card) continue;

      const sharedTriggers = right.depends.filter((name) => left.depends.includes(name));
      if (sharedTriggers.length === 0) continue;
      const sharedTrigger = sharedTriggers[0] as string;

      if (left.goto !== undefined && right.goto !== undefined && left.goto !== right.goto) {
        error(
          right,
          `Definite same-frame navigation conflict: ${left.name} and ${right.name} run in the ${right.phase} phase on "${sharedTrigger}" while their card scopes overlap, but goto different cards (${left.goto} and ${right.goto}); the destination would depend on declaration order. Combine the routing decision in one block.`,
        );
        continue;
      }

      const sharedTargets = right.updates.filter((name) => left.updates.includes(name));
      const reportTargets = sharedTargets.filter(
        (name) =>
          name !== CURRENT_CARD ||
          left.goto === undefined ||
          right.goto === undefined ||
          left.goto !== right.goto,
      );
      if (reportTargets.length === 0) continue;

      warn(
        right,
        `Potential same-frame write overlap: ${left.name} and ${right.name} run in the ${right.phase} phase on "${sharedTrigger}" and both declare updates ${reportTargets.map((name) => `"${name}"`).join(', ')} while their card scopes overlap. Z80 bodies use live memory in dispatch order; keep one invariant in one block or verify that the writes are exclusive or order-independent.`,
      );
    }
  }

  // Lint: a body that stores into a flag-carrying cell it does not
  // declare in `updates` silently skips change propagation — the
  // dependency report and downstream triggers would lie. Direct
  // `ld (Cell),` stores only; writes through pointer registers are
  // invisible to a text scan.
  const storeRe = /\bld\s+\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*,/i;
  for (const effect of parts.effects) {
    const missing = new Set<string>();
    for (const line of effect.body) {
      const semi = line.indexOf(';');
      const code = semi >= 0 ? line.slice(0, semi) : line;
      const match = storeRe.exec(code);
      if (!match) continue;
      const cell = match[1] as string;
      if (!updateNames.has(cell)) continue;
      if (effect.updates.includes(cell)) continue;
      missing.add(cell);
    }
    for (const cell of missing) {
      warn(
        effect,
        `${effect.name} writes ${cell} but does not declare "updates ${cell}": the change flag will not be raised and dependent blocks will not run.`,
      );
    }
  }

  validateTypeReferences(parts.types, parts.states, error);
}

/** Base name of a field/alias type expression, if it names a layout type. */
function typeExprBaseName(expr: string): string | undefined {
  const base = expr.replace(/\[\d+\]$/, '');
  if (base === 'byte' || base === 'word' || base === 'addr') return undefined;
  return /^[1-9][0-9]*$/.test(base) ? undefined : base;
}

function validateTypeReferences(
  types: readonly TypeDecl[],
  states: readonly StateDecl[],
  error: (owner: { line: number }, message: string) => void,
): void {
  const typeByName = new Map(types.map((type) => [type.name, type]));

  for (const state of states) {
    if (state.typeName !== undefined && !typeByName.has(state.typeName)) {
      error(state, `State ${state.name}: unknown type "${state.typeName}".`);
    }
  }
  for (const type of types) {
    if (type.alias !== undefined) {
      const base = typeExprBaseName(type.alias);
      if (base !== undefined && !typeByName.has(base)) {
        error(type, `Type ${type.name}: unknown alias target "${type.alias}".`);
      }
      continue;
    }
    for (const field of type.fields) {
      const base = typeExprBaseName(field.type);
      if (base !== undefined && !typeByName.has(base)) {
        error(type, `Type ${type.name}: field ${field.name} has unknown type "${field.type}".`);
      }
    }
  }

  // Cycles make a layout infinitely sized; catch them here so the
  // diagnostic points at the .glim line instead of generated AZM.
  const visiting = new Set<string>();
  const safe = new Set<string>();
  const cyclic = new Set<string>();
  const visit = (name: string): boolean => {
    if (safe.has(name)) return true;
    if (visiting.has(name) || cyclic.has(name)) return false;
    const type = typeByName.get(name);
    if (type === undefined) return true;
    visiting.add(name);
    const exprs = type.alias !== undefined ? [type.alias] : type.fields.map((f) => f.type);
    let ok = true;
    for (const expr of exprs) {
      const base = typeExprBaseName(expr);
      if (base !== undefined && !visit(base)) ok = false;
    }
    visiting.delete(name);
    (ok ? safe : cyclic).add(name);
    return ok;
  };
  for (const type of types) {
    if (!visit(type.name)) {
      error(type, `Type ${type.name} is recursive: a layout cannot contain itself.`);
    }
  }
}

/** Symbols the generated runtime and profiles own; user names must avoid them. */
const RESERVED_NAMES = new Set([
  ...Array.from({ length: 4 }, (_, bank) => `Changed${bank}`),
  ...Array.from({ length: 4 }, (_, bank) => `Raised${bank}`),
  ...Array.from({ length: 4 }, (_, bank) => `Next${bank}`),
  'Start',
  'MainLoop',
  'Framebuffer',
  'CurrentCard',
  'Card',
  'PrevKeys',
  'ScanFrame',
  'MxMask',
  'FbPlot',
  'FbClear',
  'ScanDwellPeriod',
  'ApiScanKeys',
  'ApiRandom',
  'ApiStringToLcd',
  'ApiCharToLcd',
  'ApiCommandToLcd',
  'LcdRow1',
  'LcdRow2',
  'LcdRow3',
  'LcdRow4',
  'PortRow',
  'PortRed',
  'PortGreen',
  'PortBlue',
  'COLOR_RED',
  'COLOR_GREEN',
  'COLOR_BLUE',
  'COLOR_YELLOW',
  'COLOR_CYAN',
  'COLOR_MAGENTA',
  'COLOR_WHITE',
  'API_ReadKeys',
  'API_DrawChar',
  'API_FlushDisplay',
  'API_InitDisplay',
  'FrameCount',
  'PortDigits',
  'PortSegs',
  'SpeakerBit',
  'SpeakerPort',
  'SoundTimer',
  'SndDivReload',
  'SndDivCount',
  'SndStart',
  'SndService',
  'HudScanDig',
  'HudBlankDig',
  'HudWriteU16',
  'HudDecDigit',
  'HudSegBuffer',
  'HudScanIndex',
  'HudMaskTbl',
  'HudGlyphTbl',
  'ShapeDraw',
  'ShapePtr',
  'ShapeBaseX',
  'ShapeBaseY',
  'ShapeWidth',
  'ShapeHeight',
  'ShapeColor',
  'ShapeRotPtrTable',
  'ShapeRotRightTbl',
  'ShapeRotColorTbl',
  'ShapeRotCount',
  'VdpInit',
  'VdpSetAddrWrite',
  'VdpWriteBlock',
  'VdpFill',
  'VdpWaitVBlank',
  'VdpRegInitTbl',
  'SpriteSet',
  'SpriteInit',
  'SpriteShadow',
  'SpriteDirty',
  'NamePut',
  'NameShadow',
  'NameDirtyRows',
  'CommitNameRow',
  'LoadResourcesVram',
  'ShapeRowMask',
  'ShapeRowIndex',
  'ShapeColIndex',
  'ShapeDrawRow',
  'ShapeDrawCol',
  'ShapeDrawSkipPixel',
  'ShapeDrawNextRow',
]);
