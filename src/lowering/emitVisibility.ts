import type { CompileEnv } from '../semantics/env.js';
import type { Callable } from './loweringTypes.js';
import type { OpDeclNode } from '../frontend/ast.js';

type EmitVisibilityContext = {
  /** Compile environment (module ids, imports) used with visibility maps. */
  env: CompileEnv;
  /** Per-file map of lowered callables keyed by lowercased name. */
  localCallablesByFile: Map<string, Map<string, Callable>>;
  /** Flat map of visible callables across the program (qualified and unqualified resolution). */
  visibleCallables: Map<string, Callable>;
  /** Per-file op overload lists keyed by lowercased op name. */
  localOpsByFile: Map<string, Map<string, OpDeclNode[]>>;
  /** Merged visible op candidates by lowercased name. */
  visibleOpsByName: Map<string, OpDeclNode[]>;
};

export function createEmitVisibilityHelpers(ctx: EmitVisibilityContext) {
  const resolveVisibleCallable = (name: string, file: string): Callable | undefined => {
    const lower = name.toLowerCase();
    return ctx.localCallablesByFile.get(file)?.get(lower) ?? ctx.visibleCallables.get(lower);
  };

  const resolveVisibleOpCandidates = (name: string, file: string): OpDeclNode[] | undefined => {
    const lower = name.toLowerCase();
    return ctx.localOpsByFile.get(file)?.get(lower) ?? ctx.visibleOpsByName.get(lower);
  };

  return {
    resolveVisibleCallable,
    resolveVisibleOpCandidates,
  };
}
