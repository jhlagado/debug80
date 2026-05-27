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
  buildD8SymbolIndex,
  formatD8Hover,
  isD8MapPossiblyStale,
  lookupD8Definition,
  parseAzmDocContractNearLine,
  resolveD8MapPathForTarget,
} from '../../src/extension/d8-definition-provider';

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
          { name: 'Start', kind: 'label', address: 0x4000, line: 4, scope: 'global' },
          { name: 'ScreenWidth', kind: 'constant', value: 32, line: 8, scope: 'global' },
          { name: 'PlayerX', kind: 'data', address: 0x4200, line: 10, size: 1 },
          { name: '@DrawTile', kind: 'label', address: 0x4100, line: 12, scope: 'global' },
        ],
      },
      'src/lib.z80': {
        symbols: [{ name: 'Start', kind: 'label', address: 0x5000, line: 3, scope: 'local' }],
      },
    },
  };
}

describe('D8 definition provider helpers', () => {
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

  it('normalizes public routine calls to @ routine definitions', () => {
    const index = buildD8SymbolIndex(makeMap());

    expect(lookupD8Definition(index, 'DrawTile')).toMatchObject({
      name: '@DrawTile',
      file: 'src/main.z80',
      line: 12,
    });
  });

  it('prefers a same-file definition when duplicate symbols exist', () => {
    const index = buildD8SymbolIndex(makeMap());

    expect(lookupD8Definition(index, 'Start', 'src/lib.z80')).toMatchObject({
      file: 'src/lib.z80',
      line: 3,
    });
  });

  it('resolves the current target D8 sidecar path from debug80.json', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-d8-defs-'));
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
    const workspaceState = { get: vi.fn(() => 'pacmo') } as never;

    expect(resolveD8MapPathForTarget(root, configPath, workspaceState)).toBe(
      path.join(root, 'build', 'pacmo.d8.json')
    );
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

  it('normalizes current and compact AZMDoc contracts for hover display', () => {
    expect(
      parseAzmDocContractNearLine(
        [';! in        A, HL', ';! out       carry', ';! clobbers  B, C', '@CheckTile:'].join('\n'),
        4
      )
    ).toBe('in: A,HL    out: carry    clobbers: B,C');

    expect(
      parseAzmDocContractNearLine(
        ';! in: A,HL; out: carry; clobbers: B,C; preserves: DE,IX\n@CheckTile:',
        2
      )
    ).toBe('in: A,HL    out: carry    clobbers: B,C    preserves: DE,IX');
  });

  it('detects source maps older than mapped source files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-d8-stale-'));
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
