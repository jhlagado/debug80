import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { HexProgram } from '../../src/z80/loaders';
import { createZ80Runtime } from '../../src/z80/runtime';

const makeProgram = (bytes: number[], startAddress = 0x0000): HexProgram => {
  const memory = new Uint8Array(0x10000);
  memory.fill(0);
  memory.set(bytes, startAddress);
  return { memory, startAddress };
};

describe('z80-runtime', () => {
  it('honors entry override on reset', () => {
    const progA = makeProgram([0x76], 0x0000); // HALT
    const runtime = createZ80Runtime(progA);
    const result = runtime.step();
    assert.equal(result.halted, true);

    const progB = makeProgram([0x00, 0x00, 0x76], 0x2000); // NOP, NOP, HALT at 0x2002
    runtime.reset(progB, 0x2001);
    assert.equal(runtime.getPC(), 0x2001);
    // Step twice to reach HALT
    runtime.step();
    const halted = runtime.step();
    assert.equal(halted.halted, true);
    assert.equal(runtime.getPC(), 0x2003);
  });

  it('calls IO write handler on OUT (n),A', () => {
    const writes: Array<{ port: number; value: number }> = [];
    const program = makeProgram(
      [
        0x3e,
        0x12, // LD A,0x12
        0xd3,
        0x34, // OUT (0x34),A
        0x76, // HALT
      ],
      0x0000
    );

    const runtime = createZ80Runtime(program, undefined, {
      write: (port, value) => writes.push({ port, value }),
    });

    runtime.step(); // LD A, nn
    runtime.step(); // OUT (n), A
    const res = runtime.step(); // HALT

    assert.equal(res.halted, true);
    // OUT uses (A << 8) | n for the port number in this implementation.
    assert.deepEqual(writes, [{ port: 0x1234, value: 0x12 }]);
  });
});
