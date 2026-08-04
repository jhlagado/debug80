/**
 * Size reporting and image comparison. The budget report exists from the
 * first day so that the twenty-four kilobyte estimate is a number on every
 * run rather than something checked once at the end.
 */

export interface SizeReport {
  readonly label: string;
  readonly bytes: number;
  readonly origin: number;
  /** Fraction of the level-0 budget this consumes. */
  readonly budgetFraction: number;
}

/** The current estimate, not a measurement. See `bootstrap-plan.md`. */
export const LEVEL0_BUDGET_BYTES = 24 * 1024;

export function sizeReport(
  label: string,
  bytes: Uint8Array,
  origin = 0,
): SizeReport {
  return {
    label,
    bytes: bytes.length,
    origin,
    budgetFraction: bytes.length / LEVEL0_BUDGET_BYTES,
  };
}

export function formatSizeReport(report: SizeReport): string {
  const percent = (report.budgetFraction * 100).toFixed(1);
  return `${report.label}: ${report.bytes} bytes at 0x${report.origin
    .toString(16)
    .padStart(4, "0")} (${percent}% of budget)`;
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
