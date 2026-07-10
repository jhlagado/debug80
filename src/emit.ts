/** Shared emission helpers for the generator and profiles. */

export function hex(value: number, digits: number): string {
  return `$${value.toString(16).toUpperCase().padStart(digits, '0')}`;
}

export function bin8(value: number): string {
  return `%${value.toString(2).padStart(8, '0')}`;
}
