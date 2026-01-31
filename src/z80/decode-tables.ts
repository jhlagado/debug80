/**
 * @file Z80 decoder instruction table builders.
 */

import { cycle_counts_cb, parity_bits } from './constants';
import { pushWord } from './core-helpers';
import { noop, OpcodeHandler, OpcodeTable } from './opcode-types';
import { Callbacks, Cpu } from './types';

type ByteOpHandler = (value: number) => number;

export type DdContext = {
  cpu: Cpu;
  cb: Callbacks;
  getSignedOffsetByte: (value: number) => number;
  do_ix_add: (operand: number) => void;
  do_inc: (value: number) => number;
  do_dec: (value: number) => number;
  do_add: (value: number) => void;
  do_adc: (value: number) => void;
  do_sub: (value: number) => void;
  do_sbc: (value: number) => void;
  do_and: (value: number) => void;
  do_xor: (value: number) => void;
  do_or: (value: number) => void;
  do_cp: (value: number) => void;
  do_rlc: (value: number) => number;
  do_rrc: (value: number) => number;
  do_rl: (value: number) => number;
  do_rr: (value: number) => number;
  do_sla: (value: number) => number;
  do_sra: (value: number) => number;
  do_sll: (value: number) => number;
  do_srl: (value: number) => number;
  pop_word: () => number;
};

export type EdContext = {
  cpu: Cpu;
  cb: Callbacks;
  do_in: (value: number) => number;
  do_hl_sbc: (value: number) => void;
  do_hl_adc: (value: number) => void;
  do_neg: () => void;
  pop_word: () => number;
  update_xy_flags: (value: number) => void;
  do_ldi: () => void;
  do_cpi: () => void;
  do_ini: () => void;
  do_outi: () => void;
  do_ldd: () => void;
  do_cpd: () => void;
  do_ind: () => void;
  do_outd: () => void;
};

/**
 * Builds the DD prefix instruction table (IX operations).
 */
export function buildDdInstructions(ctx: DdContext): OpcodeTable {
  const {
    cpu,
    cb,
    getSignedOffsetByte,
    do_ix_add,
    do_inc,
    do_dec,
    do_add,
    do_adc,
    do_sub,
    do_sbc,
    do_and,
    do_xor,
    do_or,
    do_cp,
    do_rlc,
    do_rrc,
    do_rl,
    do_rr,
    do_sla,
    do_sra,
    do_sll,
    do_srl,
    pop_word,
  } = ctx;

  const getByteOp = (ops: ByteOpHandler[], index: number): ByteOpHandler =>
    ops[index] ?? ((v): number => v);

  const dd_instructions: OpcodeTable = new Array<OpcodeHandler>(256).fill(noop);
  // 0x09 : ADD IX, BC
  dd_instructions[0x09] = (): void => {
    do_ix_add(cpu.c | (cpu.b << 8));
  };
  // 0x19 : ADD IX, DE
  dd_instructions[0x19] = (): void => {
    do_ix_add(cpu.e | (cpu.d << 8));
  };
  // 0x21 : LD IX, nn
  dd_instructions[0x21] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.ix = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.ix |= cb.mem_read(cpu.pc) << 8;
  };
  // 0x22 : LD (nn), IX
  dd_instructions[0x22] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cb.mem_write(address, cpu.ix & 0xff);
    cb.mem_write((address + 1) & 0xffff, (cpu.ix >>> 8) & 0xff);
  };
  // 0x23 : INC IX
  dd_instructions[0x23] = (): void => {
    cpu.ix = (cpu.ix + 1) & 0xffff;
  };
  // 0x24 : INC IXH (Undocumented)
  dd_instructions[0x24] = (): void => {
    cpu.ix = (do_inc(cpu.ix >>> 8) << 8) | (cpu.ix & 0xff);
  };
  // 0x25 : DEC IXH (Undocumented)
  dd_instructions[0x25] = (): void => {
    cpu.ix = (do_dec(cpu.ix >>> 8) << 8) | (cpu.ix & 0xff);
  };
  // 0x26 : LD IXH, n (Undocumented)
  dd_instructions[0x26] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.ix = (cb.mem_read(cpu.pc) << 8) | (cpu.ix & 0xff);
  };
  // 0x29 : ADD IX, IX
  dd_instructions[0x29] = (): void => {
    do_ix_add(cpu.ix);
  };
  // 0x2a : LD IX, (nn)
  dd_instructions[0x2a] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cpu.ix = cb.mem_read(address);
    cpu.ix |= cb.mem_read((address + 1) & 0xffff) << 8;
  };
  // 0x2b : DEC IX
  dd_instructions[0x2b] = (): void => {
    cpu.ix = (cpu.ix - 1) & 0xffff;
  };
  // 0x2c : INC IXL (Undocumented)
  dd_instructions[0x2c] = (): void => {
    cpu.ix = do_inc(cpu.ix & 0xff) | (cpu.ix & 0xff00);
  };
  // 0x2d : DEC IXL (Undocumented)
  dd_instructions[0x2d] = (): void => {
    cpu.ix = do_dec(cpu.ix & 0xff) | (cpu.ix & 0xff00);
  };
  // 0x2e : LD IXL, n (Undocumented)
  dd_instructions[0x2e] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.ix = (cb.mem_read(cpu.pc) & 0xff) | (cpu.ix & 0xff00);
  };
  // 0x34 : INC (IX+n)
  dd_instructions[0x34] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    const value = cb.mem_read((offset + cpu.ix) & 0xffff);
    cb.mem_write((offset + cpu.ix) & 0xffff, do_inc(value));
  };
  // 0x35 : DEC (IX+n)
  dd_instructions[0x35] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    const value = cb.mem_read((offset + cpu.ix) & 0xffff);
    cb.mem_write((offset + cpu.ix) & 0xffff, do_dec(value));
  };
  // 0x36 : LD (IX+n), n
  dd_instructions[0x36] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cb.mem_write((cpu.ix + offset) & 0xffff, cb.mem_read(cpu.pc));
  };
  // 0x39 : ADD IX, SP
  dd_instructions[0x39] = (): void => {
    do_ix_add(cpu.sp);
  };
  // 0x44 : LD B, IXH (Undocumented)
  dd_instructions[0x44] = (): void => {
    cpu.b = (cpu.ix >>> 8) & 0xff;
  };
  // 0x45 : LD B, IXL (Undocumented)
  dd_instructions[0x45] = (): void => {
    cpu.b = cpu.ix & 0xff;
  };
  // 0x46 : LD B, (IX+n)
  dd_instructions[0x46] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cpu.b = cb.mem_read((cpu.ix + offset) & 0xffff);
  };
  // 0x4c : LD C, IXH (Undocumented)
  dd_instructions[0x4c] = (): void => {
    cpu.c = (cpu.ix >>> 8) & 0xff;
  };
  // 0x4d : LD C, IXL (Undocumented)
  dd_instructions[0x4d] = (): void => {
    cpu.c = cpu.ix & 0xff;
  };
  // 0x4e : LD C, (IX+n)
  dd_instructions[0x4e] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cpu.c = cb.mem_read((cpu.ix + offset) & 0xffff);
  };
  // 0x54 : LD D, IXH (Undocumented)
  dd_instructions[0x54] = (): void => {
    cpu.d = (cpu.ix >>> 8) & 0xff;
  };
  // 0x55 : LD D, IXL (Undocumented)
  dd_instructions[0x55] = (): void => {
    cpu.d = cpu.ix & 0xff;
  };
  // 0x56 : LD D, (IX+n)
  dd_instructions[0x56] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cpu.d = cb.mem_read((cpu.ix + offset) & 0xffff);
  };
  // 0x5c : LD E, IXH (Undocumented)
  dd_instructions[0x5c] = (): void => {
    cpu.e = (cpu.ix >>> 8) & 0xff;
  };
  // 0x5d : LD E, IXL (Undocumented)
  dd_instructions[0x5d] = (): void => {
    cpu.e = cpu.ix & 0xff;
  };
  // 0x5e : LD E, (IX+n)
  dd_instructions[0x5e] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cpu.e = cb.mem_read((cpu.ix + offset) & 0xffff);
  };
  // 0x60 : LD IXH, B (Undocumented)
  dd_instructions[0x60] = (): void => {
    cpu.ix = (cpu.ix & 0xff) | (cpu.b << 8);
  };
  // 0x61 : LD IXH, C (Undocumented)
  dd_instructions[0x61] = (): void => {
    cpu.ix = (cpu.ix & 0xff) | (cpu.c << 8);
  };
  // 0x62 : LD IXH, D (Undocumented)
  dd_instructions[0x62] = (): void => {
    cpu.ix = (cpu.ix & 0xff) | (cpu.d << 8);
  };
  // 0x63 : LD IXH, E (Undocumented)
  dd_instructions[0x63] = (): void => {
    cpu.ix = (cpu.ix & 0xff) | (cpu.e << 8);
  };
  // 0x64 : LD IXH, IXH (Undocumented)
  dd_instructions[0x64] = (): void => {
    // No-op.
  };
  // 0x65 : LD IXH, IXL (Undocumented)
  dd_instructions[0x65] = (): void => {
    cpu.ix = (cpu.ix & 0xff) | ((cpu.ix & 0xff) << 8);
  };
  // 0x66 : LD H, (IX+n)
  dd_instructions[0x66] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cpu.h = cb.mem_read((cpu.ix + offset) & 0xffff);
  };
  // 0x67 : LD IXH, A (Undocumented)
  dd_instructions[0x67] = (): void => {
    cpu.ix = (cpu.ix & 0xff) | (cpu.a << 8);
  };
  // 0x68 : LD IXL, B (Undocumented)
  dd_instructions[0x68] = (): void => {
    cpu.ix = (cpu.ix & 0xff00) | cpu.b;
  };
  // 0x69 : LD IXL, C (Undocumented)
  dd_instructions[0x69] = (): void => {
    cpu.ix = (cpu.ix & 0xff00) | cpu.c;
  };
  // 0x6a : LD IXL, D (Undocumented)
  dd_instructions[0x6a] = (): void => {
    cpu.ix = (cpu.ix & 0xff00) | cpu.d;
  };
  // 0x6b : LD IXL, E (Undocumented)
  dd_instructions[0x6b] = (): void => {
    cpu.ix = (cpu.ix & 0xff00) | cpu.e;
  };
  // 0x6c : LD IXL, IXH (Undocumented)
  dd_instructions[0x6c] = (): void => {
    cpu.ix = (cpu.ix & 0xff00) | (cpu.ix >>> 8);
  };
  // 0x6d : LD IXL, IXL (Undocumented)
  dd_instructions[0x6d] = (): void => {
    // No-op.
  };
  // 0x6e : LD L, (IX+n)
  dd_instructions[0x6e] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cpu.l = cb.mem_read((cpu.ix + offset) & 0xffff);
  };
  // 0x6f : LD IXL, A (Undocumented)
  dd_instructions[0x6f] = (): void => {
    cpu.ix = (cpu.ix & 0xff00) | cpu.a;
  };
  // 0x70 : LD (IX+n), B
  dd_instructions[0x70] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cb.mem_write((cpu.ix + offset) & 0xffff, cpu.b);
  };
  // 0x71 : LD (IX+n), C
  dd_instructions[0x71] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cb.mem_write((cpu.ix + offset) & 0xffff, cpu.c);
  };
  // 0x72 : LD (IX+n), D
  dd_instructions[0x72] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cb.mem_write((cpu.ix + offset) & 0xffff, cpu.d);
  };
  // 0x73 : LD (IX+n), E
  dd_instructions[0x73] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cb.mem_write((cpu.ix + offset) & 0xffff, cpu.e);
  };
  // 0x74 : LD (IX+n), H
  dd_instructions[0x74] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cb.mem_write((cpu.ix + offset) & 0xffff, cpu.h);
  };
  // 0x75 : LD (IX+n), L
  dd_instructions[0x75] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cb.mem_write((cpu.ix + offset) & 0xffff, cpu.l);
  };
  // 0x77 : LD (IX+n), A
  dd_instructions[0x77] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cb.mem_write((cpu.ix + offset) & 0xffff, cpu.a);
  };
  // 0x7c : LD A, IXH (Undocumented)
  dd_instructions[0x7c] = (): void => {
    cpu.a = (cpu.ix >>> 8) & 0xff;
  };
  // 0x7d : LD A, IXL (Undocumented)
  dd_instructions[0x7d] = (): void => {
    cpu.a = cpu.ix & 0xff;
  };
  // 0x7e : LD A, (IX+n)
  dd_instructions[0x7e] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cpu.a = cb.mem_read((cpu.ix + offset) & 0xffff);
  };
  // 0x84 : ADD A, IXH (Undocumented)
  dd_instructions[0x84] = (): void => {
    do_add((cpu.ix >>> 8) & 0xff);
  };
  // 0x85 : ADD A, IXL (Undocumented)
  dd_instructions[0x85] = (): void => {
    do_add(cpu.ix & 0xff);
  };
  // 0x86 : ADD A, (IX+n)
  dd_instructions[0x86] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    do_add(cb.mem_read((cpu.ix + offset) & 0xffff));
  };
  // 0x8c : ADC A, IXH (Undocumented)
  dd_instructions[0x8c] = (): void => {
    do_adc((cpu.ix >>> 8) & 0xff);
  };
  // 0x8d : ADC A, IXL (Undocumented)
  dd_instructions[0x8d] = (): void => {
    do_adc(cpu.ix & 0xff);
  };
  // 0x8e : ADC A, (IX+n)
  dd_instructions[0x8e] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    do_adc(cb.mem_read((cpu.ix + offset) & 0xffff));
  };
  // 0x94 : SUB IXH (Undocumented)
  dd_instructions[0x94] = (): void => {
    do_sub((cpu.ix >>> 8) & 0xff);
  };
  // 0x95 : SUB IXL (Undocumented)
  dd_instructions[0x95] = (): void => {
    do_sub(cpu.ix & 0xff);
  };
  // 0x96 : SUB A, (IX+n)
  dd_instructions[0x96] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    do_sub(cb.mem_read((cpu.ix + offset) & 0xffff));
  };
  // 0x9c : SBC IXH (Undocumented)
  dd_instructions[0x9c] = (): void => {
    do_sbc((cpu.ix >>> 8) & 0xff);
  };
  // 0x9d : SBC IXL (Undocumented)
  dd_instructions[0x9d] = (): void => {
    do_sbc(cpu.ix & 0xff);
  };
  // 0x9e : SBC A, (IX+n)
  dd_instructions[0x9e] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    do_sbc(cb.mem_read((cpu.ix + offset) & 0xffff));
  };
  // 0xa4 : AND IXH (Undocumented)
  dd_instructions[0xa4] = (): void => {
    do_and((cpu.ix >>> 8) & 0xff);
  };
  // 0xa5 : AND IXL (Undocumented)
  dd_instructions[0xa5] = (): void => {
    do_and(cpu.ix & 0xff);
  };
  // 0xa6 : AND A, (IX+n)
  dd_instructions[0xa6] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    do_and(cb.mem_read((cpu.ix + offset) & 0xffff));
  };
  // 0xac : XOR IXH (Undocumented)
  dd_instructions[0xac] = (): void => {
    do_xor((cpu.ix >>> 8) & 0xff);
  };
  // 0xad : XOR IXL (Undocumented)
  dd_instructions[0xad] = (): void => {
    do_xor(cpu.ix & 0xff);
  };
  // 0xae : XOR A, (IX+n)
  dd_instructions[0xae] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    do_xor(cb.mem_read((cpu.ix + offset) & 0xffff));
  };
  // 0xb4 : OR IXH (Undocumented)
  dd_instructions[0xb4] = (): void => {
    do_or((cpu.ix >>> 8) & 0xff);
  };
  // 0xb5 : OR IXL (Undocumented)
  dd_instructions[0xb5] = (): void => {
    do_or(cpu.ix & 0xff);
  };
  // 0xb6 : OR A, (IX+n)
  dd_instructions[0xb6] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    do_or(cb.mem_read((cpu.ix + offset) & 0xffff));
  };
  // 0xbc : CP IXH (Undocumented)
  dd_instructions[0xbc] = (): void => {
    do_cp((cpu.ix >>> 8) & 0xff);
  };
  // 0xbd : CP IXL (Undocumented)
  dd_instructions[0xbd] = (): void => {
    do_cp(cpu.ix & 0xff);
  };
  // 0xbe : CP A, (IX+n)
  dd_instructions[0xbe] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    do_cp(cb.mem_read((cpu.ix + offset) & 0xffff));
  };

  // ==========================================================================
  // DDCB PREFIX HANDLER (IX BIT INSTRUCTIONS)
  // ==========================================================================
  dd_instructions[0xcb] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const opcode1 = cb.mem_read(cpu.pc);
    let value;

    if (opcode1 < 0x40) {
      const ddcb_functions: ByteOpHandler[] = [
        do_rlc,
        do_rrc,
        do_rl,
        do_rr,
        do_sla,
        do_sra,
        do_sll,
        do_srl,
      ];

      const func = getByteOp(ddcb_functions, (opcode1 & 0x38) >>> 3);
      value = func(cb.mem_read((cpu.ix + offset) & 0xffff));

      cb.mem_write((cpu.ix + offset) & 0xffff, value);
    } else {
      const bit_number = (opcode1 & 0x38) >>> 3;

      if (opcode1 < 0x80) {
        cpu.flags.N = 0;
        cpu.flags.H = 1;
        cpu.flags.Z = !(cb.mem_read((cpu.ix + offset) & 0xffff) & (1 << bit_number)) ? 1 : 0;
        cpu.flags.P = cpu.flags.Z;
        cpu.flags.S = bit_number === 7 && !cpu.flags.Z ? 1 : 0;
      } else if (opcode1 < 0xc0) {
        value = cb.mem_read((cpu.ix + offset) & 0xffff) & ~(1 << bit_number) & 0xff;
        cb.mem_write((cpu.ix + offset) & 0xffff, value);
      } else {
        value = cb.mem_read((cpu.ix + offset) & 0xffff) | (1 << bit_number);
        cb.mem_write((cpu.ix + offset) & 0xffff, value);
      }
    }

    if (value !== undefined) {
      if ((opcode1 & 0x07) === 0) {
        cpu.b = value;
      } else if ((opcode1 & 0x07) === 1) {
        cpu.c = value;
      } else if ((opcode1 & 0x07) === 2) {
        cpu.d = value;
      } else if ((opcode1 & 0x07) === 3) {
        cpu.e = value;
      } else if ((opcode1 & 0x07) === 4) {
        cpu.h = value;
      } else if ((opcode1 & 0x07) === 5) {
        cpu.l = value;
      } else if ((opcode1 & 0x07) === 7) {
        cpu.a = value;
      }
    }

    cpu.cycle_counter += (cycle_counts_cb[opcode1] ?? 0) + 8;
  };
  // 0xe1 : POP IX
  dd_instructions[0xe1] = (): void => {
    cpu.ix = pop_word();
  };
  // 0xe3 : EX (SP), IX
  dd_instructions[0xe3] = (): void => {
    const temp = cpu.ix;
    cpu.ix = cb.mem_read(cpu.sp);
    cpu.ix |= cb.mem_read((cpu.sp + 1) & 0xffff) << 8;
    cb.mem_write(cpu.sp, temp & 0xff);
    cb.mem_write((cpu.sp + 1) & 0xffff, (temp >>> 8) & 0xff);
  };
  // 0xe5 : PUSH IX
  dd_instructions[0xe5] = (): void => {
    pushWord(cpu, cb, cpu.ix);
  };
  // 0xe9 : JP (IX)
  dd_instructions[0xe9] = (): void => {
    cpu.pc = (cpu.ix - 1) & 0xffff;
  };
  // 0xf9 : LD SP, IX
  dd_instructions[0xf9] = (): void => {
    cpu.sp = cpu.ix;
  };

  return dd_instructions;
}

/**
 * Builds the ED prefix instruction table (extended operations).
 */
export function buildEdInstructions(ctx: EdContext): OpcodeTable {
  const {
    cpu,
    cb,
    do_in,
    do_hl_sbc,
    do_hl_adc,
    do_neg,
    pop_word,
    update_xy_flags,
    do_ldi,
    do_cpi,
    do_ini,
    do_outi,
    do_ldd,
    do_cpd,
    do_ind,
    do_outd,
  } = ctx;

  const ed_instructions: OpcodeTable = new Array<OpcodeHandler>(256).fill(noop);
  ed_instructions[0x40] = (): void => {
    cpu.b = do_in((cpu.b << 8) | cpu.c);
  };
  ed_instructions[0x41] = (): void => {
    cb.io_write((cpu.b << 8) | cpu.c, cpu.b);
  };
  ed_instructions[0x42] = (): void => {
    do_hl_sbc(cpu.c | (cpu.b << 8));
  };
  ed_instructions[0x43] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cb.mem_write(address, cpu.c);
    cb.mem_write((address + 1) & 0xffff, cpu.b);
  };
  ed_instructions[0x44] = (): void => {
    do_neg();
  };
  ed_instructions[0x45] = (): void => {
    cpu.pc = (pop_word() - 1) & 0xffff;
    cpu.iff1 = cpu.iff2;
  };
  ed_instructions[0x46] = (): void => {
    cpu.imode = 0;
  };
  ed_instructions[0x47] = (): void => {
    cpu.i = cpu.a;
  };
  ed_instructions[0x48] = (): void => {
    cpu.c = do_in((cpu.b << 8) | cpu.c);
  };
  ed_instructions[0x49] = (): void => {
    cb.io_write((cpu.b << 8) | cpu.c, cpu.c);
  };
  ed_instructions[0x4a] = (): void => {
    do_hl_adc(cpu.c | (cpu.b << 8));
  };
  ed_instructions[0x4b] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cpu.c = cb.mem_read(address);
    cpu.b = cb.mem_read((address + 1) & 0xffff);
  };
  ed_instructions[0x4c] = (): void => {
    do_neg();
  };
  ed_instructions[0x4d] = (): void => {
    cpu.pc = (pop_word() - 1) & 0xffff;
  };
  ed_instructions[0x4e] = (): void => {
    cpu.imode = 0;
  };
  ed_instructions[0x4f] = (): void => {
    cpu.r = cpu.a;
  };
  ed_instructions[0x50] = (): void => {
    cpu.d = do_in((cpu.b << 8) | cpu.c);
  };
  ed_instructions[0x51] = (): void => {
    cb.io_write((cpu.b << 8) | cpu.c, cpu.d);
  };
  ed_instructions[0x52] = (): void => {
    do_hl_sbc(cpu.e | (cpu.d << 8));
  };
  ed_instructions[0x53] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cb.mem_write(address, cpu.e);
    cb.mem_write((address + 1) & 0xffff, cpu.d);
  };
  ed_instructions[0x54] = (): void => {
    do_neg();
  };
  ed_instructions[0x55] = (): void => {
    cpu.pc = (pop_word() - 1) & 0xffff;
    cpu.iff1 = cpu.iff2;
  };
  ed_instructions[0x56] = (): void => {
    cpu.imode = 1;
  };
  ed_instructions[0x57] = (): void => {
    cpu.a = cpu.i;
    cpu.flags.S = cpu.i & 0x80 ? 1 : 0;
    cpu.flags.Z = cpu.i ? 0 : 1;
    cpu.flags.H = 0;
    cpu.flags.P = cpu.iff2;
    cpu.flags.N = 0;
  };
  ed_instructions[0x58] = (): void => {
    cpu.e = do_in((cpu.b << 8) | cpu.c);
  };
  ed_instructions[0x59] = (): void => {
    cb.io_write((cpu.b << 8) | cpu.c, cpu.e);
  };
  ed_instructions[0x5a] = (): void => {
    do_hl_adc(cpu.e | (cpu.d << 8));
  };
  ed_instructions[0x5b] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cpu.e = cb.mem_read(address);
    cpu.d = cb.mem_read((address + 1) & 0xffff);
  };
  ed_instructions[0x5c] = (): void => {
    do_neg();
  };
  ed_instructions[0x5d] = (): void => {
    cpu.pc = (pop_word() - 1) & 0xffff;
    cpu.iff1 = cpu.iff2;
  };
  ed_instructions[0x5e] = (): void => {
    cpu.imode = 2;
  };
  ed_instructions[0x5f] = (): void => {
    cpu.a = cpu.r;
    cpu.flags.P = cpu.iff2;
  };
  ed_instructions[0x60] = (): void => {
    cpu.h = do_in((cpu.b << 8) | cpu.c);
  };
  ed_instructions[0x61] = (): void => {
    cb.io_write((cpu.b << 8) | cpu.c, cpu.h);
  };
  ed_instructions[0x62] = (): void => {
    do_hl_sbc(cpu.l | (cpu.h << 8));
  };
  ed_instructions[0x63] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cb.mem_write(address, cpu.l);
    cb.mem_write((address + 1) & 0xffff, cpu.h);
  };
  ed_instructions[0x64] = (): void => {
    do_neg();
  };
  ed_instructions[0x65] = (): void => {
    cpu.pc = (pop_word() - 1) & 0xffff;
    cpu.iff1 = cpu.iff2;
  };
  ed_instructions[0x66] = (): void => {
    cpu.imode = 0;
  };
  ed_instructions[0x67] = (): void => {
    let hl_value = cb.mem_read(cpu.l | (cpu.h << 8));
    const temp1 = hl_value & 0x0f;
    const temp2 = cpu.a & 0x0f;
    hl_value = ((hl_value & 0xf0) >>> 4) | (temp2 << 4);
    cpu.a = (cpu.a & 0xf0) | temp1;
    cb.mem_write(cpu.l | (cpu.h << 8), hl_value);

    cpu.flags.S = cpu.a & 0x80 ? 1 : 0;
    cpu.flags.Z = cpu.a === 0 ? 1 : 0;
    cpu.flags.H = 0;
    cpu.flags.P = (parity_bits[cpu.a] ?? 0) === 1 ? 1 : 0;
    cpu.flags.N = 0;
    update_xy_flags(cpu.a);
  };
  ed_instructions[0x68] = (): void => {
    cpu.l = do_in((cpu.b << 8) | cpu.c);
  };
  ed_instructions[0x69] = (): void => {
    cb.io_write((cpu.b << 8) | cpu.c, cpu.l);
  };
  ed_instructions[0x6a] = (): void => {
    do_hl_adc(cpu.l | (cpu.h << 8));
  };
  ed_instructions[0x6b] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cpu.l = cb.mem_read(address);
    cpu.h = cb.mem_read((address + 1) & 0xffff);
  };
  ed_instructions[0x6c] = (): void => {
    do_neg();
  };
  ed_instructions[0x6d] = (): void => {
    cpu.pc = (pop_word() - 1) & 0xffff;
    cpu.iff1 = cpu.iff2;
  };
  ed_instructions[0x6e] = (): void => {
    cpu.imode = 0;
  };
  ed_instructions[0x6f] = (): void => {
    let hl_value = cb.mem_read(cpu.l | (cpu.h << 8));
    const temp1 = hl_value & 0xf0;
    const temp2 = cpu.a & 0x0f;
    hl_value = ((hl_value & 0x0f) << 4) | temp2;
    cpu.a = (cpu.a & 0xf0) | (temp1 >>> 4);
    cb.mem_write(cpu.l | (cpu.h << 8), hl_value);

    cpu.flags.S = cpu.a & 0x80 ? 1 : 0;
    cpu.flags.Z = cpu.a === 0 ? 1 : 0;
    cpu.flags.H = 0;
    cpu.flags.P = (parity_bits[cpu.a] ?? 0) === 1 ? 1 : 0;
    cpu.flags.N = 0;
    update_xy_flags(cpu.a);
  };
  ed_instructions[0x70] = (): void => {
    do_in((cpu.b << 8) | cpu.c);
  };
  ed_instructions[0x71] = (): void => {
    cb.io_write((cpu.b << 8) | cpu.c, 0);
  };
  ed_instructions[0x72] = (): void => {
    do_hl_sbc(cpu.sp);
  };
  ed_instructions[0x73] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cb.mem_write(address, cpu.sp & 0xff);
    cb.mem_write((address + 1) & 0xffff, (cpu.sp >>> 8) & 0xff);
  };
  ed_instructions[0x74] = (): void => {
    do_neg();
  };
  ed_instructions[0x75] = (): void => {
    cpu.pc = (pop_word() - 1) & 0xffff;
    cpu.iff1 = cpu.iff2;
  };
  ed_instructions[0x76] = (): void => {
    cpu.imode = 1;
  };
  ed_instructions[0x78] = (): void => {
    cpu.a = do_in((cpu.b << 8) | cpu.c);
  };
  ed_instructions[0x79] = (): void => {
    cb.io_write((cpu.b << 8) | cpu.c, cpu.a);
  };
  ed_instructions[0x7a] = (): void => {
    do_hl_adc(cpu.sp);
  };
  ed_instructions[0x7b] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cpu.sp = cb.mem_read(address);
    cpu.sp |= cb.mem_read((address + 1) & 0xffff) << 8;
  };
  ed_instructions[0x7c] = (): void => {
    do_neg();
  };
  ed_instructions[0x7d] = (): void => {
    cpu.pc = (pop_word() - 1) & 0xffff;
    cpu.iff1 = cpu.iff2;
  };
  ed_instructions[0x7e] = (): void => {
    cpu.imode = 2;
  };
  ed_instructions[0xa0] = (): void => {
    do_ldi();
  };
  ed_instructions[0xa1] = (): void => {
    do_cpi();
  };
  ed_instructions[0xa2] = (): void => {
    do_ini();
  };
  ed_instructions[0xa3] = (): void => {
    do_outi();
  };
  ed_instructions[0xa8] = (): void => {
    do_ldd();
  };
  ed_instructions[0xa9] = (): void => {
    do_cpd();
  };
  ed_instructions[0xaa] = (): void => {
    do_ind();
  };
  ed_instructions[0xab] = (): void => {
    do_outd();
  };
  ed_instructions[0xb0] = (): void => {
    do_ldi();
    if (cpu.b || cpu.c) {
      cpu.cycle_counter += 5;
      cpu.pc = (cpu.pc - 2) & 0xffff;
    }
  };
  ed_instructions[0xb1] = (): void => {
    do_cpi();
    if (!cpu.flags.Z && (cpu.b || cpu.c)) {
      cpu.cycle_counter += 5;
      cpu.pc = (cpu.pc - 2) & 0xffff;
    }
  };
  ed_instructions[0xb2] = (): void => {
    do_ini();
    if (cpu.b) {
      cpu.cycle_counter += 5;
      cpu.pc = (cpu.pc - 2) & 0xffff;
    }
  };
  ed_instructions[0xb3] = (): void => {
    do_outi();
    if (cpu.b) {
      cpu.cycle_counter += 5;
      cpu.pc = (cpu.pc - 2) & 0xffff;
    }
  };
  ed_instructions[0xb8] = (): void => {
    do_ldd();
    if (cpu.b || cpu.c) {
      cpu.cycle_counter += 5;
      cpu.pc = (cpu.pc - 2) & 0xffff;
    }
  };
  ed_instructions[0xb9] = (): void => {
    do_cpd();
    if (!cpu.flags.Z && (cpu.b || cpu.c)) {
      cpu.cycle_counter += 5;
      cpu.pc = (cpu.pc - 2) & 0xffff;
    }
  };
  ed_instructions[0xba] = (): void => {
    do_ind();
    if (cpu.b) {
      cpu.cycle_counter += 5;
      cpu.pc = (cpu.pc - 2) & 0xffff;
    }
  };
  ed_instructions[0xbb] = (): void => {
    do_outd();
    if (cpu.b) {
      cpu.cycle_counter += 5;
      cpu.pc = (cpu.pc - 2) & 0xffff;
    }
  };

  return ed_instructions;
}
