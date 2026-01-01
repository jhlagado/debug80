import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'fs';
import * as path from 'path';
import { parseMapping } from '../mapping-parser';
import { buildSourceMapIndex, findSegmentForAddress, resolveLocation } from '../source-map';

const fixtureDir = path.join(process.cwd(), 'src', 'test', 'fixtures');
const lstPath = path.join(fixtureDir, 'simple.lst');
const asmPath = path.join(fixtureDir, 'simple.asm');

const listingContent = fs.readFileSync(lstPath, 'utf-8');
const mapping = parseMapping(listingContent);
const resolvePath = (file: string): string | undefined =>
  file === 'simple.asm' ? asmPath : undefined;
const index = buildSourceMapIndex(mapping, resolvePath);

describe('source-map', () => {
  it('resolves locations to addresses', () => {
    assert.deepEqual(resolveLocation(index, asmPath, 1), [0x0000]);
    assert.deepEqual(resolveLocation(index, asmPath, 4), [0x0003]);
    assert.deepEqual(resolveLocation(index, asmPath, 5), [0x0003]);
  });

  it('returns empty for unknown files', () => {
    assert.deepEqual(resolveLocation(index, path.join(fixtureDir, 'missing.asm'), 1), []);
  });

  it('finds a segment by address', () => {
    const segment = findSegmentForAddress(index, 0x0001);
    assert.ok(segment);
    assert.equal(segment?.lst.line, 3);
  });
});
