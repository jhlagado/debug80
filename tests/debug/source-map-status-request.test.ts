import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('vscode', () => ({ workspace: { workspaceFolders: undefined } }));

import { buildSourceMapStatus } from '../../src/debug/requests/source-map-status-request';
import { createSessionState } from '../../src/debug/session/session-state';
import { buildSourceMapIndex } from '../../src/mapping/source-map';
import type { MappingParseResult } from '../../src/mapping/types';
import { createZ80Runtime } from '../../src/z80/runtime';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('source-map status request', () => {
  it('reports the active TEC-1G expansion bank source for the current PC', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-source-status-'));
    fs.writeFileSync(path.join(tmpDir, 'bank0.asm'), 'nop\n');
    fs.writeFileSync(path.join(tmpDir, 'bank3.asm'), 'nop\n');
    const mapping: MappingParseResult = {
      segments: [
        {
          start: 0x8000,
          end: 0x8002,
          loc: { file: 'bank3.asm', line: 9 },
          context: { line: 1, text: 'bank3' },
          confidence: 'HIGH',
          addressSpace: { kind: 'tec1g-expansion', physicalBank: 3 },
        },
        {
          start: 0x8000,
          end: 0x8002,
          loc: { file: 'bank0.asm', line: 9 },
          context: { line: 1, text: 'bank0' },
          confidence: 'HIGH',
          addressSpace: { kind: 'tec1g-expansion', physicalBank: 0 },
        },
      ],
      anchors: [],
    };
    const sessionState = createSessionState();
    sessionState.runtime = createZ80Runtime({
      memory: new Uint8Array(0x10000),
      startAddress: 0x8000,
    });
    sessionState.mapping = mapping;
    sessionState.mappingIndex = buildSourceMapIndex(mapping, (file) => path.join(tmpDir, file));
    sessionState.sourceRoots = [tmpDir];
    sessionState.launchArgs = { type: 'z80', request: 'launch', name: 'test', platform: 'tec1g' };
    sessionState.tec1gRuntime = {
      state: {
        system: {
          expandEnabled: true,
          memoryExpansionPhysicalBank: 0,
        },
      },
    } as never;

    const status = buildSourceMapStatus(sessionState);

    expect(status.currentPc?.source).toEqual({
      path: fs.realpathSync(path.join(tmpDir, 'bank0.asm')),
      line: 9,
    });
  });
});
