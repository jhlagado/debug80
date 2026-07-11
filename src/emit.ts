/** Shared emission helpers for the generator and profiles. */

export function hex(value: number, digits: number): string {
  return `$${value.toString(16).toUpperCase().padStart(digits, '0')}`;
}

export function bin8(value: number): string {
  return `%${value.toString(2).padStart(8, '0')}`;
}

/** The generated entry label a block's verbatim body is anchored at. */
export function blockEntryLabel(effectName: string): string {
  return `Glim_${effectName}`;
}

/**
 * Emit a routine boundary: the `.routine` contract directive (explicit
 * clauses, or bare for AZM body inference) immediately followed by the
 * entry label. Keeping the pair in one place keeps every generated
 * callable declared — under `.contracts strict` an undeclared callee
 * fails every call site.
 */
export function emitRoutine(emit: (line?: string) => void, label: string, clauses?: string): void {
  emit(clauses === undefined ? '.routine' : `.routine ${clauses}`);
  emit(`${label}:`);
}
