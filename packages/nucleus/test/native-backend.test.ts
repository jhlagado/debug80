/**
 * First direct-Z80 comparison: expand the same fixed-slot scalar loop used by
 * the NVM frame-addressing measurements without register allocation.
 */

import { describe, expect, it } from "vitest";

import {
  assemble,
  extent,
  run,
  symbol,
  variantSource,
  word,
  type Assembled,
} from "../src/measure.js";

const HALT = 0;
const LDI = 1;
const ADD = 3;
const JLT = 5;

const NVM_LDI16 = 0x02;
const NVM_INDEX = 0x42;
const NVM_LOAD8 = 0x48;
const NVM_RET = 0x52;

const loopBytecode = [
  LDI,
  0,
  0,
  0,
  LDI,
  1,
  0,
  0,
  LDI,
  2,
  100,
  0,
  LDI,
  3,
  1,
  0,
  ADD,
  1,
  0,
  1,
  ADD,
  0,
  3,
  0,
  JLT,
  0,
  2,
  0x10,
  0x03,
  HALT,
];

function runLoop(image: Assembled, program?: readonly number[]) {
  const outcome = run(image, {
    entry: symbol(image, "Start"),
    ...(program === undefined ? {} : { program }),
    maxInstructions: 500_000,
  });
  expect(outcome.halted).toBe(true);
  expect(word(outcome.memory, 0x0400)).toBe(100);
  expect(word(outcome.memory, 0x0402)).toBe(4950);
  return outcome;
}

describe("native backend spike", () => {
  it("compares direct expansion with the same NVM fixed-slot loop", () => {
    const native = assemble(variantSource("native-slot-loop"));
    const nvm = assemble(variantSource("variant-b"));
    const nativeOutcome = runLoop(native);
    const nvmOutcome = runLoop(nvm, loopBytecode);

    const nativeCodeBytes = extent(native, "Start", "NativeEnd");
    const nvmCoreBytes = extent(nvm, "Start", "VmEnd");
    const nvmDispatchBytes = 7 * 2;
    const nvmTotalBytes = nvmCoreBytes + nvmDispatchBytes + loopBytecode.length;
    expect({
      nativeCodeBytes,
      nativeCycles: nativeOutcome.cycles,
      nativeInstructions: nativeOutcome.instructions,
      nvmCoreBytes,
      nvmDispatchBytes,
      nvmProgramBytes: loopBytecode.length,
      nvmTotalBytes,
      nvmCycles: nvmOutcome.cycles,
      nvmInstructions: nvmOutcome.instructions,
    }).toEqual({
      nativeCodeBytes: 63,
      nativeCycles: 19_218,
      nativeInstructions: 1_310,
      nvmCoreBytes: 162,
      nvmDispatchBytes: 14,
      nvmProgramBytes: 30,
      nvmTotalBytes: 206,
      nvmCycles: 100_251,
      nvmInstructions: 14_114,
    });
    console.log(
      [
        "",
        "fixed-slot sum 0..99 backend comparison",
        `direct Z80  code ${nativeCodeBytes} bytes  ${nativeOutcome.cycles} T  ${nativeOutcome.instructions} instructions`,
        `NVM variant B  core ${nvmCoreBytes} + dispatch ${nvmDispatchBytes} + program ${loopBytecode.length} = ${nvmTotalBytes} bytes  ${nvmOutcome.cycles} T  ${nvmOutcome.instructions} instructions`,
      ].join("\n  "),
    );
  });

  it("measures a checked fixed-array selection and its trap path", () => {
    const native = assemble(variantSource("native-checked-index"));
    const nvm = assemble(variantSource("nvm-checked-index"));
    const success = run(native, {
      entry: symbol(native, "Start"),
      maxInstructions: 1_000,
    });
    const bounds = run(native, {
      entry: symbol(native, "StartOutOfBounds"),
      maxInstructions: 1_000,
    });
    const selectionProgram = (index: number, length = 4, stride = 1) => [
      NVM_LDI16,
      index,
      0,
      1,
      NVM_INDEX,
      0,
      1,
      length & 0xff,
      length >> 8,
      stride & 0xff,
      stride >> 8,
      2,
      NVM_LOAD8,
      2,
      3,
      NVM_RET,
    ];
    const nvmSuccess = run(nvm, {
      entry: symbol(nvm, "Start"),
      program: selectionProgram(2),
      maxInstructions: 10_000,
    });
    const nvmBounds = run(nvm, {
      entry: symbol(nvm, "Start"),
      program: selectionProgram(4),
      maxInstructions: 10_000,
    });
    const nvmStride = run(nvm, {
      entry: symbol(nvm, "Start"),
      program: selectionProgram(1, 2, 2),
      maxInstructions: 10_000,
    });
    const nvmRegionBounds = run(nvm, {
      entry: symbol(nvm, "Start"),
      program: selectionProgram(2, 3, 2),
      maxInstructions: 10_000,
    });

    expect(success.halted).toBe(true);
    expect(success.memory[0x0404]).toBe(33);
    expect(success.memory[0x0405]).toBe(0);

    expect(bounds.halted).toBe(true);
    expect(bounds.memory[0x0404]).toBe(0);
    expect(bounds.memory[0x0405]).toBe(1);

    expect(nvmSuccess.halted).toBe(true);
    expect(word(nvmSuccess.memory, 0x0406)).toBe(33);
    expect(nvmSuccess.memory[0x0600]).toBe(0);

    expect(nvmBounds.halted).toBe(true);
    expect(word(nvmBounds.memory, 0x0406)).toBe(0);
    expect(nvmBounds.memory[0x0600]).toBe(1);

    expect(nvmStride.halted).toBe(true);
    expect(word(nvmStride.memory, 0x0406)).toBe(33);
    expect(nvmStride.memory[0x0600]).toBe(0);

    expect(nvmRegionBounds.halted).toBe(true);
    expect(word(nvmRegionBounds.memory, 0x0406)).toBe(0);
    expect(nvmRegionBounds.memory[0x0600]).toBe(1);

    const completeCodeBytes = extent(native, "Start", "NativeEnd");
    const sharedSelectionBytes = extent(native, "Select", "NativeEnd");
    const nvmCoreBytes = extent(nvm, "Start", "VmEnd");
    const nvmDispatchBytes = extent(nvm, "Optab", "OptabEnd");
    const nvmProgramBytes = selectionProgram(2).length;
    expect({
      completeCodeBytes,
      sharedSelectionBytes,
      nativeSuccessCycles: success.cycles,
      nativeSuccessInstructions: success.instructions,
      nativeBoundsCycles: bounds.cycles,
      nativeBoundsInstructions: bounds.instructions,
      nvmCoreBytes,
      nvmDispatchBytes,
      nvmProgramBytes,
      nvmTotalBytes: nvmCoreBytes + nvmDispatchBytes + nvmProgramBytes,
      nvmSuccessCycles: nvmSuccess.cycles,
      nvmSuccessInstructions: nvmSuccess.instructions,
      nvmBoundsCycles: nvmBounds.cycles,
      nvmBoundsInstructions: nvmBounds.instructions,
    }).toEqual({
      completeCodeBytes: 55,
      sharedSelectionBytes: 31,
      nativeSuccessCycles: 172,
      nativeSuccessInstructions: 15,
      nativeBoundsCycles: 125,
      nativeBoundsInstructions: 12,
      nvmCoreBytes: 185,
      nvmDispatchBytes: 166,
      nvmProgramBytes: 16,
      nvmTotalBytes: 367,
      nvmSuccessCycles: 1_755,
      nvmSuccessInstructions: 193,
      nvmBoundsCycles: 831,
      nvmBoundsInstructions: 89,
    });
    console.log(
      [
        "",
        "direct Z80 checked byte-array selection",
        `complete proof code ${completeCodeBytes} bytes; shared selection and trap ${sharedSelectionBytes} bytes`,
        `success ${success.cycles} T  ${success.instructions} instructions`,
        `bounds trap ${bounds.cycles} T  ${bounds.instructions} instructions`,
        `NVM proof core ${nvmCoreBytes} + sparse dispatch ${nvmDispatchBytes} + program ${nvmProgramBytes} = ${nvmCoreBytes + nvmDispatchBytes + nvmProgramBytes} bytes`,
        `NVM success ${nvmSuccess.cycles} T  ${nvmSuccess.instructions} instructions`,
        `NVM bounds trap ${nvmBounds.cycles} T  ${nvmBounds.instructions} instructions`,
      ].join("\n  "),
    );
  });
});
