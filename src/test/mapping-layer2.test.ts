import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'fs';
import * as path from 'path';
import { parseMapping } from '../mapping-parser';
import { applyLayer2 } from '../mapping-layer2';

const fixtureDir = path.join(process.cwd(), 'src', 'test', 'fixtures');
const lstPath = path.join(fixtureDir, 'simple.lst');
const asmPath = path.join(fixtureDir, 'simple.asm');

const listingContent = fs.readFileSync(lstPath, 'utf-8');

const resolvePath = (file: string): string | undefined =>
  file === 'simple.asm' ? asmPath : undefined;

const resolveMissing = (_file: string): string | undefined => undefined;

describe('mapping-layer2', () => {
  it('updates line mappings when source files are present', () => {
    const mapping = parseMapping(listingContent);
    const result = applyLayer2(mapping, { resolvePath });

    assert.deepEqual(result.missingSources, []);

    const nopSeg = mapping.segments.find((seg) => seg.lst.line === 2);
    assert.ok(nopSeg);
    assert.equal(nopSeg.loc.line, 2);
    assert.equal(nopSeg.confidence, 'HIGH');

    const inSeg = mapping.segments.find((seg) => seg.lst.line === 3);
    assert.ok(inSeg);
    assert.equal(inSeg.loc.line, 3);
  });

  it('reports missing sources without failing', () => {
    const mapping = parseMapping(listingContent);
    const result = applyLayer2(mapping, { resolvePath: resolveMissing });

    assert.ok(result.missingSources.includes('simple.asm'));
    const nopSeg = mapping.segments.find((seg) => seg.lst.line === 2);
    assert.ok(nopSeg);
    assert.equal(nopSeg.loc.line, null);
  });
});
