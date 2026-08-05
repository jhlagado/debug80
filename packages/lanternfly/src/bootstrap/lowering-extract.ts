import { readFileSync } from "node:fs";

/**
 * Reads emitted byte sequences out of the Lanternfly source.
 *
 * Review finding 28: the lowering tests carried their own copies of the
 * mnemonics and the bytes, so they proved that two things copied into the
 * test agreed with each other. Changing an emitter left them green.
 *
 * This module removes the copy. It parses the emitting routines in the
 * `.lafy` source, resolves their opcode constants, expands their calls to one
 * another, and produces the byte sequence each one emits. The test then has
 * three representations to pin together: the source, the assembler, and the
 * document.
 *
 * It is a reader for a known shape rather than a Lanternfly interpreter. The
 * emitting routines are straight-line runs of `emit` and `emitWord` with an
 * occasional guard, and anything outside that shape is reported rather than
 * guessed at.
 */

/** A byte the layout pass fills: an address or an immediate. */
export const HOLE = null;
export type EmittedByte = number | typeof HOLE;

export interface Emitter {
  readonly name: string;
  readonly bytes: readonly EmittedByte[];
}

export class ExtractionError extends Error {}

interface Source {
  readonly text: string;
  readonly constants: ReadonlyMap<string, number>;
}

function stripComments(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

export function readSource(paths: readonly string[]): Source {
  const text = paths.map((p) => stripComments(readFileSync(p, "utf8"))).join("\n");
  const constants = new Map<string, number>();
  for (const match of text.matchAll(/^const (\w+) as u\d+ = (\d+)\s*$/gm)) {
    constants.set(match[1], Number(match[2]));
  }
  return { text, constants };
}

/** The body of one `sub`, comments already gone. */
function bodyOf(source: Source, name: string): string {
  const pattern = new RegExp(`^sub ${name}\\([^)]*\\)[^\\n]*\\n([\\s\\S]*?)\\n^end`, "m");
  const match = pattern.exec(source.text);
  if (!match) throw new ExtractionError(`no sub named ${name}`);
  return match[1];
}

export type Branch = "then" | "else";

/**
 * The lines of one branch of a routine.
 *
 * `guard` names the branch by the text of its `if` condition, and `branch`
 * says which arm. Without a guard the routine is taken as straight-line, and
 * a routine that turns out to branch is an error rather than a silently
 * truncated sequence.
 *
 * "else" covers both shapes the source uses: a written `else` arm, and an
 * early `return` inside the `if` with the alternative following it. The
 * second is how `emitLoadSymbol` and `emitStoreSymbol` are written, and
 * treating the two as one branch is what lets the sixteen-bit sequences be
 * read out of them.
 */
function linesOf(body: string, guard: string | undefined, branch: Branch): string[] {
  const lines = body.split("\n");
  if (guard === undefined) {
    const branching = lines.findIndex((l) => /^\s*if /.test(l));
    if (branching >= 0) {
      throw new ExtractionError(
        `routine branches at "${lines[branching].trim()}" and no guard was named`,
      );
    }
    return lines;
  }

  const start = lines.findIndex((l) => l.trim() === `if ${guard} then`);
  if (start < 0) throw new ExtractionError(`no branch guarded by "${guard}"`);

  const taken: string[] = [];
  const otherwise: string[] = [];
  let depth = 1;
  let inElse = false;
  let at = start + 1;
  for (; at < lines.length; at += 1) {
    const line = lines[at];
    const text = line.trim();
    if (/^(if|while|for|select)\b/.test(text)) depth += 1;
    if (text === "end") {
      depth -= 1;
      if (depth === 0) break;
      continue;
    }
    if (text === "else" && depth === 1) {
      inElse = true;
      continue;
    }
    (inElse ? otherwise : taken).push(line);
  }

  if (branch === "then") return taken;
  if (inElse) return otherwise;

  // No written `else`. The alternative is whatever follows the `if`, which is
  // only a branch at all when the `if` left through a `return`.
  if (!taken.some((l) => l.trim() === "return")) {
    throw new ExtractionError(
      `"${guard}" has no else arm and does not return, so it has no alternative branch`,
    );
  }
  return lines.slice(at + 1);
}

/** Resolves an `emit` argument to a byte, or reports why it cannot. */
function byteOf(source: Source, argument: string): number {
  const text = argument.trim();
  if (/^\d+$/.test(text)) return Number(text);
  const constant = source.constants.get(text);
  if (constant === undefined) {
    throw new ExtractionError(`emit(${text}) is neither a literal nor a known constant`);
  }
  return constant & 0xff;
}

const MAX_DEPTH = 8;

/**
 * The bytes one routine emits.
 *
 * `emitWord` contributes two holes unless its argument is a literal. Calls to
 * other emitters expand in place, which is what lets `emitJumpIfFalse` be
 * checked as the five bytes it actually produces rather than as a call.
 */
export function emitterBytes(
  source: Source,
  name: string,
  guard?: string,
  branch: Branch = "then",
  depth = 0,
): Emitter {
  if (depth > MAX_DEPTH) throw new ExtractionError(`${name} nests deeper than ${MAX_DEPTH}`);

  const bytes: EmittedByte[] = [];
  for (const line of linesOf(bodyOf(source, name), guard, branch)) {
    const text = line.trim();
    if (text === "" || text === "return") continue;

    const emit = /^emit\((.+)\)$/.exec(text);
    if (emit) {
      bytes.push(byteOf(source, emit[1]));
      continue;
    }

    const emitWord = /^emitWord\((.+)\)$/.exec(text);
    if (emitWord) {
      const argument = emitWord[1].trim();
      if (/^\d+$/.test(argument)) {
        const value = Number(argument);
        bytes.push(value & 0xff, (value >> 8) & 0xff);
      } else {
        bytes.push(HOLE, HOLE);
      }
      continue;
    }

    const call = /^(emit\w+)\((.*)\)$/.exec(text);
    if (call) {
      const inner = emitterBytes(source, call[1], undefined, "then", depth + 1);
      const argument = call[2].trim();
      // A nested emitter called with a literal has no holes: `emitNegate`
      // calls `emitLoadAccumulator(0)`, and those two bytes are zero.
      if (/^\d+$/.test(argument)) {
        const value = Number(argument);
        let hole = 0;
        for (const byte of inner.bytes) {
          if (byte === HOLE) {
            bytes.push(hole === 0 ? value & 0xff : (value >> 8) & 0xff);
            hole += 1;
          } else {
            bytes.push(byte);
          }
        }
      } else {
        bytes.push(...inner.bytes);
      }
      continue;
    }

    // Anything else — an assignment, a condition, a call that is not an
    // emitter — means this routine is outside the shape this reader handles.
    throw new ExtractionError(`${name}: cannot read "${text}"`);
  }
  return { name, bytes };
}

/** Every opcode constant declared in the source, by name. */
export function opcodeConstants(source: Source): ReadonlyMap<string, number> {
  const opcodes = new Map<string, number>();
  for (const [name, value] of source.constants) {
    if (name.startsWith("op")) opcodes.set(name, value);
  }
  return opcodes;
}
