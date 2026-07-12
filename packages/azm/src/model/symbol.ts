export type SymbolTable = Readonly<Record<string, number>>;

export type SymbolCaseMode = 'strict' | 'insensitive';

export function symbolLookupKey(name: string, mode: SymbolCaseMode = 'strict'): string {
  return mode === 'insensitive' ? name.toLowerCase() : name;
}
