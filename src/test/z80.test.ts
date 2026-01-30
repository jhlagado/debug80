import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { createZ80Runtime } from '../z80/runtime';
import { parseIntelHex, parseListing } from '../z80/loaders';

describe('Z80 utilities', () => {
  it('parses Intel HEX and sets start address', () => {
    const hex = ':020000000102F9\n:00000001FF';
    const program = parseIntelHex(hex);
    assert.equal(program.memory[0x0000], 0x01);
    assert.equal(program.memory[0x0001], 0x02);
    assert.equal(program.startAddress, 0x0000);
  });

  it('parses listing addresses', () => {
    const listing = `0000   ; comment only
0000   .ORG 0000h
0000   C3 39 00   JP RESET
0900   31 00 FF   LD SP,STACK_TOP`;
    const info = parseListing(listing);
    assert.equal(info.lineToAddress.get(3), 0x0000);
    assert.equal(info.lineToAddress.get(4), 0x0900);
    assert.equal(info.addressToLine.get(0x0000), 3);
    assert.equal(info.addressToLine.get(0x0001), 3);
    assert.equal(info.addressToLine.get(0x0002), 3);
    assert.equal(info.addressToLine.get(0x0900), 4);
    assert.equal(info.addressToLine.get(0x0901), 4);
    assert.equal(info.addressToLine.get(0x0902), 4);
    assert.equal(info.entries.length, 2);
    assert.deepEqual(info.entries[0], { line: 3, address: 0x0000, length: 3 });
    assert.deepEqual(info.entries[1], { line: 4, address: 0x0900, length: 3 });
  });

  it('steps and halts on HALT opcode', () => {
    const hex = ':03000000007600E7\n:00000001FF'; // 0x00 NOP, 0x76 HALT
    const program = parseIntelHex(hex);
    const runtime = createZ80Runtime(program);

    let result = runtime.step();
    assert.equal(result.halted, false);
    assert.equal(runtime.getPC(), 0x0001);

    result = runtime.step();
    assert.equal(result.halted, true);
    assert.equal(runtime.isHalted(), true);
  });

  it('executes LD A,nn then ADD nn then HALT', () => {
    const hex = ':050000003E05C6037679\n:00000001FF'; // LD A,5; ADD 3; HALT
    const program = parseIntelHex(hex);
    const runtime = createZ80Runtime(program);

    let result = runtime.step();
    assert.equal(result.halted, false);
    assert.equal(runtime.getRegisters().a, 0x05);

    result = runtime.step();
    assert.equal(result.halted, false);
    assert.equal(runtime.getRegisters().a, 0x08);

    result = runtime.step();
    assert.equal(result.halted, true);
    assert.equal(runtime.isHalted(), true);
  });

  it('stops on breakpoint during run', () => {
    const hex = ':04000000000000E8\n:00000001FF'; // zeros
    const program = parseIntelHex(hex);
    const runtime = createZ80Runtime(program);
    const breaks = new Set<number>([0x0002]);

    const result = runtime.runUntilStop(breaks);
    assert.equal(result.reason, 'breakpoint');
    assert.equal(runtime.getPC(), 0x0002);
  });

  it('executes call/ret and updates registers correctly', () => {
    const hex = ':090000003E01CD0600763CC976F4\n:00000001FF'; // LD A,1; CALL 0006; HALT; INC A; RET; HALT
    const program = parseIntelHex(hex);
    const runtime = createZ80Runtime(program);

    const result = runtime.runUntilStop(new Set<number>());
    assert.equal(result.reason, 'halt');
    assert.equal(runtime.getRegisters().a, 0x02);
  });
});
