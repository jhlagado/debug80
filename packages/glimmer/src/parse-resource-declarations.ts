import type { ShapeColor, ShapeDecl, SpriteDecl, TextDecl, TileDecl, VdpColor } from './model.js';
import {
  buildRotationalShape,
  SHAPE_COLORS,
  SHAPE_RE,
  SHAPE_ROW_RE,
  SPRITE_RE,
  TEXT_RE,
  TILE_RE,
  VDP_COLORS,
  stripComment,
} from './parse-syntax.js';

export function parseResourceDeclaration(options: {
  text: string;
  lineNo: number;
  lines: readonly string[];
  nextLine: number;
  texts: TextDecl[];
  sprites: SpriteDecl[];
  tiles: TileDecl[];
  shapes: ShapeDecl[];
  error: (line: number, message: string) => void;
}): number | undefined {
  const { text, lineNo, lines, texts, sprites, tiles, shapes, error } = options;
  let i = options.nextLine;
  let handled = false;

  do {
    if (text.startsWith('text ')) {
      handled = true;
      // Match against the raw line: the string may contain semicolons,
      // so comment stripping only applies after the closing quote.
      const raw = (lines[i - 1] ?? '').trim();
      const match = TEXT_RE.exec(raw);
      if (!match) {
        error(lineNo, `Invalid text declaration: "${raw}". Expected: text <Name> "STRING".`);
        continue;
      }
      texts.push({ name: match[1] as string, value: match[2] as string, line: lineNo });
      continue;
    }

    if (text.startsWith('sprite ') || text.startsWith('tile ')) {
      handled = true;
      const isSprite = text.startsWith('sprite ');
      const match = isSprite ? SPRITE_RE.exec(text) : TILE_RE.exec(text);
      const rows: string[] = [];
      let sawEnd = false;
      while (i < lines.length) {
        const raw = lines[i] ?? '';
        i += 1;
        const rowText = stripComment(raw).trim();
        if (rowText === 'end') {
          sawEnd = true;
          break;
        }
        if (rowText === '') continue;
        const rowMatch = SHAPE_ROW_RE.exec(rowText);
        if (!rowMatch) {
          error(
            i,
            `Invalid ${isSprite ? 'sprite' : 'tile'} row: "${rowText}". Expected a quoted row using only . and X.`,
          );
          continue;
        }
        rows.push(rowMatch[1] as string);
      }
      if (!match) {
        error(
          lineNo,
          isSprite
            ? `Invalid sprite declaration: "${text}". Expected: sprite <Name> color <VdpColor>.`
            : `Invalid tile declaration: "${text}". Expected: tile <Name> color <Fg> on <Bg>.`,
        );
        continue;
      }
      const name = match[1] as string;
      if (!sawEnd) {
        error(lineNo, `${isSprite ? 'Sprite' : 'Tile'} ${name}: missing end.`);
        continue;
      }
      if (rows.length !== 8 || rows.some((row) => row.length !== 8)) {
        error(lineNo, `${isSprite ? 'Sprite' : 'Tile'} ${name}: needs exactly 8 rows of 8 pixels.`);
        continue;
      }
      const colors = (isSprite ? [match[2]] : [match[2], match[3]]) as string[];
      const badColor = colors.find((c) => !VDP_COLORS.includes(c as VdpColor));
      if (badColor !== undefined) {
        error(lineNo, `${isSprite ? 'Sprite' : 'Tile'} ${name}: unknown colour "${badColor}".`);
        continue;
      }
      if (isSprite) {
        sprites.push({ name, color: colors[0] as VdpColor, rows, line: lineNo });
      } else {
        tiles.push({
          name,
          fg: colors[0] as VdpColor,
          bg: colors[1] as VdpColor,
          rows,
          line: lineNo,
        });
      }
      continue;
    }

    if (text.startsWith('shape ')) {
      handled = true;
      const match = SHAPE_RE.exec(text);
      const rows: string[] = [];
      // Rotational form: rotN groups (optionally rotN = rotM aliases).
      const rotGroups: string[][] = [];
      const rotAliases = new Map<number, number>();
      let currentRot: string[] | null = null;
      let rotCount = 0;
      let rotError = false;
      let sawEnd = false;

      while (i < lines.length) {
        const raw = lines[i] ?? '';
        i += 1;
        const rowText = stripComment(raw).trim();
        if (rowText === 'end') {
          sawEnd = true;
          break;
        }
        if (rowText === '') continue;
        const aliasMatch = /^rot([0-3])\s*=\s*rot([0-3])$/.exec(rowText);
        if (aliasMatch) {
          const n = Number(aliasMatch[1]);
          const m = Number(aliasMatch[2]);
          if (n !== rotCount || m >= rotCount || rotAliases.has(m)) {
            error(
              i,
              `Shape rotation alias must name the next rotation and an earlier distinct one: "${rowText}".`,
            );
            rotError = true;
          } else {
            rotAliases.set(n, m);
          }
          rotCount += 1;
          currentRot = null;
          continue;
        }
        const rotMatch = /^rot([0-3])\b\s*(.*)$/.exec(rowText);
        if (rotMatch) {
          const n = Number(rotMatch[1]);
          if (n !== rotCount) {
            error(
              i,
              `Shape rotations must be declared in order: expected rot${rotCount}, got rot${n}.`,
            );
            rotError = true;
          }
          rotCount += 1;
          currentRot = [];
          rotGroups.push(currentRot);
          const rest = (rotMatch[2] ?? '').trim();
          if (rest !== '') {
            const restMatch = SHAPE_ROW_RE.exec(rest);
            if (!restMatch) {
              error(i, `Invalid shape row: "${rest}". Expected a quoted row using only . and X.`);
              rotError = true;
            } else {
              currentRot.push(restMatch[1] as string);
            }
          }
          continue;
        }
        const rowMatch = SHAPE_ROW_RE.exec(rowText);
        if (!rowMatch) {
          error(i, `Invalid shape row: "${rowText}". Expected a quoted row using only . and X.`);
          continue;
        }
        if (currentRot !== null) {
          currentRot.push(rowMatch[1] as string);
        } else if (rotCount > 0) {
          error(
            i,
            `Shape row outside a rotation group (rot0..rot3 shapes take rows inside groups).`,
          );
          rotError = true;
        } else {
          rows.push(rowMatch[1] as string);
        }
      }

      if (!match) {
        error(
          lineNo,
          `Invalid shape declaration: "${text}". Expected: shape <Name> color <Color>.`,
        );
        continue;
      }
      const name = match[1] as string;
      const color = match[2] as string;
      if (!sawEnd) {
        error(lineNo, `Shape ${name}: missing end.`);
        continue;
      }
      if (!SHAPE_COLORS.includes(color as ShapeColor)) {
        error(lineNo, `Shape ${name}: unknown color "${color}".`);
        continue;
      }
      if (rotCount > 0) {
        if (rotError) continue;
        if (rows.length > 0) {
          error(lineNo, `Shape ${name}: mixes plain rows with rotation groups.`);
          continue;
        }
        const shape = buildRotationalShape(
          name,
          color as ShapeColor,
          rotGroups,
          rotAliases,
          rotCount,
          lineNo,
          error,
        );
        if (shape !== null) shapes.push(shape);
        continue;
      }
      if (rows.length === 0) {
        error(lineNo, `Shape ${name}: must contain at least one row.`);
        continue;
      }
      const width = rows[0]?.length ?? 0;
      const badRow = rows.find((row) => row.length !== width);
      if (badRow !== undefined) {
        error(lineNo, `Shape ${name}: all rows must have width ${width}.`);
        continue;
      }
      if (width < 1 || width > 8 || rows.length < 1 || rows.length > 8) {
        error(lineNo, `Shape ${name}: width and height must be between 1 and 8.`);
        continue;
      }
      shapes.push({
        name,
        color: color as ShapeColor,
        rows,
        width,
        height: rows.length,
        line: lineNo,
      });
      continue;
    }
  } while (false);

  return handled ? i : undefined;
}
