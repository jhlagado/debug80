import type { CurvePreset, ShapeColor, ShapeDecl, ShapeRotation, VdpColor } from './model.js';

export const PLATFORMS = ['tec1g-mon3'];
export const DISPLAYS = ['matrix8x8', 'tms9918'];

export const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const STATE_RE =
  /^state\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*(?:\[\S+\])?)(?:\s*=\s*(\S+))?(\s+changed)?$/;
/** AZM type expression: TypeName or TypeName[N] (byte/word/addr included). */
export const TYPE_EXPR_RE = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[(\d+)\])?$/;
/** A layout field type: byte/word/addr, a positive byte count, or a type expression. */
export const FIELD_TYPE_RE = /^(?:byte|word|addr|[1-9][0-9]*|[A-Za-z_][A-Za-z0-9_]*(?:\[\d+\])?)$/;
export const BIND_KEY_RE =
  /^bind\s+key\s+([A-Za-z_][A-Za-z0-9_]*)\s+(rising|held\s+period\s+\S+)\s*->\s*([A-Za-z_][A-Za-z0-9_]*)$/;
export const TIMER_RE =
  /^timer\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(byte|word)\s*=\s*(\S+)\s*->\s*([A-Za-z_][A-Za-z0-9_]*)(\s+once)?$/;
export const RAMP_RE =
  /^ramp\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*byte\s+steps\s+(\S+)\s*->\s*([A-Za-z_][A-Za-z0-9_]*)$/;
export const PART_RE = /^part\s+"([^"]+)"$/;
export const IMPORT_RE = /^import\s+"([^"]+)"$/;
export const SOUND_RE = /^sound\s+([A-Za-z_][A-Za-z0-9_]*)\s+len\s+(\S+)\s+div\s+(\S+)$/;
export const SHAPE_RE = /^shape\s+([A-Za-z_][A-Za-z0-9_]*)\s+color\s+([A-Za-z_][A-Za-z0-9_]*)$/;
export const SHAPE_ROW_RE = /^"([.X]+)"$/;
export const CURVE_RE =
  /^curve\s+([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s+steps\s+(\S+)(?:\s+from\s+(\S+)\s+to\s+(\S+))?$/;
export const SHAPE_COLORS: readonly ShapeColor[] = [
  'red',
  'green',
  'blue',
  'yellow',
  'cyan',
  'magenta',
  'white',
];
export const TEXT_RE = /^text\s+([A-Za-z_][A-Za-z0-9_]*)\s+"([^"]*)"\s*(?:;.*)?$/;
export const SPRITE_RE = /^sprite\s+([A-Za-z_][A-Za-z0-9_]*)\s+color\s+([A-Za-z_][A-Za-z0-9_]*)$/;
export const TILE_RE =
  /^tile\s+([A-Za-z_][A-Za-z0-9_]*)\s+color\s+([A-Za-z_][A-Za-z0-9_]*)\s+on\s+([A-Za-z_][A-Za-z0-9_]*)$/;
export const VDP_COLORS: readonly VdpColor[] = [
  'transparent',
  'black',
  'medgreen',
  'lightgreen',
  'darkblue',
  'lightblue',
  'darkred',
  'cyan',
  'medred',
  'lightred',
  'darkyellow',
  'lightyellow',
  'darkgreen',
  'magenta',
  'gray',
  'white',
];

export const CURVE_PRESETS: readonly CurvePreset[] = [
  'linear',
  'ease_in',
  'ease_out',
  'ease_in_out',
  'sine',
  'overshoot',
  'anticipation',
];

export function stripComment(line: string): string {
  const semi = line.indexOf(';');
  return semi >= 0 ? line.slice(0, semi) : line;
}

export function parseNumber(text: string): number | null {
  let value: number;
  if (text.startsWith('$')) {
    const digits = text.slice(1);
    if (!/^[0-9A-Fa-f]+$/.test(digits)) return null;
    value = Number.parseInt(digits, 16);
  } else if (/^0x/i.test(text)) {
    const digits = text.slice(2);
    if (!/^[0-9A-Fa-f]+$/.test(digits)) return null;
    value = Number.parseInt(digits, 16);
  } else if (text.startsWith('%')) {
    const digits = text.slice(1);
    if (!/^[01]+$/.test(digits)) return null;
    value = Number.parseInt(digits, 2);
  } else if (/^[0-9]+$/.test(text)) {
    value = Number.parseInt(text, 10);
  } else {
    return null;
  }
  return Number.isNaN(value) ? null : value;
}

export function splitNames(text: string): string[] {
  return text
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');
}

/**
 * Validate rot0..rotN groups and build the rotation set. Declared
 * rotations (groups and aliases) fill positions 0..count-1; positions
 * beyond that cycle through the declared ones (r mod count), which
 * covers the corpus pieces: I declares two rotations, O one, T all
 * four, S/Z three plus a rot3 = rot1 alias.
 */
export function buildRotationalShape(
  name: string,
  color: ShapeColor,
  rotGroups: string[][],
  rotAliases: Map<number, number>,
  rotCount: number,
  lineNo: number,
  error: (line: number, message: string) => void,
): ShapeDecl | null {
  const distinct: ShapeRotation[] = [];
  for (const rows of rotGroups) {
    if (rows.length === 0 || rows.length > 4) {
      error(lineNo, `Shape ${name}: each rotation needs 1 to 4 rows.`);
      return null;
    }
    const width = rows[0]?.length ?? 0;
    if (rows.some((row) => row.length !== width)) {
      error(lineNo, `Shape ${name}: all rows in a rotation must have the same width.`);
      return null;
    }
    if (width < 1 || width > 8) {
      error(lineNo, `Shape ${name}: rotation width must be between 1 and 8.`);
      return null;
    }
    let right = -1;
    for (const row of rows) {
      for (let col = 0; col < row.length; col += 1) {
        if (row[col] === 'X' && col > right) right = col;
      }
    }
    if (right < 0) {
      error(lineNo, `Shape ${name}: a rotation has no set pixels.`);
      return null;
    }
    distinct.push({ rows: [...rows], width, height: rows.length, right });
  }

  // Resolve declared positions to distinct indexes: groups in order,
  // aliases to their target's resolution.
  const resolved: number[] = [];
  let nextGroup = 0;
  for (let r = 0; r < rotCount; r += 1) {
    const aliasTarget = rotAliases.get(r);
    if (aliasTarget !== undefined) {
      resolved.push(resolved[aliasTarget] as number);
    } else {
      resolved.push(nextGroup);
      nextGroup += 1;
    }
  }
  const map = [0, 1, 2, 3].map((r) => resolved[r % rotCount] as number) as [
    number,
    number,
    number,
    number,
  ];
  const base = distinct[0] as ShapeRotation;
  return {
    name,
    color,
    rows: [...base.rows],
    width: base.width,
    height: base.height,
    line: lineNo,
    rotations: { distinct, map },
  };
}
