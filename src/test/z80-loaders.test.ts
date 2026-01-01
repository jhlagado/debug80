import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseIntelHex, parseListing } from '../z80/loaders';

describe('z80-loaders', () => {
  it('throws on malformed hex line', () => {
    assert.throws(() => parseIntelHex('not-a-hex'), /Invalid HEX line/);
  });

  it('defaults start address to zero when no data records', () => {
    const program = parseIntelHex(':00000001FF'); // EOF only
    assert.equal(program.startAddress, 0);
    assert.equal(program.memory[0], 0);
  });

  it('parses listing entries and ignores comment-only lines', () => {
    const listing = `; comment\n0000   00      NOP\n0001   3E 05   LD A,05h`;
    const info = parseListing(listing);

    // Line numbers are 1-based
    assert.equal(info.lineToAddress.get(2), 0x0000);
    assert.equal(info.lineToAddress.get(3), 0x0001);
    // Each byte mapped to its source line
    assert.equal(info.addressToLine.get(0x0000), 2);
    assert.equal(info.addressToLine.get(0x0001), 3);
    assert.equal(info.addressToLine.get(0x0002), 3);
    assert.deepEqual(info.entries[0], { line: 2, address: 0x0000, length: 1 });
    assert.deepEqual(info.entries[1], { line: 3, address: 0x0001, length: 2 });
  });
});
