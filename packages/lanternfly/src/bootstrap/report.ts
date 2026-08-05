/**
 * Size reporting and image comparison.
 *
 * The size report exists from the first day so that the compiler's footprint
 * is a number on every run rather than something checked once at the end.
 *
 * It reports; it does not gate. The compiler is a loaded program rather than
 * a ROM resident — see `docs/abstract-machine.md` — so its budget is the free
 * memory of whatever loads it rather than the size of a particular window.
 * The reference figure below exists to give the number a scale, and nothing
 * fails when a build exceeds it.
 */

export interface SizeReport {
  readonly label: string;
  readonly bytes: number;
  readonly origin: number;
  /** Fraction of the reference scale this consumes. Reported, not enforced. */
  readonly budgetFraction: number;
}

/**
 * A reference scale for the fraction reported below, not a limit.
 *
 * Thirty-two kilobytes is half the address space, which is the point at which
 * a compiler and the program it is building stop fitting together comfortably
 * on a machine with no bulk storage. It replaces the sixteen-kilobyte
 * expansion window, which was never the compiler's constraint, and the
 * twenty-four-kilobyte estimate, which was a guess at its size rather than a
 * budget it had to meet.
 */
export const LEVEL0_REFERENCE_BYTES = 32 * 1024;

/** @deprecated Use {@link LEVEL0_REFERENCE_BYTES}. Retained so existing
 * callers keep reporting rather than break. */
export const LEVEL0_BUDGET_BYTES = LEVEL0_REFERENCE_BYTES;

export function sizeReport(
  label: string,
  bytes: Uint8Array,
  origin = 0,
): SizeReport {
  return {
    label,
    bytes: bytes.length,
    origin,
    budgetFraction: bytes.length / LEVEL0_REFERENCE_BYTES,
  };
}

export function formatSizeReport(report: SizeReport): string {
  const percent = (report.budgetFraction * 100).toFixed(1);
  return `${report.label}: ${report.bytes} bytes at 0x${report.origin
    .toString(16)
    .padStart(4, "0")} (${percent}% of the 32K reference)`;
}

export interface ByteDifference {
  readonly offset: number;
  readonly left: number | undefined;
  readonly right: number | undefined;
  /** A window around the difference, for reading. */
  readonly context: string;
}

/**
 * First differing offset with a window either side. "A stated diff" is not a
 * method; this is the smallest thing that is one.
 */
export function firstDifference(
  left: Uint8Array,
  right: Uint8Array,
  window = 16,
): ByteDifference | undefined {
  const limit = Math.max(left.length, right.length);
  for (let offset = 0; offset < limit; offset += 1) {
    const a = offset < left.length ? left[offset] : undefined;
    const b = offset < right.length ? right[offset] : undefined;
    if (a === b) continue;

    const from = Math.max(0, offset - window);
    const to = Math.min(limit, offset + window + 1);
    const render = (source: Uint8Array) =>
      Array.from(source.slice(from, Math.min(to, source.length)))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(" ");

    return {
      offset,
      left: a,
      right: b,
      context: `at 0x${offset.toString(16)}\n  left  ${render(left)}\n  right ${render(right)}`,
    };
  }
  return undefined;
}
