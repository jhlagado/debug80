import type { Diagnostic } from '../model/diagnostic.js';

export interface CompileNextOptions {
  readonly entryName?: string;
}

export interface CompileNextResult {
  readonly diagnostics: readonly Diagnostic[];
}

export function compileNext(
  _sourceText: string,
  _options: CompileNextOptions = {},
): CompileNextResult {
  return {
    diagnostics: [],
  };
}
