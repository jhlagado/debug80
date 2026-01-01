import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'fs';
import * as path from 'path';
import { parseMapping } from '../mapping/parser';

const fixturePath = path.join(process.cwd(), 'src', 'test', 'fixtures', 'simple.lst');
const listingContent = fs.readFileSync(fixturePath, 'utf-8');

describe('mapping-parser', () => {
  it('parses listing entries before the symbol table boundary', () => {
    const mapping = parseMapping(listingContent);

    assert.equal(mapping.segments.length, 5);
    assert.ok(mapping.segments.every((seg) => seg.lst.line < 6));
    assert.equal(mapping.segments[0]?.lst.line, 1);
    assert.equal(mapping.segments[4]?.lst.line, 5);
    assert.equal(
      mapping.segments.some((seg) => seg.lst.line === 9),
      false
    );
  });

  it('parses anchors and applies confidence rules', () => {
    const mapping = parseMapping(listingContent);

    assert.equal(mapping.anchors.length, 3);

    const startSeg = mapping.segments.find((seg) => seg.lst.line === 1);
    assert.ok(startSeg);
    assert.equal(startSeg.loc.file, 'simple.asm');
    assert.equal(startSeg.loc.line, 1);
    assert.equal(startSeg.confidence, 'HIGH');

    const dupSeg = mapping.segments.find((seg) => seg.lst.line === 4);
    assert.ok(dupSeg);
    assert.equal(dupSeg.loc.file, 'simple.asm');
    assert.equal(dupSeg.loc.line, 4);
    assert.equal(dupSeg.confidence, 'MEDIUM');
  });

  it('captures byte-emitting ranges', () => {
    const mapping = parseMapping(listingContent);

    const nopSeg = mapping.segments.find((seg) => seg.lst.line === 2);
    assert.ok(nopSeg);
    assert.equal(nopSeg.start, 0x0000);
    assert.equal(nopSeg.end, 0x0001);

    const inSeg = mapping.segments.find((seg) => seg.lst.line === 3);
    assert.ok(inSeg);
    assert.equal(inSeg.start, 0x0001);
    assert.equal(inSeg.end, 0x0003);

    const equSeg = mapping.segments.find((seg) => seg.lst.line === 4);
    assert.ok(equSeg);
    assert.equal(equSeg.start, 0x0003);
    assert.equal(equSeg.end, 0x0003);
  });
});
