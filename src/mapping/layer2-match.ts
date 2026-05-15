/**
 * @fileoverview Pure text matching helpers for Layer 2 source mapping.
 */

/** Pattern to detect data directives (DB, DW, etc.) */
export const DATA_DIRECTIVE = /^(DB|DW|DS|DEFB|DEFW|DEFS|INCBIN)\b/;

export type NormalizedSourceFile = {
  normLines: string[];
};

export function findCandidateMatch(
  candidateFiles: string[],
  fileData: Map<string, NormalizedSourceFile>,
  norm: string,
  hintLine: number | null
): { file: string; line: number; ambiguous: boolean } | null {
  for (const candidateFile of candidateFiles) {
    const candidateInfo = fileData.get(candidateFile);
    if (!candidateInfo) {
      continue;
    }
    const matches = findMatches(candidateInfo.normLines, norm, hintLine);
    const { line, ambiguous } = chooseMatch(matches, hintLine);
    if (line !== null) {
      return { file: candidateFile, line, ambiguous };
    }
  }
  return null;
}

export function normalizeAsm(line: string): string {
  const stripped = stripComment(line);
  let text = stripped.trim();
  if (text.length === 0) {
    return '';
  }
  text = text.replace(/\s+/g, ' ');
  text = text.toUpperCase();
  text = text.replace(/\s*,\s*/g, ',');
  text = text.replace(/\s*([+\-*/()])\s*/g, '$1');
  return text;
}

function stripComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (ch === ';' && !inSingle && !inDouble) {
      return line.slice(0, i);
    }
  }
  return line;
}

export function findMatches(
  normLines: string[],
  target: string,
  hintLine: number | null
): number[] {
  const total = normLines.length;
  let start = 1;
  let end = total;
  if (hintLine !== null) {
    start = Math.max(1, hintLine - 40);
    end = Math.min(total, hintLine + 200);
  }
  const matches: number[] = [];
  for (let i = start; i <= end; i += 1) {
    if (normLines[i - 1] === target) {
      matches.push(i);
    }
  }
  return matches;
}

export function chooseMatch(
  matches: number[],
  hintLine: number | null
): { line: number | null; ambiguous: boolean } {
  if (matches.length === 0) {
    return { line: null, ambiguous: false };
  }
  let chosen = matches[0];
  if (hintLine !== null) {
    const forward = matches.find((m) => m >= hintLine);
    if (forward !== undefined) {
      chosen = forward;
    }
  }
  return { line: chosen ?? null, ambiguous: matches.length > 1 };
}
