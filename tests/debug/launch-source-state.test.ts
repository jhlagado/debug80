/**
 * @file Launch source-state tests.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildLaunchSourceState } from '../../src/debug/launch/launch-source-state';
import { SourceStateManager } from '../../src/debug/mapping/source-state-manager';
import { createSessionState } from '../../src/debug/session/session-state';
import type { LaunchRequestArguments } from '../../src/debug/session/types';
import { resolveExecutableLocation } from '../../src/mapping/source-map';
import { NullLogger } from '../../src/util/logger';

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [],
  },
}));

describe('launch-source-state', () => {
  let tmpDir: string;

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('indexes AZM project-relative D8 file keys for source breakpoints', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-launch-source-'));
    const projectRoot = path.join(tmpDir, 'project');
    const sourcePath = path.join(projectRoot, 'src', 'pacmo', 'pacmo.z80');
    const listingPath = path.join(projectRoot, 'build', 'pacmo.lst');
    const d8Path = path.join(projectRoot, 'build', 'pacmo.d8.json');

    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, 'ORG 4000h\nSTART:\n  NOP\n');
    fs.mkdirSync(path.dirname(listingPath), { recursive: true });
    fs.writeFileSync(listingPath, 'LIST\n');
    fs.writeFileSync(
      d8Path,
      `${JSON.stringify(
        {
          format: 'd8-debug-map',
          version: 1,
          arch: 'z80',
          addressWidth: 16,
          endianness: 'little',
          files: {
            'src/pacmo/pacmo.z80': {
              segments: [{ start: 0x4000, end: 0x4001, lstLine: 1, line: 3, kind: 'code' }],
              symbols: [{ name: 'START', kind: 'label', address: 0x4000, line: 2 }],
            },
          },
          generator: { name: 'azm', tool: 'azm', version: '0.1.1' },
        },
        null,
        2
      )}\n`
    );

    const sourceState = new SourceStateManager();
    const sessionState = createSessionState();
    const result = buildLaunchSourceState(
      { sourceRoots: ['src'], artifactBase: 'pacmo' } as LaunchRequestArguments,
      'tec1g',
      projectRoot,
      sourcePath,
      listingPath,
      'LIST\n',
      [],
      sourceState,
      sessionState,
      new NullLogger()
    );

    expect(resolveExecutableLocation(result.mappingIndex, sourcePath, 3)).toEqual([0x4000]);
  });
});
