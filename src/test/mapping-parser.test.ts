import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
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

  it('handles non-byte listings and ignores USED AT anchors', () => {
    const content = [
      '0000 3E 01 LD A,1',
      '0002 XX       NOP',
      '0003        ORG 0003',
      'FOO: 0000 DEFINED AT LINE 1 IN test.asm',
      'BAR: 0000 DEFINED AT LINE 2 IN test.asm',
      'BAZ: 0001 USED AT LINE 3 IN test.asm',
    ].join('\n');
    const mapping = parseMapping(content);

    const orgSeg = mapping.segments.find((seg) => seg.lst.line === 3);
    assert.ok(orgSeg);
    assert.equal(orgSeg.start, 0x0003);
    assert.equal(orgSeg.end, 0x0003);
    assert.equal(orgSeg.lst.text, 'ORG 0003');

    assert.equal(mapping.anchors.length, 2);
    const dup = mapping.segments.find((seg) => seg.lst.line === 2);
    assert.ok(dup);
    assert.equal(dup.confidence, 'MEDIUM');
  });

  it('handles segments with no anchors (currentFile null)', () => {
    // Test case where segments exist but no anchors provide file context
    const content = [
      '0000 00       NOP',
      '0001 C9       RET',
    ].join('\n');
    const mapping = parseMapping(content);

    assert.equal(mapping.segments.length, 2);
    assert.equal(mapping.anchors.length, 0);
    
    // Without anchors, segments should have null file/line with LOW confidence
    const nopSeg = mapping.segments[0];
    assert.ok(nopSeg);
    assert.equal(nopSeg.loc.file, null);
    assert.equal(nopSeg.loc.line, null);
    assert.equal(nopSeg.confidence, 'LOW');
  });

  it('handles segments after anchor with inheritance', () => {
    // More segments after the anchor inherit the file context
    const content = [
      '0000 00       NOP',
      'START: 0000 DEFINED AT LINE 1 IN test.asm',
      // Remaining lines are after the symbol table and should be skipped
    ].join('\n');
    const mapping = parseMapping(content);

    // Should have 1 segment from line 1
    assert.equal(mapping.segments.length, 1);
    assert.equal(mapping.anchors.length, 1);
    
    // First segment should use anchor
    const nopSeg = mapping.segments[0];
    assert.ok(nopSeg);
    assert.equal(nopSeg.start, 0x0000);
    assert.equal(nopSeg.loc.file, 'test.asm');
    assert.equal(nopSeg.loc.line, 1);
    assert.equal(nopSeg.confidence, 'HIGH');
  });
});
