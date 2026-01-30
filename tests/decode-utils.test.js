"use strict";
/**
 * @file Tests for Z80 decode utilities and CB prefix handler
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const cpu_1 = require("../src/z80/cpu");
const decode_utils_1 = require("../src/z80/decode-utils");
const decode_cb_1 = require("../src/z80/decode-cb");
(0, vitest_1.describe)('decode-utils', () => {
    let cpu;
    let memory;
    let cb;
    let ctx;
    (0, vitest_1.beforeEach)(() => {
        cpu = (0, cpu_1.init)();
        memory = new Uint8Array(65536);
        cb = {
            mem_read: (addr) => memory[addr & 0xffff],
            mem_write: (addr, val) => {
                memory[addr & 0xffff] = val & 0xff;
            },
            io_read: () => 0,
            io_write: () => { },
        };
        ctx = { cpu, cb };
    });
    (0, vitest_1.describe)('getSignedOffsetByte', () => {
        (0, vitest_1.it)('should return positive values unchanged', () => {
            (0, vitest_1.expect)((0, decode_utils_1.getSignedOffsetByte)(0)).toBe(0);
            (0, vitest_1.expect)((0, decode_utils_1.getSignedOffsetByte)(1)).toBe(1);
            (0, vitest_1.expect)((0, decode_utils_1.getSignedOffsetByte)(127)).toBe(127);
        });
        (0, vitest_1.it)('should convert negative values', () => {
            (0, vitest_1.expect)((0, decode_utils_1.getSignedOffsetByte)(255)).toBe(-1);
            (0, vitest_1.expect)((0, decode_utils_1.getSignedOffsetByte)(254)).toBe(-2);
            (0, vitest_1.expect)((0, decode_utils_1.getSignedOffsetByte)(128)).toBe(-128);
        });
        (0, vitest_1.it)('should mask to byte', () => {
            (0, vitest_1.expect)((0, decode_utils_1.getSignedOffsetByte)(256)).toBe(0);
            (0, vitest_1.expect)((0, decode_utils_1.getSignedOffsetByte)(257)).toBe(1);
        });
    });
    (0, vitest_1.describe)('getFlagsRegister', () => {
        (0, vitest_1.it)('should return flags as byte', () => {
            cpu.flags.S = 1;
            cpu.flags.Z = 1;
            cpu.flags.C = 1;
            const result = (0, decode_utils_1.getFlagsRegister)(ctx);
            (0, vitest_1.expect)(result & 0x80).toBe(0x80); // S flag
            (0, vitest_1.expect)(result & 0x40).toBe(0x40); // Z flag
            (0, vitest_1.expect)(result & 0x01).toBe(0x01); // C flag
        });
    });
    (0, vitest_1.describe)('stack operations', () => {
        (0, vitest_1.it)('pushWord should push value to stack', () => {
            cpu.sp = 0x1000;
            (0, decode_utils_1.pushWord)(ctx, 0x1234);
            (0, vitest_1.expect)(cpu.sp).toBe(0x0ffe);
            (0, vitest_1.expect)(memory[0x0fff]).toBe(0x12);
            (0, vitest_1.expect)(memory[0x0ffe]).toBe(0x34);
        });
        (0, vitest_1.it)('popWord should pop value from stack', () => {
            cpu.sp = 0x0ffe;
            memory[0x0ffe] = 0x34;
            memory[0x0fff] = 0x12;
            const result = (0, decode_utils_1.popWord)(ctx);
            (0, vitest_1.expect)(result).toBe(0x1234);
            (0, vitest_1.expect)(cpu.sp).toBe(0x1000);
        });
    });
    (0, vitest_1.describe)('ALU operations', () => {
        (0, vitest_1.it)('doAdd should add to accumulator', () => {
            cpu.a = 0x10;
            (0, decode_utils_1.doAdd)(ctx, 0x05);
            (0, vitest_1.expect)(cpu.a).toBe(0x15);
            (0, vitest_1.expect)(cpu.flags.Z).toBe(0);
            (0, vitest_1.expect)(cpu.flags.N).toBe(0);
        });
        (0, vitest_1.it)('doAdd should set zero flag', () => {
            cpu.a = 0x00;
            (0, decode_utils_1.doAdd)(ctx, 0x00);
            (0, vitest_1.expect)(cpu.a).toBe(0x00);
            (0, vitest_1.expect)(cpu.flags.Z).toBe(1);
        });
        (0, vitest_1.it)('doAdd should set carry flag on overflow', () => {
            cpu.a = 0xff;
            (0, decode_utils_1.doAdd)(ctx, 0x02);
            (0, vitest_1.expect)(cpu.a).toBe(0x01);
            (0, vitest_1.expect)(cpu.flags.C).toBe(1);
        });
        (0, vitest_1.it)('doSub should subtract from accumulator', () => {
            cpu.a = 0x10;
            (0, decode_utils_1.doSub)(ctx, 0x05);
            (0, vitest_1.expect)(cpu.a).toBe(0x0b);
            (0, vitest_1.expect)(cpu.flags.N).toBe(1);
        });
        (0, vitest_1.it)('doAnd should AND with accumulator', () => {
            cpu.a = 0xf0;
            (0, decode_utils_1.doAnd)(ctx, 0x0f);
            (0, vitest_1.expect)(cpu.a).toBe(0x00);
            (0, vitest_1.expect)(cpu.flags.Z).toBe(1);
            (0, vitest_1.expect)(cpu.flags.H).toBe(1);
        });
        (0, vitest_1.it)('doOr should OR with accumulator', () => {
            cpu.a = 0xf0;
            (0, decode_utils_1.doOr)(ctx, 0x0f);
            (0, vitest_1.expect)(cpu.a).toBe(0xff);
        });
        (0, vitest_1.it)('doXor should XOR with accumulator', () => {
            cpu.a = 0xff;
            (0, decode_utils_1.doXor)(ctx, 0xff);
            (0, vitest_1.expect)(cpu.a).toBe(0x00);
            (0, vitest_1.expect)(cpu.flags.Z).toBe(1);
        });
        (0, vitest_1.it)('doInc should increment value', () => {
            const result = (0, decode_utils_1.doInc)(ctx, 0x10);
            (0, vitest_1.expect)(result).toBe(0x11);
            (0, vitest_1.expect)(cpu.flags.N).toBe(0);
        });
        (0, vitest_1.it)('doInc should set overflow on 0x7f', () => {
            const result = (0, decode_utils_1.doInc)(ctx, 0x7f);
            (0, vitest_1.expect)(result).toBe(0x80);
            (0, vitest_1.expect)(cpu.flags.P).toBe(1);
        });
        (0, vitest_1.it)('doDec should decrement value', () => {
            const result = (0, decode_utils_1.doDec)(ctx, 0x10);
            (0, vitest_1.expect)(result).toBe(0x0f);
            (0, vitest_1.expect)(cpu.flags.N).toBe(1);
        });
        (0, vitest_1.it)('doCp should compare without modifying A', () => {
            cpu.a = 0x10;
            (0, decode_utils_1.doCp)(ctx, 0x10);
            (0, vitest_1.expect)(cpu.a).toBe(0x10);
            (0, vitest_1.expect)(cpu.flags.Z).toBe(1);
        });
        (0, vitest_1.it)('doAdc should add with carry', () => {
            cpu.a = 0x10;
            cpu.flags.C = 1;
            (0, decode_utils_1.doAdc)(ctx, 0x05);
            (0, vitest_1.expect)(cpu.a).toBe(0x16);
        });
        (0, vitest_1.it)('doSbc should subtract with carry', () => {
            cpu.a = 0x10;
            cpu.flags.C = 1;
            (0, decode_utils_1.doSbc)(ctx, 0x05);
            (0, vitest_1.expect)(cpu.a).toBe(0x0a);
        });
    });
    (0, vitest_1.describe)('rotate operations', () => {
        (0, vitest_1.it)('doRlc should rotate left', () => {
            const result = (0, decode_utils_1.doRlc)(ctx, 0x80);
            (0, vitest_1.expect)(result).toBe(0x01);
            (0, vitest_1.expect)(cpu.flags.C).toBe(1);
        });
        (0, vitest_1.it)('doRrc should rotate right', () => {
            const result = (0, decode_utils_1.doRrc)(ctx, 0x01);
            (0, vitest_1.expect)(result).toBe(0x80);
            (0, vitest_1.expect)(cpu.flags.C).toBe(1);
        });
        (0, vitest_1.it)('doRl should rotate left through carry', () => {
            cpu.flags.C = 1;
            const result = (0, decode_utils_1.doRl)(ctx, 0x00);
            (0, vitest_1.expect)(result).toBe(0x01);
        });
        (0, vitest_1.it)('doRr should rotate right through carry', () => {
            cpu.flags.C = 1;
            const result = (0, decode_utils_1.doRr)(ctx, 0x00);
            (0, vitest_1.expect)(result).toBe(0x80);
        });
        (0, vitest_1.it)('doSla should shift left arithmetic', () => {
            const result = (0, decode_utils_1.doSla)(ctx, 0x80);
            (0, vitest_1.expect)(result).toBe(0x00);
            (0, vitest_1.expect)(cpu.flags.C).toBe(1);
        });
        (0, vitest_1.it)('doSra should shift right arithmetic', () => {
            const result = (0, decode_utils_1.doSra)(ctx, 0x81);
            (0, vitest_1.expect)(result).toBe(0xc0);
            (0, vitest_1.expect)(cpu.flags.C).toBe(1);
        });
        (0, vitest_1.it)('doSll should shift left logical', () => {
            const result = (0, decode_utils_1.doSll)(ctx, 0x80);
            (0, vitest_1.expect)(result).toBe(0x01);
            (0, vitest_1.expect)(cpu.flags.C).toBe(1);
        });
        (0, vitest_1.it)('doSrl should shift right logical', () => {
            const result = (0, decode_utils_1.doSrl)(ctx, 0x81);
            (0, vitest_1.expect)(result).toBe(0x40);
            (0, vitest_1.expect)(cpu.flags.C).toBe(1);
        });
    });
    (0, vitest_1.describe)('16-bit arithmetic', () => {
        (0, vitest_1.it)('doHlAdd should add to HL', () => {
            cpu.h = 0x10;
            cpu.l = 0x00;
            (0, decode_utils_1.doHlAdd)(ctx, 0x0100);
            (0, vitest_1.expect)(cpu.h).toBe(0x11);
            (0, vitest_1.expect)(cpu.l).toBe(0x00);
        });
        (0, vitest_1.it)('doHlAdc should add with carry to HL', () => {
            cpu.h = 0x10;
            cpu.l = 0x00;
            cpu.flags.C = 1;
            (0, decode_utils_1.doHlAdc)(ctx, 0x0100);
            (0, vitest_1.expect)(cpu.h).toBe(0x11);
            (0, vitest_1.expect)(cpu.l).toBe(0x01);
        });
        (0, vitest_1.it)('doHlSbc should subtract with carry from HL', () => {
            cpu.h = 0x10;
            cpu.l = 0x00;
            cpu.flags.C = 1;
            (0, decode_utils_1.doHlSbc)(ctx, 0x0100);
            (0, vitest_1.expect)(cpu.h).toBe(0x0e);
            (0, vitest_1.expect)(cpu.l).toBe(0xff);
        });
        (0, vitest_1.it)('doIxAdd should add to IX', () => {
            cpu.ix = 0x1000;
            (0, decode_utils_1.doIxAdd)(ctx, 0x0100);
            (0, vitest_1.expect)(cpu.ix).toBe(0x1100);
        });
    });
    (0, vitest_1.describe)('jump/call operations', () => {
        (0, vitest_1.it)('doConditionalAbsoluteJump should jump when condition true', () => {
            cpu.pc = 0x0000;
            memory[0x0001] = 0x34;
            memory[0x0002] = 0x12;
            (0, decode_utils_1.doConditionalAbsoluteJump)(ctx, true);
            (0, vitest_1.expect)(cpu.pc).toBe(0x1233); // -1 because decode increments after
        });
        (0, vitest_1.it)('doConditionalAbsoluteJump should skip when condition false', () => {
            cpu.pc = 0x0000;
            (0, decode_utils_1.doConditionalAbsoluteJump)(ctx, false);
            (0, vitest_1.expect)(cpu.pc).toBe(0x0002);
        });
        (0, vitest_1.it)('doConditionalRelativeJump should jump when condition true', () => {
            cpu.pc = 0x0000;
            memory[0x0001] = 0x10; // +16
            (0, decode_utils_1.doConditionalRelativeJump)(ctx, true);
            (0, vitest_1.expect)(cpu.pc).toBe(0x0011);
        });
        (0, vitest_1.it)('doConditionalRelativeJump should handle negative offset', () => {
            cpu.pc = 0x0020;
            memory[0x0021] = 0xfe; // -2
            (0, decode_utils_1.doConditionalRelativeJump)(ctx, true);
            (0, vitest_1.expect)(cpu.pc).toBe(0x001f);
        });
        (0, vitest_1.it)('doConditionalCall should call when condition true', () => {
            cpu.pc = 0x0000;
            cpu.sp = 0x1000;
            memory[0x0001] = 0x34;
            memory[0x0002] = 0x12;
            (0, decode_utils_1.doConditionalCall)(ctx, true);
            (0, vitest_1.expect)(cpu.pc).toBe(0x1233);
            (0, vitest_1.expect)(cpu.sp).toBe(0x0ffe);
        });
        (0, vitest_1.it)('doConditionalReturn should return when condition true', () => {
            cpu.pc = 0x0000;
            cpu.sp = 0x0ffe;
            memory[0x0ffe] = 0x34;
            memory[0x0fff] = 0x12;
            (0, decode_utils_1.doConditionalReturn)(ctx, true);
            (0, vitest_1.expect)(cpu.pc).toBe(0x1233);
        });
        (0, vitest_1.it)('doReset should push and jump to address', () => {
            cpu.pc = 0x1234;
            cpu.sp = 0x1000;
            (0, decode_utils_1.doReset)(ctx, 0x38);
            (0, vitest_1.expect)(cpu.pc).toBe(0x0037);
            (0, vitest_1.expect)(cpu.sp).toBe(0x0ffe);
        });
    });
    (0, vitest_1.describe)('flag operations', () => {
        (0, vitest_1.it)('getFlagsPrime should return alternate flags', () => {
            cpu.flags_prime.S = 1;
            cpu.flags_prime.Z = 1;
            const result = (0, decode_utils_1.getFlagsPrime)(ctx);
            (0, vitest_1.expect)(result & 0xc0).toBe(0xc0);
        });
        (0, vitest_1.it)('setFlagsPrime should set alternate flags', () => {
            (0, decode_utils_1.setFlagsPrime)(ctx, 0xc0);
            (0, vitest_1.expect)(cpu.flags_prime.S).toBe(1);
            (0, vitest_1.expect)(cpu.flags_prime.Z).toBe(1);
        });
        (0, vitest_1.it)('updateXYFlags should set X and Y from result', () => {
            (0, decode_utils_1.updateXYFlags)(ctx, 0x28); // bits 3 and 5 set
            (0, vitest_1.expect)(cpu.flags.X).toBe(1);
            (0, vitest_1.expect)(cpu.flags.Y).toBe(1);
        });
    });
    (0, vitest_1.describe)('special instructions', () => {
        (0, vitest_1.it)('getIxOffset should read and sign-extend offset', () => {
            cpu.pc = 0x0000;
            cpu.ix = 0x1000;
            memory[0x0001] = 0x10; // +16
            const result = (0, decode_utils_1.getIxOffset)(ctx);
            (0, vitest_1.expect)(result).toBe(0x1010);
            (0, vitest_1.expect)(cpu.pc).toBe(0x0001);
        });
        (0, vitest_1.it)('doDaa should adjust BCD after addition', () => {
            cpu.a = 0x15;
            cpu.flags.N = 0;
            (0, decode_utils_1.doDaa)(ctx);
            (0, vitest_1.expect)(cpu.a).toBe(0x15); // already valid BCD
        });
        (0, vitest_1.it)('doNeg should negate accumulator', () => {
            cpu.a = 0x01;
            (0, decode_utils_1.doNeg)(ctx);
            (0, vitest_1.expect)(cpu.a).toBe(0xff);
        });
        (0, vitest_1.it)('doIn should read port and set flags', () => {
            cb.io_read = () => 0x80;
            const result = (0, decode_utils_1.doIn)(ctx, 0x00);
            (0, vitest_1.expect)(result).toBe(0x80);
            (0, vitest_1.expect)(cpu.flags.S).toBe(1);
        });
    });
    (0, vitest_1.describe)('createDecodeUtils', () => {
        (0, vitest_1.it)('should create utils bundle', () => {
            const utils = (0, decode_utils_1.createDecodeUtils)();
            (0, vitest_1.expect)(utils.doAdd).toBeDefined();
            (0, vitest_1.expect)(utils.doSub).toBeDefined();
            (0, vitest_1.expect)(utils.doRlc).toBeDefined();
            (0, vitest_1.expect)(utils.pushWord).toBeDefined();
            (0, vitest_1.expect)(utils.popWord).toBeDefined();
        });
    });
});
(0, vitest_1.describe)('decode-cb', () => {
    let cpu;
    let memory;
    let cb;
    let ctx;
    let utils;
    (0, vitest_1.beforeEach)(() => {
        cpu = (0, cpu_1.init)();
        memory = new Uint8Array(65536);
        cb = {
            mem_read: (addr) => memory[addr & 0xffff],
            mem_write: (addr, val) => {
                memory[addr & 0xffff] = val & 0xff;
            },
            io_read: () => 0,
            io_write: () => { },
        };
        ctx = { cpu, cb };
        utils = (0, decode_utils_1.createDecodeUtils)();
    });
    (0, vitest_1.describe)('executeCbPrefix', () => {
        (0, vitest_1.it)('should handle RLC B (CB 00)', () => {
            cpu.b = 0x80;
            cpu.pc = 0x0000;
            memory[0x0001] = 0x00; // RLC B
            (0, decode_cb_1.executeCbPrefix)(ctx, utils);
            (0, vitest_1.expect)(cpu.b).toBe(0x01);
            (0, vitest_1.expect)(cpu.flags.C).toBe(1);
        });
        (0, vitest_1.it)('should handle RRC C (CB 09)', () => {
            cpu.c = 0x01;
            cpu.pc = 0x0000;
            memory[0x0001] = 0x09; // RRC C
            (0, decode_cb_1.executeCbPrefix)(ctx, utils);
            (0, vitest_1.expect)(cpu.c).toBe(0x80);
            (0, vitest_1.expect)(cpu.flags.C).toBe(1);
        });
        (0, vitest_1.it)('should handle BIT 0,A (CB 47)', () => {
            cpu.a = 0x01;
            cpu.pc = 0x0000;
            memory[0x0001] = 0x47; // BIT 0,A
            (0, decode_cb_1.executeCbPrefix)(ctx, utils);
            (0, vitest_1.expect)(cpu.flags.Z).toBe(0);
        });
        (0, vitest_1.it)('should handle BIT 7,A (CB 7F) when bit not set', () => {
            cpu.a = 0x00;
            cpu.pc = 0x0000;
            memory[0x0001] = 0x7f; // BIT 7,A
            (0, decode_cb_1.executeCbPrefix)(ctx, utils);
            (0, vitest_1.expect)(cpu.flags.Z).toBe(1);
        });
        (0, vitest_1.it)('should handle RES 0,B (CB 80)', () => {
            cpu.b = 0xff;
            cpu.pc = 0x0000;
            memory[0x0001] = 0x80; // RES 0,B
            (0, decode_cb_1.executeCbPrefix)(ctx, utils);
            (0, vitest_1.expect)(cpu.b).toBe(0xfe);
        });
        (0, vitest_1.it)('should handle SET 7,A (CB FF)', () => {
            cpu.a = 0x00;
            cpu.pc = 0x0000;
            memory[0x0001] = 0xff; // SET 7,A
            (0, decode_cb_1.executeCbPrefix)(ctx, utils);
            (0, vitest_1.expect)(cpu.a).toBe(0x80);
        });
        (0, vitest_1.it)('should handle (HL) operand for rotate', () => {
            cpu.h = 0x10;
            cpu.l = 0x00;
            memory[0x1000] = 0x80;
            cpu.pc = 0x0000;
            memory[0x0001] = 0x06; // RLC (HL)
            (0, decode_cb_1.executeCbPrefix)(ctx, utils);
            (0, vitest_1.expect)(memory[0x1000]).toBe(0x01);
        });
        (0, vitest_1.it)('should increment R register', () => {
            cpu.r = 0x00;
            cpu.pc = 0x0000;
            memory[0x0001] = 0x00;
            (0, decode_cb_1.executeCbPrefix)(ctx, utils);
            (0, vitest_1.expect)(cpu.r & 0x7f).toBe(0x01);
        });
    });
});
//# sourceMappingURL=decode-utils.test.js.map