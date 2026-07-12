/* eslint-disable no-console */
import { performance } from 'node:perf_hooks';

import { init as initCpu } from '@jhlagado/debug80-runtime/z80/cpu';
import { decodeInstruction } from '@jhlagado/debug80-runtime/z80/decode';

const createCallbacks = () => {
  const memory = new Uint8Array(0x10000);
  return {
    mem_read: (addr) => memory[addr & 0xffff],
    mem_write: (addr, value) => {
      memory[addr & 0xffff] = value & 0xff;
    },
    io_read: () => 0x00,
    io_write: () => undefined,
  };
};

const runBenchmark = (label, iterations) => {
  const cpu = initCpu();
  const cb = createCallbacks();
  const start = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    decodeInstruction(cpu, cb, 0x00); // NOP
  }
  const elapsed = performance.now() - start;
  const opsPerSec = (iterations / elapsed) * 1000;
  console.log(`${label}: ${opsPerSec.toFixed(0)} ops/sec (${elapsed.toFixed(2)} ms)`);
};

const ITERATIONS = 5_000_000;
runBenchmark('decode:NOP', ITERATIONS);
