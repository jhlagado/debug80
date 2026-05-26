import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { D8DebugMap } from '../../src/mapping/d8-map';

vi.mock('vscode', () => ({
  languages: { registerDefinitionProvider: vi.fn() },
  window: { showInformationMessage: vi.fn() },
  workspace: { getWorkspaceFolder: vi.fn() },
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
}));

import {
  buildD8SymbolIndex,
  lookupD8Definition,
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
    });
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
});
