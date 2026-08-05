import { readFileSync } from "node:fs";

import { assembleSource, symbolAt } from "./assemble.js";

/**
 * The runtime image, generated from `candlemoth/runtime.asm`.
 *
 * Candlemoth plants the same fourteen routines as a placed constant byte
 * array, and the plan requires that array to be generated from the assembly
 * source rather than transcribed, so the two copies cannot drift. This module
 * is the generator; `candlemoth/runtime.lafy` is its output; and
 * `test/runtime-image.test.ts` fails when the checked-in output no longer
 * matches.
 */

/**
 * Label per ordinal, in the order of the `Helper` enum in
 * `candlemoth/expression.lafy`. The ordinals are part of the lowering
 * contract because they are how the compiler indexes the address table, so a
 * reordering here is a change to `docs/level0-lowering.md`.
 */
export const HELPER_LABELS = [
  "Multiply",
  "Divide",
  "SignedDivide",
  "CompareEqual",
  "CompareNotEqual",
  "CompareLess",
  "CompareLessEqual",
  "CompareGreater",
  "CompareGreaterEqual",
  "CompareSignedLess",
  "CompareSignedLessEqual",
  "CompareSignedGreater",
  "CompareSignedGreaterEqual",
  "BoundsCheck",
] as const;

/**
 * Where an emitted program starts, and what owns the low addresses.
 *
 * The runtime is not position-independent and cannot be made so: the routines
 * call each other, the Z80's only CALL is absolute, and the comparison
 * routines share two exits reached by absolute jumps. So the image is
 * assembled for one origin, and a target with a different origin gets its own
 * generated image rather than a relocation table for a blob that never moves.
 *
 * Two profiles, because the bootstrap machine and a real TEC-1 disagree about
 * who owns page zero.
 */
export interface TargetProfile {
  readonly name: string;
  /** Where the emitted image begins. The runtime sits at its front. */
  readonly origin: number;
  /**
   * Whether the compiler emits the three-byte jump at address zero. True when
   * it owns the reset vector; false when a monitor does and launches the
   * program at its origin instead.
   */
  readonly ownsResetVector: boolean;
}

/**
 * The bootstrap machine: a generic flat 64K Z80 with the standard IN and OUT,
 * and nothing else resident.
 *
 * Page zero is reserved whole. Address zero holds the jump to the designated
 * start, and the rest of the page belongs to the processor: the restart
 * vectors at 08, 10, 18, 20, 28, 30 and 38, and the NMI entry at 66. Code
 * starts at 0100, which is where CP/M starts it and for the same reason. The
 * 253 bytes that leaves are not waste — they are the vectors.
 */
export const FLAT_PROFILE: TargetProfile = {
  name: "flat",
  origin: 0x0100,
  ownsResetVector: true,
};

/**
 * A TEC-1: RAM from 2000 to 8000 for user code, object code and user data;
 * the compiler resident from 8000 to C000; the monitor below 2000, which owns
 * page zero and its vectors; shadow ROM at C000. Bulk storage is an SD card,
 * so a compiler running here streams its source in and its object code out
 * rather than holding either resident.
 *
 * The compiler emits no reset jump on this target. The monitor holds the
 * vectors and launches a program at its origin.
 */
export const TEC1_PROFILE: TargetProfile = {
  name: "tec1",
  origin: 0x2000,
  ownsResetVector: false,
};

/** What Candlemoth's checked-in image is generated for. */
export const RUNTIME_ORIGIN = FLAT_PROFILE.origin;

export interface RuntimeImage {
  readonly bytes: Uint8Array;
  /** Absolute entry address of each routine, by ordinal. */
  readonly addresses: readonly number[];
  readonly origin: number;
}

export function buildRuntimeImage(
  assemblyPath: string,
  profile: TargetProfile = FLAT_PROFILE,
): RuntimeImage {
  const text = readFileSync(assemblyPath, "utf8");
  const origin = profile.origin;
  const hex = origin.toString(16).padStart(4, "0");
  const assembled = assembleSource(`.org $${hex}\n${text}`);
  const addresses = HELPER_LABELS.map((label) => symbolAt(assembled, label));

  const end = origin + assembled.bytes.length;
  for (const [ordinal, address] of addresses.entries()) {
    if (address < origin || address >= end) {
      throw new Error(
        `${HELPER_LABELS[ordinal]} at ${address} falls outside the image at ${origin}..${end}`,
      );
    }
  }
  return { bytes: assembled.bytes, addresses, origin };
}

/** The generated `.lafy` source, byte for byte. */
export function renderRuntimeLafy(image: RuntimeImage): string {
  const rows: string[] = [];
  for (let at = 0; at < image.bytes.length; at += 12) {
    const slice = Array.from(image.bytes.slice(at, at + 12));
    rows.push(`    ${slice.map((b) => String(b)).join(", ")},`);
  }
  // The last row carries no trailing comma.
  rows[rows.length - 1] = rows[rows.length - 1].replace(/,$/, "");

  const addresses = image.addresses.map((a) => String(a)).join(", ");

  const lines = [
    "// Candlemoth level-0 runtime image",
    "//",
    "// GENERATED from candlemoth/runtime.asm. Do not edit: run",
    "// `npm run generate:runtime` instead. The plan requires this array to be",
    "// generated rather than transcribed, so the assembly source and the bytes",
    "// Candlemoth plants cannot drift apart.",
    "//",
    "// The image is NOT position-independent: the routines call each other, the",
    "// only CALL this machine has is absolute, and the comparison routines share",
    "// two exits reached by absolute jumps. It is assembled at one fixed origin",
    "// and has to be placed there.",
    "//",
    "// Page zero is reserved whole: the entry jump at 0000, the restart vectors",
    "// at 0008 through 0038, and the NMI entry at 0066. Code starts at 0100,",
    "// where CP/M starts it and for the same reason. The runtime is first, and",
    "// program code follows it.",
    "//",
    "// The ordinals are the order of the `Helper` enum in expression.lafy, which",
    "// `docs/level0-lowering.md` states as part of the lowering contract.",
    "",
    `const runtimeOrigin as u16 = ${image.origin}`,
    `const runtimeBytes as u16 = ${image.bytes.length}`,
    "",
    "const runtimeImage as u8[runtimeBytes] = [",
    ...rows,
    "]",
    "",
    `const runtimeAddress as u16[helperCount] = [${addresses}]`,
    "",
    "// Called by the layout pass once it has placed the image. The address it",
    "// reports is checked rather than trusted, because a runtime placed anywhere",
    "// else would run its own absolute jumps into program code.",
    "sub placeRuntime(base as u16)",
    "    var ordinal as u16 = 0",
    "",
    "    if base <> runtimeOrigin then",
    "        reportStmtFault(stmtFaultRuntimeMisplaced)",
    "        return",
    "    end",
    "    for ordinal = 0 until helperCount",
    "        helperAddress[ordinal] = runtimeAddress[ordinal]",
    "    end",
    "end",
    "",
  ];
  return lines.join("\n");
}
