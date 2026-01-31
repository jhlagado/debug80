/**
 * @file Tests for Z80 decode utilities and CB prefix handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { init as initCpu } from '../../src/z80/cpu';
import { Cpu, Callbacks } from '../../src/z80/types';
import { DecodeContext } from '../../src/z80/decode-types';
import {
  getSignedOffsetByte,
  getFlagsRegister,
  getFlagsPrime,
  setFlagsPrime,
  updateXYFlags,
  popWord,
  pushWord,
  doAdd,
  doAdc,
  doSub,
  doSbc,
  doAnd,
  doOr,
  doXor,
  doInc,
  doDec,
  doCp,
  doRlc,
  doRrc,
  doRl,
  doRr,
  doSla,
  doSra,
  doSll,
  doSrl,
  doHlAdd,
  doHlAdc,
  doHlSbc,
  doIxAdd,
  doConditionalAbsoluteJump,
  doConditionalRelativeJump,
  doConditionalCall,
  doConditionalReturn,
  doReset,
  getIxOffset,
  doDaa,
  doNeg,
  doIn,
  createDecodeUtils,
} from '../../src/z80/decode-utils';
import { executeCbPrefix } from '../../src/z80/decode-cb';

describe('decode-utils', () => {
  let cpu: Cpu;
  let memory: Uint8Array;
  let cb: Callbacks;
  let ctx: DecodeContext;

  beforeEach(() => {
    cpu = initCpu();
    memory = new Uint8Array(65536);
    cb = {
      mem_read: (addr: number) => memory[addr & 0xffff],
      mem_write: (addr: number, val: number) => {
        memory[addr & 0xffff] = val & 0xff;
      },
      io_read: () => 0,
      io_write: () => {},
    };
    ctx = { cpu, cb };
  });

  describe('getSignedOffsetByte', () => {
    it('should return positive values unchanged', () => {
      expect(getSignedOffsetByte(0)).toBe(0);
      expect(getSignedOffsetByte(1)).toBe(1);
      expect(getSignedOffsetByte(127)).toBe(127);
    });

    it('should convert negative values', () => {
      expect(getSignedOffsetByte(255)).toBe(-1);
      expect(getSignedOffsetByte(254)).toBe(-2);
      expect(getSignedOffsetByte(128)).toBe(-128);
    });

    it('should mask to byte', () => {
      expect(getSignedOffsetByte(256)).toBe(0);
      expect(getSignedOffsetByte(257)).toBe(1);
    });
  });

  describe('getFlagsRegister', () => {
    it('should return flags as byte', () => {
      cpu.flags.S = 1;
      cpu.flags.Z = 1;
      cpu.flags.C = 1;
      const result = getFlagsRegister(ctx);
      expect(result & 0x80).toBe(0x80); // S flag
      expect(result & 0x40).toBe(0x40); // Z flag
      expect(result & 0x01).toBe(0x01); // C flag
    });
  });

  describe('stack operations', () => {
    it('pushWord should push value to stack', () => {
      cpu.sp = 0x1000;
      pushWord(ctx, 0x1234);
      expect(cpu.sp).toBe(0x0ffe);
      expect(memory[0x0fff]).toBe(0x12);
      expect(memory[0x0ffe]).toBe(0x34);
    });

    it('popWord should pop value from stack', () => {
      cpu.sp = 0x0ffe;
      memory[0x0ffe] = 0x34;
      memory[0x0fff] = 0x12;
      const result = popWord(ctx);
      expect(result).toBe(0x1234);
      expect(cpu.sp).toBe(0x1000);
    });
  });

  describe('ALU operations', () => {
    it('doAdd should add to accumulator', () => {
      cpu.a = 0x10;
      doAdd(ctx, 0x05);
      expect(cpu.a).toBe(0x15);
      expect(cpu.flags.Z).toBe(0);
      expect(cpu.flags.N).toBe(0);
    });

    it('doAdd should set zero flag', () => {
      cpu.a = 0x00;
      doAdd(ctx, 0x00);
      expect(cpu.a).toBe(0x00);
      expect(cpu.flags.Z).toBe(1);
    });

    it('doAdd should set carry flag on overflow', () => {
      cpu.a = 0xff;
      doAdd(ctx, 0x02);
      expect(cpu.a).toBe(0x01);
      expect(cpu.flags.C).toBe(1);
    });

    it('doSub should subtract from accumulator', () => {
      cpu.a = 0x10;
      doSub(ctx, 0x05);
      expect(cpu.a).toBe(0x0b);
      expect(cpu.flags.N).toBe(1);
    });

    it('doAnd should AND with accumulator', () => {
      cpu.a = 0xf0;
      doAnd(ctx, 0x0f);
      expect(cpu.a).toBe(0x00);
      expect(cpu.flags.Z).toBe(1);
      expect(cpu.flags.H).toBe(1);
    });

    it('doOr should OR with accumulator', () => {
      cpu.a = 0xf0;
      doOr(ctx, 0x0f);
      expect(cpu.a).toBe(0xff);
    });

    it('doXor should XOR with accumulator', () => {
      cpu.a = 0xff;
      doXor(ctx, 0xff);
      expect(cpu.a).toBe(0x00);
      expect(cpu.flags.Z).toBe(1);
    });

    it('doInc should increment value', () => {
      const result = doInc(ctx, 0x10);
      expect(result).toBe(0x11);
      expect(cpu.flags.N).toBe(0);
    });

    it('doInc should set overflow on 0x7f', () => {
      const result = doInc(ctx, 0x7f);
      expect(result).toBe(0x80);
      expect(cpu.flags.P).toBe(1);
    });

    it('doDec should decrement value', () => {
      const result = doDec(ctx, 0x10);
      expect(result).toBe(0x0f);
      expect(cpu.flags.N).toBe(1);
    });

    it('doCp should compare without modifying A', () => {
      cpu.a = 0x10;
      doCp(ctx, 0x10);
      expect(cpu.a).toBe(0x10);
      expect(cpu.flags.Z).toBe(1);
    });

    it('doAdc should add with carry', () => {
      cpu.a = 0x10;
      cpu.flags.C = 1;
      doAdc(ctx, 0x05);
      expect(cpu.a).toBe(0x16);
    });

    it('doSbc should subtract with carry', () => {
      cpu.a = 0x10;
      cpu.flags.C = 1;
      doSbc(ctx, 0x05);
      expect(cpu.a).toBe(0x0a);
    });
  });

  describe('rotate operations', () => {
    it('doRlc should rotate left', () => {
      const result = doRlc(ctx, 0x80);
      expect(result).toBe(0x01);
      expect(cpu.flags.C).toBe(1);
    });

    it('doRrc should rotate right', () => {
      const result = doRrc(ctx, 0x01);
      expect(result).toBe(0x80);
      expect(cpu.flags.C).toBe(1);
    });

    it('doRl should rotate left through carry', () => {
      cpu.flags.C = 1;
      const result = doRl(ctx, 0x00);
      expect(result).toBe(0x01);
    });

    it('doRr should rotate right through carry', () => {
      cpu.flags.C = 1;
      const result = doRr(ctx, 0x00);
      expect(result).toBe(0x80);
    });

    it('doSla should shift left arithmetic', () => {
      const result = doSla(ctx, 0x80);
      expect(result).toBe(0x00);
      expect(cpu.flags.C).toBe(1);
    });

    it('doSra should shift right arithmetic', () => {
      const result = doSra(ctx, 0x81);
      expect(result).toBe(0xc0);
      expect(cpu.flags.C).toBe(1);
    });

    it('doSll should shift left logical', () => {
      const result = doSll(ctx, 0x80);
      expect(result).toBe(0x01);
      expect(cpu.flags.C).toBe(1);
    });

    it('doSrl should shift right logical', () => {
      const result = doSrl(ctx, 0x81);
      expect(result).toBe(0x40);
      expect(cpu.flags.C).toBe(1);
    });
  });

  describe('16-bit arithmetic', () => {
    it('doHlAdd should add to HL', () => {
      cpu.h = 0x10;
      cpu.l = 0x00;
      doHlAdd(ctx, 0x0100);
      expect(cpu.h).toBe(0x11);
      expect(cpu.l).toBe(0x00);
    });

    it('doHlAdc should add with carry to HL', () => {
      cpu.h = 0x10;
      cpu.l = 0x00;
      cpu.flags.C = 1;
      doHlAdc(ctx, 0x0100);
      expect(cpu.h).toBe(0x11);
      expect(cpu.l).toBe(0x01);
    });

    it('doHlSbc should subtract with carry from HL', () => {
      cpu.h = 0x10;
      cpu.l = 0x00;
      cpu.flags.C = 1;
      doHlSbc(ctx, 0x0100);
      expect(cpu.h).toBe(0x0e);
      expect(cpu.l).toBe(0xff);
    });

    it('doIxAdd should add to IX', () => {
      cpu.ix = 0x1000;
      doIxAdd(ctx, 0x0100);
      expect(cpu.ix).toBe(0x1100);
    });
  });

  describe('jump/call operations', () => {
    it('doConditionalAbsoluteJump should jump when condition true', () => {
      cpu.pc = 0x0000;
      memory[0x0001] = 0x34;
      memory[0x0002] = 0x12;
      doConditionalAbsoluteJump(ctx, true);
      expect(cpu.pc).toBe(0x1233); // -1 because decode increments after
    });

    it('doConditionalAbsoluteJump should skip when condition false', () => {
      cpu.pc = 0x0000;
      doConditionalAbsoluteJump(ctx, false);
      expect(cpu.pc).toBe(0x0002);
    });

    it('doConditionalRelativeJump should jump when condition true', () => {
      cpu.pc = 0x0000;
      memory[0x0001] = 0x10; // +16
      doConditionalRelativeJump(ctx, true);
      expect(cpu.pc).toBe(0x0011);
    });

    it('doConditionalRelativeJump should handle negative offset', () => {
      cpu.pc = 0x0020;
      memory[0x0021] = 0xfe; // -2
      doConditionalRelativeJump(ctx, true);
      expect(cpu.pc).toBe(0x001f);
    });

    it('doConditionalCall should call when condition true', () => {
      cpu.pc = 0x0000;
      cpu.sp = 0x1000;
      memory[0x0001] = 0x34;
      memory[0x0002] = 0x12;
      doConditionalCall(ctx, true);
      expect(cpu.pc).toBe(0x1233);
      expect(cpu.sp).toBe(0x0ffe);
    });

    it('doConditionalReturn should return when condition true', () => {
      cpu.pc = 0x0000;
      cpu.sp = 0x0ffe;
      memory[0x0ffe] = 0x34;
      memory[0x0fff] = 0x12;
      doConditionalReturn(ctx, true);
      expect(cpu.pc).toBe(0x1233);
    });

    it('doReset should push and jump to address', () => {
      cpu.pc = 0x1234;
      cpu.sp = 0x1000;
      doReset(ctx, 0x38);
      expect(cpu.pc).toBe(0x0037);
      expect(cpu.sp).toBe(0x0ffe);
    });
  });

  describe('flag operations', () => {
    it('getFlagsPrime should return alternate flags', () => {
      cpu.flags_prime.S = 1;
      cpu.flags_prime.Z = 1;
      const result = getFlagsPrime(ctx);
      expect(result & 0xc0).toBe(0xc0);
    });

    it('setFlagsPrime should set alternate flags', () => {
      setFlagsPrime(ctx, 0xc0);
      expect(cpu.flags_prime.S).toBe(1);
      expect(cpu.flags_prime.Z).toBe(1);
    });

    it('updateXYFlags should set X and Y from result', () => {
      updateXYFlags(ctx, 0x28); // bits 3 and 5 set
      expect(cpu.flags.X).toBe(1);
      expect(cpu.flags.Y).toBe(1);
    });
  });

  describe('special instructions', () => {
    it('getIxOffset should read and sign-extend offset', () => {
      cpu.pc = 0x0000;
      cpu.ix = 0x1000;
      memory[0x0001] = 0x10; // +16
      const result = getIxOffset(ctx);
      expect(result).toBe(0x1010);
      expect(cpu.pc).toBe(0x0001);
    });

    it('doDaa should adjust BCD after addition', () => {
      cpu.a = 0x15;
      cpu.flags.N = 0;
      doDaa(ctx);
      expect(cpu.a).toBe(0x15); // already valid BCD
    });

    it('doNeg should negate accumulator', () => {
      cpu.a = 0x01;
      doNeg(ctx);
      expect(cpu.a).toBe(0xff);
    });

    it('doIn should read port and set flags', () => {
      cb.io_read = () => 0x80;
      const result = doIn(ctx, 0x00);
      expect(result).toBe(0x80);
      expect(cpu.flags.S).toBe(1);
    });
  });

  describe('createDecodeUtils', () => {
    it('should create utils bundle', () => {
      const utils = createDecodeUtils();
      expect(utils.doAdd).toBeDefined();
      expect(utils.doSub).toBeDefined();
      expect(utils.doRlc).toBeDefined();
      expect(utils.pushWord).toBeDefined();
      expect(utils.popWord).toBeDefined();
    });
  });
});

describe('decode-cb', () => {
  let cpu: Cpu;
  let memory: Uint8Array;
  let cb: Callbacks;
  let ctx: DecodeContext;
  let utils: ReturnType<typeof createDecodeUtils>;

  beforeEach(() => {
    cpu = initCpu();
    memory = new Uint8Array(65536);
    cb = {
      mem_read: (addr: number) => memory[addr & 0xffff],
      mem_write: (addr: number, val: number) => {
        memory[addr & 0xffff] = val & 0xff;
      },
      io_read: () => 0,
      io_write: () => {},
    };
    ctx = { cpu, cb };
    utils = createDecodeUtils();
  });

  describe('executeCbPrefix', () => {
    it('should handle RLC B (CB 00)', () => {
      cpu.b = 0x80;
      cpu.pc = 0x0000;
      memory[0x0001] = 0x00; // RLC B
      executeCbPrefix(ctx, utils);
      expect(cpu.b).toBe(0x01);
      expect(cpu.flags.C).toBe(1);
    });

    it('should handle RRC C (CB 09)', () => {
      cpu.c = 0x01;
      cpu.pc = 0x0000;
      memory[0x0001] = 0x09; // RRC C
      executeCbPrefix(ctx, utils);
      expect(cpu.c).toBe(0x80);
      expect(cpu.flags.C).toBe(1);
    });

    it('should handle BIT 0,A (CB 47)', () => {
      cpu.a = 0x01;
      cpu.pc = 0x0000;
      memory[0x0001] = 0x47; // BIT 0,A
      executeCbPrefix(ctx, utils);
      expect(cpu.flags.Z).toBe(0);
    });

    it('should handle BIT 7,A (CB 7F) when bit not set', () => {
      cpu.a = 0x00;
      cpu.pc = 0x0000;
      memory[0x0001] = 0x7f; // BIT 7,A
      executeCbPrefix(ctx, utils);
      expect(cpu.flags.Z).toBe(1);
    });

    it('should handle RES 0,B (CB 80)', () => {
      cpu.b = 0xff;
      cpu.pc = 0x0000;
      memory[0x0001] = 0x80; // RES 0,B
      executeCbPrefix(ctx, utils);
      expect(cpu.b).toBe(0xfe);
    });

    it('should handle SET 7,A (CB FF)', () => {
      cpu.a = 0x00;
      cpu.pc = 0x0000;
      memory[0x0001] = 0xff; // SET 7,A
      executeCbPrefix(ctx, utils);
      expect(cpu.a).toBe(0x80);
    });

    it('should handle (HL) operand for rotate', () => {
      cpu.h = 0x10;
      cpu.l = 0x00;
      memory[0x1000] = 0x80;
      cpu.pc = 0x0000;
      memory[0x0001] = 0x06; // RLC (HL)
      executeCbPrefix(ctx, utils);
      expect(memory[0x1000]).toBe(0x01);
    });

    it('should increment R register', () => {
      cpu.r = 0x00;
      cpu.pc = 0x0000;
      memory[0x0001] = 0x00;
      executeCbPrefix(ctx, utils);
      expect(cpu.r & 0x7f).toBe(0x01);
    });
  });
});
