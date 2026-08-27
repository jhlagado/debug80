declare module 'atom-z80' {
  export interface AtomTranslationOptions {
    sourceName?: string;
  }

  export function translateAzmSourceToAtom(
    source: string,
    options?: AtomTranslationOptions,
  ): string;

  export function assembleAtomProject(options: {
    root: string;
    entry: string;
    target?: { start: number; capacity: number };
    maxInstructions?: number;
    maxCycles?: number;
  }): Promise<unknown>;

  export function renderAtomArtifacts(
    result: unknown,
    options?: { base?: number; entryAddress?: number; fill?: number },
  ): { bin: Uint8Array };
}
