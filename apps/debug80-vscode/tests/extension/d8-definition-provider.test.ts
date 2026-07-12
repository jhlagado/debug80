import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { D8DebugMap } from '../../src/mapping/d8-map';

vi.mock('vscode', () => ({
  languages: {
    registerDefinitionProvider: vi.fn(),
    registerHoverProvider: vi.fn(),
    registerWorkspaceSymbolProvider: vi.fn(),
  },
  window: { showInformationMessage: vi.fn() },
  workspace: { getWorkspaceFolder: vi.fn() },
  SymbolKind: { Constant: 13, Variable: 12, Function: 11, Field: 7 },
  Uri: { file: (value: string) => ({ fsPath: value }) },
  Position: class {
    constructor(
      public readonly line: number,
      public readonly character: number
    ) {}
  },
  Location: class {
    constructor(
      public readonly uri: unknown,
      public readonly range: unknown
    ) {}
  },
  MarkdownString: class {
    public readonly chunks: string[] = [];
    appendCodeblock(value: string): void {
      this.chunks.push(value);
    }
  },
  Hover: class {
    constructor(
      public readonly contents: unknown,
      public readonly range: unknown
    ) {}
  },
}));

import {
  D8_SOURCE_LANGUAGES,
  buildD8SymbolIndex,
  collectD8EditorSymbols,
  d8SymbolToEditorSymbol,
  formatD8Hover,
  isD8MapPossiblyStale,
  lookupD8Definition,
  parseAzmDocContractNearLine,
  resolveD8MapPathForTarget,
} from '../../src/extension/d8-definition-provider';

type D8FileSymbol = NonNullable<D8DebugMap['files'][string]['symbols']>[number];

function withTempDir<T>(prefix: string, run: (root: string) => T): T {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function d8Symbol(overrides: D8FileSymbol): D8FileSymbol {
  return overrides;
}

function labelSymbol(name: string, address: number, line?: number): D8FileSymbol {
  return d8Symbol({ name, kind: 'label', address, ...(line === undefined ? {} : { line }) });
}

function writeTargetProject(root: string): string {
  const configPath = path.join(root, 'debug80.json');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'pacmo.z80'), 'Start:\n');
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      projectVersion: 2,
      defaultTarget: 'pacmo',
      targets: {
        pacmo: {
          sourceFile: 'src/pacmo.z80',
          outputDir: 'build',
          artifactBase: 'pacmo',
        },
      },
    })
  );
  return configPath;
}

function makeMap(): D8DebugMap {
  return {
    format: 'd8-debug-map',
    version: 1,
    arch: 'z80',
    addressWidth: 16,
    endianness: 'little',
    files: {
      'src/main.z80': {
        symbols: [
          { ...labelSymbol('Start', 0x4000, 4), scope: 'global' },
          d8Symbol({ name: 'ScreenWidth', kind: 'constant', value: 32, line: 8, scope: 'global' }),
          d8Symbol({ name: 'PlayerX', kind: 'data', address: 0x4200, line: 10, size: 1 }),
          d8Symbol({
            ...labelSymbol('DrawTile', 0x4100, 12),
            identity: 'src/main.z80:12:1:label:DrawTile',
            scope: 'global',
            visibility: 'exported',
            sourceUnit: 'src/main.z80',
          }),
          d8Symbol({
            ...labelSymbol('First._done', 0x4110, 15),
            identity: 'src/main.z80:15:1:label:First._done',
            scope: 'local',
            visibility: 'local',
            sourceUnit: 'src/main.z80',
          }),
          d8Symbol({
            ...labelSymbol('First', 0x4108, 13),
            scope: 'global',
            visibility: 'source',
            sourceUnit: 'src/main.z80',
          }),
          d8Symbol({
            ...labelSymbol('Second._done', 0x4120, 25),
            identity: 'src/main.z80:25:1:label:Second._done',
            scope: 'local',
            visibility: 'local',
            sourceUnit: 'src/main.z80',
          }),
          d8Symbol({
            ...labelSymbol('Second', 0x4118, 23),
            scope: 'global',
            visibility: 'source',
            sourceUnit: 'src/main.z80',
          }),
        ],
      },
      'src/lib.z80': {
        symbols: [{ ...labelSymbol('Start', 0x5000, 3), scope: 'local' }],
      },
    },
  };
}

function makeMapWithNonNavigableSymbols(): D8DebugMap {
  return {
    ...makeMap(),
    files: {
      '': {
        symbols: [labelSymbol('BlankFile', 0x4000, 1)],
      },
      'src/generated.z80': {
        symbols: [labelSymbol('NoLine', 0x4001), labelSymbol('BadLine', 0x4002, 0)],
      },
    },
  };
}

describe('D8 definition provider helpers', () => {
  it('enables D8 editor navigation for AZM and Glimmer source documents', () => {
    expect(D8_SOURCE_LANGUAGES).toEqual(['z80-asm', 'glim']);
  });
  it('converts only navigable D8 symbols into editor symbols', () => {
    expect(
      d8SymbolToEditorSymbol('src/main.z80', {
        ...labelSymbol('Start', 0x4000),
        line: 4,
      })
    ).toMatchObject({
      name: 'Start',
      file: 'src/main.z80',
      line: 4,
      address: 0x4000,
    });

    expect(
      d8SymbolToEditorSymbol('', {
        ...labelSymbol('Start', 0x4000),
        line: 4,
      })
    ).toBeUndefined();
    expect(d8SymbolToEditorSymbol('src/main.z80', labelSymbol('Start', 0x4000))).toBeUndefined();
  });

  it('indexes address and value-only symbols with source lines', () => {
    const index = buildD8SymbolIndex(makeMap());

    expect(index.get('Start')?.[0]).toMatchObject({ file: 'src/main.z80', line: 4 });
    expect(index.get('ScreenWidth')?.[0]).toMatchObject({
      file: 'src/main.z80',
      line: 8,
      kind: 'constant',
      value: 32,
    });
    expect(index.get('PlayerX')?.[0]).toMatchObject({ address: 0x4200, size: 1 });
  });

  it('collects only D8 symbols that can navigate to a source line', () => {
    const symbols = collectD8EditorSymbols(makeMapWithNonNavigableSymbols());

    expect(symbols).toEqual([]);
  });

  it('indexes only D8 symbols that can navigate to a source line', () => {
    const index = buildD8SymbolIndex(makeMapWithNonNavigableSymbols());

    expect([...index.keys()]).toEqual([]);
  });

  it('indexes exported routines under their plain source name', () => {
    const index = buildD8SymbolIndex(makeMap());

    expect(lookupD8Definition(index, 'DrawTile')).toMatchObject({
      name: 'DrawTile',
      visibility: 'exported',
      file: 'src/main.z80',
      line: 12,
    });
    expect(lookupD8Definition(index, '@DrawTile')).toMatchObject({
      name: 'DrawTile',
      visibility: 'exported',
      line: 12,
    });
  });

  it('resolves qualified owner-local symbols from an underscore source reference', () => {
    const index = buildD8SymbolIndex(makeMap());

    expect(lookupD8Definition(index, '_done', 'src/main.z80', 18)).toMatchObject({
      name: 'First._done',
      line: 15,
      visibility: 'local',
    });
    expect(lookupD8Definition(index, '_done', 'src/main.z80', 28)).toMatchObject({
      name: 'Second._done',
      line: 25,
      visibility: 'local',
    });
    expect(lookupD8Definition(index, '_done', 'src/main.z80', 10)).toBeUndefined();
  });

  it('resolves colliding source-private symbols only inside their source unit', () => {
    const map: D8DebugMap = {
      format: 'd8-debug-map',
      version: 1,
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
      files: {
        'src/lib/first.asm': {
          symbols: [
            d8Symbol({
              ...labelSymbol('src/lib/first.asm::Helper', 0x4100, 3),
              scope: 'local',
              visibility: 'source',
              sourceUnit: 'src/lib/first.asm',
            }),
          ],
        },
        'src/lib/second.asm': {
          symbols: [
            d8Symbol({
              ...labelSymbol('src/lib/second.asm::Helper', 0x4200, 5),
              scope: 'local',
              visibility: 'source',
              sourceUnit: 'src/lib/second.asm',
            }),
          ],
        },
      },
    };
    const index = buildD8SymbolIndex(map);

    expect(lookupD8Definition(index, 'Helper', 'src/lib/first.asm', 10)).toMatchObject({
      address: 0x4100,
      sourceUnit: 'src/lib/first.asm',
    });
    expect(lookupD8Definition(index, 'Helper', 'src/lib/second.asm', 10)).toMatchObject({
      address: 0x4200,
      sourceUnit: 'src/lib/second.asm',
    });
    expect(lookupD8Definition(index, 'Helper', 'src/main.asm', 10)).toBeUndefined();
  });

  it('resolves an owner-local label included from another physical file', () => {
    const map: D8DebugMap = {
      format: 'd8-debug-map',
      version: 1,
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
      files: {
        'src/keyboard.asm': {
          symbols: [
            d8Symbol({
              ...labelSymbol('ReadKey', 0x4100, 100),
              scope: 'global',
              visibility: 'source',
              sourceUnit: 'src/keyboard.asm',
            }),
          ],
        },
        'src/fragments/read-key.inc': {
          symbols: [
            d8Symbol({
              ...labelSymbol('ReadKey._done', 0x4110, 8),
              scope: 'local',
              visibility: 'local',
              sourceUnit: 'src/keyboard.asm',
            }),
          ],
        },
      },
    };

    expect(
      lookupD8Definition(buildD8SymbolIndex(map), '_done', 'src/fragments/read-key.inc', 10)
    ).toMatchObject({ name: 'ReadKey._done', line: 8 });
  });

  it('resolves a declaration from another file in the same source unit', () => {
    const map: D8DebugMap = {
      format: 'd8-debug-map',
      version: 1,
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
      files: {
        'src/main.asm': {
          symbols: [
            d8Symbol({
              ...labelSymbol('Helper', 0x4100, 12),
              scope: 'global',
              visibility: 'source',
              sourceUnit: 'src/main.asm',
            }),
          ],
        },
        'src/fragments/caller.inc': {
          segments: [],
        },
      },
    };

    expect(
      lookupD8Definition(buildD8SymbolIndex(map), 'Helper', 'src/fragments/caller.inc', 5)
    ).toMatchObject({ name: 'Helper', file: 'src/main.asm', line: 12 });
  });

  it('leaves a shared include alias unresolved when multiple source units own it', () => {
    const map: D8DebugMap = {
      format: 'd8-debug-map',
      version: 1,
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
      files: {
        'src/shared.inc': {
          symbols: [
            d8Symbol({
              ...labelSymbol('src/first.asm::Helper', 0x4100, 3),
              scope: 'local',
              visibility: 'source',
              sourceUnit: 'src/first.asm',
            }),
            d8Symbol({
              ...labelSymbol('src/second.asm::Helper', 0x4200, 3),
              scope: 'local',
              visibility: 'source',
              sourceUnit: 'src/second.asm',
            }),
          ],
        },
      },
    };

    expect(
      lookupD8Definition(buildD8SymbolIndex(map), 'Helper', 'src/shared.inc', 5)
    ).toBeUndefined();
  });

  it('prefers a same-file definition when duplicate symbols exist', () => {
    const index = buildD8SymbolIndex(makeMap());

    expect(lookupD8Definition(index, 'Start', 'src/lib.z80')).toMatchObject({
      file: 'src/lib.z80',
      line: 3,
    });
  });

  it('resolves the current target D8 sidecar path from debug80.json', () => {
    withTempDir('debug80-d8-defs-', (root) => {
      const configPath = writeTargetProject(root);
      const workspaceState = { get: vi.fn(() => 'pacmo') } as never;

      expect(resolveD8MapPathForTarget(root, configPath, workspaceState)).toBe(
        path.join(root, 'build', 'pacmo.d8.json')
      );
    });
  });

  it('formats compact hover text for source-map symbols', () => {
    expect(
      formatD8Hover(
        {
          name: 'PlayerX',
          kind: 'data',
          file: 'src/main.z80',
          line: 10,
          address: 0x4200,
          size: 1,
        },
        'in: A,HL    clobbers: BC'
      )
    ).toBe('PlayerX\ndata $4200 1 byte\nin: A,HL    clobbers: BC\nsrc/main.z80:10');
  });

  it('normalizes AZM 0.3 routine contracts for hover display', () => {
    expect(
      parseAzmDocContractNearLine(
        ['.routine in A, HL out carry maybe-out zero clobbers B, C', 'CheckTile:'].join('\n'),
        2
      )
    ).toBe('in: A,HL    out: carry    maybe-out: zero    clobbers: B,C');

    expect(
      parseAzmDocContractNearLine(
        '.routine in A,HL out carry clobbers B,C preserves DE,IX\n@CheckTile:',
        2
      )
    ).toBe('in: A,HL    out: carry    clobbers: B,C    preserves: DE,IX');
  });

  it('does not interpret retired bang comments as contracts', () => {
    expect(parseAzmDocContractNearLine(';! in A out B\nCheckTile:', 2)).toBeUndefined();
  });

  it('detects source maps older than mapped source files', () => {
    withTempDir('debug80-d8-stale-', (root) => {
      const sourceDir = path.join(root, 'src');
      fs.mkdirSync(sourceDir, { recursive: true });
      const sourcePath = path.join(sourceDir, 'main.z80');
      const mapPath = path.join(root, 'build', 'main.d8.json');
      fs.mkdirSync(path.dirname(mapPath), { recursive: true });
      fs.writeFileSync(sourcePath, 'Start:\n');
      fs.writeFileSync(mapPath, JSON.stringify(makeMap()));
      const now = Date.now();
      fs.utimesSync(mapPath, new Date(now - 5000), new Date(now - 5000));
      fs.utimesSync(sourcePath, new Date(now), new Date(now));

      expect(isD8MapPossiblyStale(makeMap(), mapPath, root)).toBe(true);
    });
  });
});
