import { describe, expect, it } from 'vitest';
import { d8SymbolToSourceMapSymbol } from '../../src/debug/mapping/d8-symbols';

describe('D8 symbol helpers', () => {
  it('copies common D8 symbol metadata without inventing absent fields', () => {
    expect(
      d8SymbolToSourceMapSymbol(
        {
          name: 'PlayerX',
          line: 12,
          address: 0x4200,
          value: 7,
          size: 1,
          kind: 'data',
          scope: 'global',
        },
        'src/main.asm'
      )
    ).toEqual({
      name: 'PlayerX',
      file: 'src/main.asm',
      line: 12,
      address: 0x4200,
      value: 7,
      size: 1,
      kind: 'data',
      scope: 'global',
    });

    expect(d8SymbolToSourceMapSymbol({ name: 'NoLine' }, 'src/main.asm')).toEqual({
      name: 'NoLine',
      file: 'src/main.asm',
    });
  });
});
