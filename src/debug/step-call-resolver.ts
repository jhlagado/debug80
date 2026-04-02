/**
 * @fileoverview Resolves unmapped CALL/RST targets during step-in.
 *
 * Peeks at the Z80 instruction at PC to determine whether it is a CALL
 * (conditional or unconditional) or RST, and if the call target has no
 * source mapping, returns the return address so the debugger can step over
 * the unmapped call instead of stepping into ROM.
 */

import { findSegmentForAddress, type SourceMapIndex } from '../mapping/source-map';
import type { Cpu } from '../z80/types';

export type StepCallResolverContext = {
  cpu: Cpu;
  memRead: (addr: number) => number;
  mappingIndex: SourceMapIndex;
};

export function getUnmappedCallReturnAddress(ctx: StepCallResolverContext): number | null {
  const pc = ctx.cpu.pc & 0xffff;
  const opcode = ctx.memRead(pc) & 0xff;

  const read16 = (addr: number): number => {
    const lo = ctx.memRead(addr & 0xffff) & 0xff;
    const hi = ctx.memRead((addr + 1) & 0xffff) & 0xff;
    return lo | (hi << 8);
  };

  let taken = false;
  let target: number | null = null;
  let returnAddress: number | null = null;

  switch (opcode) {
    case 0xcd: // CALL nn
      taken = true;
      target = read16(pc + 1);
      returnAddress = (pc + 3) & 0xffff;
      break;
    case 0xc4: // CALL NZ
      taken = !ctx.cpu.flags.Z;
      target = read16(pc + 1);
      returnAddress = (pc + 3) & 0xffff;
      break;
    case 0xcc: // CALL Z
      taken = !!ctx.cpu.flags.Z;
      target = read16(pc + 1);
      returnAddress = (pc + 3) & 0xffff;
      break;
    case 0xd4: // CALL NC
      taken = !ctx.cpu.flags.C;
      target = read16(pc + 1);
      returnAddress = (pc + 3) & 0xffff;
      break;
    case 0xdc: // CALL C
      taken = !!ctx.cpu.flags.C;
      target = read16(pc + 1);
      returnAddress = (pc + 3) & 0xffff;
      break;
    case 0xe4: // CALL PO
      taken = !ctx.cpu.flags.P;
      target = read16(pc + 1);
      returnAddress = (pc + 3) & 0xffff;
      break;
    case 0xec: // CALL PE
      taken = !!ctx.cpu.flags.P;
      target = read16(pc + 1);
      returnAddress = (pc + 3) & 0xffff;
      break;
    case 0xf4: // CALL P
      taken = !ctx.cpu.flags.S;
      target = read16(pc + 1);
      returnAddress = (pc + 3) & 0xffff;
      break;
    case 0xfc: // CALL M
      taken = !!ctx.cpu.flags.S;
      target = read16(pc + 1);
      returnAddress = (pc + 3) & 0xffff;
      break;
    case 0xc7:
    case 0xcf:
    case 0xd7:
    case 0xdf:
    case 0xe7:
    case 0xef:
    case 0xf7:
    case 0xff:
      taken = true;
      target = opcode & 0x38;
      returnAddress = (pc + 1) & 0xffff;
      break;
    default:
      break;
  }

  if (!taken || target === null || returnAddress === null) {
    return null;
  }

  const segment = findSegmentForAddress(ctx.mappingIndex, target);
  if (segment && segment.loc.file !== null) {
    return null;
  }

  return returnAddress;
}
