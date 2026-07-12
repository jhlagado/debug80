/**
 * @fileoverview Shared D8 symbol conversion helpers.
 */

import type { D8Symbol } from '../../mapping/d8-map';

export type D8SourceMapSymbol = {
  name: string;
  file: string;
  line?: number;
  address?: number;
  value?: number;
  size?: number;
  kind?: D8Symbol['kind'];
  scope?: D8Symbol['scope'];
  identity?: D8Symbol['identity'];
  visibility?: D8Symbol['visibility'];
  sourceUnit?: D8Symbol['sourceUnit'];
};

export function d8SymbolToSourceMapSymbol(symbol: D8Symbol, file: string): D8SourceMapSymbol {
  return {
    name: symbol.name,
    file,
    ...(symbol.line !== undefined ? { line: symbol.line } : {}),
    ...(symbol.address !== undefined ? { address: symbol.address } : {}),
    ...(symbol.value !== undefined ? { value: symbol.value } : {}),
    ...(symbol.size !== undefined ? { size: symbol.size } : {}),
    ...(symbol.kind !== undefined ? { kind: symbol.kind } : {}),
    ...(symbol.scope !== undefined ? { scope: symbol.scope } : {}),
    ...(symbol.identity !== undefined ? { identity: symbol.identity } : {}),
    ...(symbol.visibility !== undefined ? { visibility: symbol.visibility } : {}),
    ...(symbol.sourceUnit !== undefined ? { sourceUnit: symbol.sourceUnit } : {}),
  };
}
