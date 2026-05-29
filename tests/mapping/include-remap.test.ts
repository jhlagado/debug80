import assert from 'node:assert/strict';
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { MappingParseResult } from '../../src/mapping/types';
import {
  propagateMisassignedIncludeSegments,
  remapMisassignedIncludeAnchors,
} from '../../src/mapping/include-remap';

const fixtureDir = path.join(process.cwd(), 'tests', 'fixtures');
const includeAnchorRemapDir = path.join(fixtureDir, 'include-anchor-remap');

const resolveIncludeAnchorRemap = (file: string): string | undefined => {
  if (file === 'packages.z80') {
    return path.join(includeAnchorRemapDir, 'packages.z80');
  }
  if (file === 'glcd_library.z80') {
    return path.join(includeAnchorRemapDir, 'glcd_library.z80');
  }
  return undefined;
};

describe('include-remap', () => {
  it('remaps include anchors when the parent file does not contain that source line', () => {
    const mapping: MappingParseResult = {
      segments: [],
      anchors: [
        {
          symbol: 'INITLCD',
          address: 0xd800,
          file: 'packages.z80',
          line: 5,
        },
      ],
    };

    const remaps = remapMisassignedIncludeAnchors(
      mapping.anchors,
      resolveIncludeAnchorRemap
    );

    expect(remaps).toEqual([
      { address: 0xd800, oldFile: 'packages.z80', newFile: 'glcd_library.z80' },
    ]);
    expect(mapping.anchors[0]?.file).toBe('glcd_library.z80');
    expect(mapping.anchors[0]?.line).toBe(5);
  });

  it('propagates remapped include file to every segment until the next real parent symbol', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-inc-'));
    const pkgPath = path.join(tmp, 'packages.z80');
    const glcdPath = path.join(tmp, 'glcd_library.z80');
    fs.writeFileSync(
      pkgPath,
      ['; shim', '\t.include "glcd_library.z80"', 'REALMAIN:', '\tnop', ''].join('\n'),
      'utf-8'
    );
    fs.copyFileSync(path.join(includeAnchorRemapDir, 'glcd_library.z80'), glcdPath);
    const resolveTmp = (file: string): string | undefined => {
      if (file === 'packages.z80') {
        return pkgPath;
      }
      if (file === 'glcd_library.z80') {
        return glcdPath;
      }
      return undefined;
    };

    const mapping: MappingParseResult = {
      segments: [
        {
          start: 0xd802,
          end: 0xd803,
          loc: { file: 'packages.z80', line: 6 },
          lst: { line: 2, text: 'nop' },
          confidence: 'HIGH',
        },
        {
          start: 0xd900,
          end: 0xd901,
          loc: { file: 'packages.z80', line: 3 },
          lst: { line: 3, text: 'nop' },
          confidence: 'HIGH',
        },
      ],
      anchors: [
        { symbol: 'INITLCD', address: 0xd800, file: 'packages.z80', line: 5 },
        { symbol: 'REALMAIN', address: 0xd900, file: 'packages.z80', line: 3 },
      ],
    };
    const remaps = remapMisassignedIncludeAnchors(mapping.anchors, resolveTmp);
    assert.equal(remaps.length, 1);
    propagateMisassignedIncludeSegments(mapping, remaps, resolveTmp);
    expect(mapping.segments[0]?.loc.file).toBe('glcd_library.z80');
    expect(mapping.segments[1]?.loc.file).toBe('packages.z80');
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
