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
 * emitting routines are straight-line runs of `emit` and `emitWord`, calls to
 * one another, and an occasional guard. Anything outside that shape is
 * reported rather than guessed at.
 */

/** A byte fixed later: an address back-patched, or an immediate. */
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

    // Any call, not only an emitting one. A routine that emits nothing
    // contributes nothing, which is what lets `recordPatch` sit in the middle
    // of a sequence without hiding it from the reader.
    const call = /^(\w+)\((.*)\)$/.exec(text);
    if (call) {
      const inner = nestedBytes(source, call[1], depth + 1);
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

/**
 * Whether a routine can put a byte in the output at all, following calls.
 *
 * A routine that cannot contributes nothing, and the reader can skip it
 * without understanding its body. `recordPatch` is the case that forced this:
 * it sits in the middle of an emitting sequence, calls a fault reporter, and
 * emits nothing — so reading its body was never the point.
 */
function canEmit(source: Source, name: string, seen: Set<string> = new Set()): boolean {
  if (name === "emit" || name === "emitWord") return true;
  if (seen.has(name)) return false;
  seen.add(name);

  let body: string;
  try {
    body = bodyOf(source, name);
  } catch {
    // Not a routine in this source — an intrinsic, or defined elsewhere.
    return false;
  }
  for (const call of body.matchAll(/\b(\w+)\s*\(/g)) {
    if (canEmit(source, call[1], seen)) return true;
  }
  return false;
}

/**
 * The bytes a nested emitter contributes.
 *
 * A straight-line routine reads directly. A branching one is read on both
 * arms and the two must produce the same number of bytes — which is the only
 * property a byte count depends on, and a real requirement besides: an emitter
 * whose arms differ in length would make the same construct two sizes.
 *
 * `emitJumpTarget` is the case that forced this. Its arms write either a known
 * address or a placeholder, and both are two bytes.
 */
function nestedBytes(source: Source, name: string, depth: number): Emitter {
  if (!canEmit(source, name)) return { name, bytes: [] };
  try {
    return emitterBytes(source, name, undefined, "then", depth);
  } catch (error) {
    if (!(error instanceof ExtractionError)) throw error;
    const guard = /branches at "if (.+) then"/.exec(error.message)?.[1];
    if (guard === undefined) throw error;

    const then = emitterBytes(source, name, guard, "then", depth);
    const otherwise = emitterBytes(source, name, guard, "else", depth);
    if (then.bytes.length !== otherwise.bytes.length) {
      throw new ExtractionError(
        `${name}: its arms emit ${then.bytes.length} and ${otherwise.bytes.length} bytes, ` +
          `so the construct has two sizes`,
      );
    }
    // Either arm gives the length; holes are wild in the comparison anyway.
    return then;
  }
}

/** Every opcode constant declared in the source, by name. */
export function opcodeConstants(source: Source): ReadonlyMap<string, number> {
  const opcodes = new Map<string, number>();
  for (const [name, value] of source.constants) {
    if (name.startsWith("op")) opcodes.set(name, value);
  }
  return opcodes;
}
