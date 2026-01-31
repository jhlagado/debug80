"use strict";
/**
 * @file TEC Common Utilities Tests
 * @description Tests for shared TEC platform utilities
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const tec_common_1 = require("../src/platforms/tec-common");
const cycle_clock_1 = require("../src/platforms/cycle-clock");
(0, vitest_1.describe)('TEC Common Constants', () => {
    (0, vitest_1.it)('should have correct clock frequencies', () => {
        (0, vitest_1.expect)(tec_common_1.TEC_SLOW_HZ).toBe(400000);
        (0, vitest_1.expect)(tec_common_1.TEC_FAST_HZ).toBe(4000000);
    });
    (0, vitest_1.it)('should have correct timing constants', () => {
        (0, vitest_1.expect)(tec_common_1.TEC_SILENCE_CYCLES).toBe(10000);
        (0, vitest_1.expect)(tec_common_1.TEC_KEY_HOLD_MS).toBe(30);
    });
    (0, vitest_1.it)('should have correct memory map constants', () => {
        (0, vitest_1.expect)(tec_common_1.Z80_ADDRESS_SPACE).toBe(0x10000);
        (0, vitest_1.expect)(tec_common_1.BYTE_MASK).toBe(0xff);
        (0, vitest_1.expect)(tec_common_1.ADDR_MASK).toBe(0xffff);
    });
    (0, vitest_1.it)('should have correct TEC-1G shadow ROM constants', () => {
        (0, vitest_1.expect)(tec_common_1.TEC1G_SHADOW_START).toBe(0xc000);
        (0, vitest_1.expect)(tec_common_1.TEC1G_SHADOW_END).toBe(0xc7ff);
        (0, vitest_1.expect)(tec_common_1.TEC1G_SHADOW_SIZE).toBe(0x0800);
    });
    (0, vitest_1.it)('should have correct TEC-1G expansion memory constants', () => {
        (0, vitest_1.expect)(tec_common_1.TEC1G_EXPAND_START).toBe(0x8000);
        (0, vitest_1.expect)(tec_common_1.TEC1G_EXPAND_END).toBe(0xbfff);
        (0, vitest_1.expect)(tec_common_1.TEC1G_EXPAND_SIZE).toBe(0x4000);
    });
    (0, vitest_1.it)('should have correct TEC-1G RAM protection constants', () => {
        (0, vitest_1.expect)(tec_common_1.TEC1G_PROTECT_START).toBe(0x4000);
        (0, vitest_1.expect)(tec_common_1.TEC1G_PROTECT_END).toBe(0x7fff);
    });
    (0, vitest_1.it)('should have correct ROM load address', () => {
        (0, vitest_1.expect)(tec_common_1.TEC1_ROM_LOAD_ADDR).toBe(0xc000);
    });
    (0, vitest_1.it)('should have correct key constants', () => {
        (0, vitest_1.expect)(tec_common_1.KEY_RESET).toBe(0x12);
        (0, vitest_1.expect)(tec_common_1.KEY_NONE).toBe(0x7f);
    });
});
(0, vitest_1.describe)('updateDisplayDigits', () => {
    (0, vitest_1.it)('should update selected digits', () => {
        const digits = [0, 0, 0, 0, 0, 0];
        const result = (0, tec_common_1.updateDisplayDigits)(digits, 0b000101, 0xab);
        (0, vitest_1.expect)(result).toBe(true);
        (0, vitest_1.expect)(digits).toEqual([0xab, 0, 0xab, 0, 0, 0]);
    });
    (0, vitest_1.it)('should return false when no digits selected', () => {
        const digits = [0, 0, 0, 0, 0, 0];
        const result = (0, tec_common_1.updateDisplayDigits)(digits, 0, 0xab);
        (0, vitest_1.expect)(result).toBe(false);
        (0, vitest_1.expect)(digits).toEqual([0, 0, 0, 0, 0, 0]);
    });
    (0, vitest_1.it)('should update all digits when all selected', () => {
        const digits = [0, 0, 0, 0, 0, 0];
        const result = (0, tec_common_1.updateDisplayDigits)(digits, 0b111111, 0xff);
        (0, vitest_1.expect)(result).toBe(true);
        (0, vitest_1.expect)(digits).toEqual([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    });
});
(0, vitest_1.describe)('updateMatrixRow', () => {
    (0, vitest_1.it)('should update the correct row', () => {
        const matrix = [0, 0, 0, 0, 0, 0, 0, 0];
        const result = (0, tec_common_1.updateMatrixRow)(matrix, 0b00000100, 0xcd);
        (0, vitest_1.expect)(result).toBe(true);
        (0, vitest_1.expect)(matrix[2]).toBe(0xcd);
    });
    (0, vitest_1.it)('should return false for invalid row mask', () => {
        const matrix = [0, 0, 0, 0, 0, 0, 0, 0];
        const result = (0, tec_common_1.updateMatrixRow)(matrix, 0, 0xcd);
        (0, vitest_1.expect)(result).toBe(false);
    });
    (0, vitest_1.it)('should handle row 0', () => {
        const matrix = [0, 0, 0, 0, 0, 0, 0, 0];
        const result = (0, tec_common_1.updateMatrixRow)(matrix, 0b00000001, 0x55);
        (0, vitest_1.expect)(result).toBe(true);
        (0, vitest_1.expect)(matrix[0]).toBe(0x55);
    });
    (0, vitest_1.it)('should handle row 7', () => {
        const matrix = [0, 0, 0, 0, 0, 0, 0, 0];
        const result = (0, tec_common_1.updateMatrixRow)(matrix, 0b10000000, 0xaa);
        (0, vitest_1.expect)(result).toBe(true);
        (0, vitest_1.expect)(matrix[7]).toBe(0xaa);
    });
});
(0, vitest_1.describe)('calculateSpeakerFrequency', () => {
    (0, vitest_1.it)('should calculate correct frequency', () => {
        // At 4MHz, 2000 cycles between edges = 1kHz
        const freq = (0, tec_common_1.calculateSpeakerFrequency)(4000000, 2000);
        (0, vitest_1.expect)(freq).toBe(1000);
    });
    (0, vitest_1.it)('should return 0 for zero or negative delta', () => {
        (0, vitest_1.expect)((0, tec_common_1.calculateSpeakerFrequency)(4000000, 0)).toBe(0);
        (0, vitest_1.expect)((0, tec_common_1.calculateSpeakerFrequency)(4000000, -100)).toBe(0);
    });
    (0, vitest_1.it)('should return 0 for zero clock', () => {
        (0, vitest_1.expect)((0, tec_common_1.calculateSpeakerFrequency)(0, 2000)).toBe(0);
    });
});
(0, vitest_1.describe)('calculateKeyHoldCycles', () => {
    (0, vitest_1.it)('should calculate correct cycles at 4MHz', () => {
        // 30ms at 4MHz = 120000 cycles
        const cycles = (0, tec_common_1.calculateKeyHoldCycles)(tec_common_1.TEC_FAST_HZ, 30);
        (0, vitest_1.expect)(cycles).toBe(120000);
    });
    (0, vitest_1.it)('should calculate correct cycles at 400kHz', () => {
        // 30ms at 400kHz = 12000 cycles
        const cycles = (0, tec_common_1.calculateKeyHoldCycles)(tec_common_1.TEC_SLOW_HZ, 30);
        (0, vitest_1.expect)(cycles).toBe(12000);
    });
    (0, vitest_1.it)('should return minimum of 1 cycle', () => {
        const cycles = (0, tec_common_1.calculateKeyHoldCycles)(1, 0);
        (0, vitest_1.expect)(cycles).toBeGreaterThanOrEqual(1);
    });
});
(0, vitest_1.describe)('shouldUpdate', () => {
    (0, vitest_1.it)('should return true when updateMs is 0', () => {
        (0, vitest_1.expect)((0, tec_common_1.shouldUpdate)(Date.now(), 0)).toBe(true);
    });
    (0, vitest_1.it)('should return true when enough time has elapsed', () => {
        const lastUpdate = Date.now() - 100;
        (0, vitest_1.expect)((0, tec_common_1.shouldUpdate)(lastUpdate, 50)).toBe(true);
    });
    (0, vitest_1.it)('should return false when not enough time has elapsed', () => {
        const lastUpdate = Date.now();
        (0, vitest_1.expect)((0, tec_common_1.shouldUpdate)(lastUpdate, 1000)).toBe(false);
    });
});
(0, vitest_1.describe)('microsecondsToClocks', () => {
    (0, vitest_1.it)('should convert microseconds to clocks', () => {
        // 37us at 4MHz = 148 cycles
        const cycles = (0, tec_common_1.microsecondsToClocks)(4000000, 37);
        (0, vitest_1.expect)(cycles).toBe(148);
    });
    (0, vitest_1.it)('should return minimum of 1', () => {
        const cycles = (0, tec_common_1.microsecondsToClocks)(1, 0);
        (0, vitest_1.expect)(cycles).toBe(1);
    });
});
(0, vitest_1.describe)('millisecondsToClocks', () => {
    (0, vitest_1.it)('should convert milliseconds to clocks', () => {
        // 400ms at 4MHz = 1600000 cycles
        const cycles = (0, tec_common_1.millisecondsToClocks)(4000000, 400);
        (0, vitest_1.expect)(cycles).toBe(1600000);
    });
    (0, vitest_1.it)('should return minimum of 1', () => {
        const cycles = (0, tec_common_1.millisecondsToClocks)(1, 0);
        (0, vitest_1.expect)(cycles).toBe(1);
    });
});
(0, vitest_1.describe)('createSerialState', () => {
    (0, vitest_1.it)('should create initial serial state with correct cyclesPerBit', () => {
        const state = (0, tec_common_1.createSerialState)(4000000, 9600);
        (0, vitest_1.expect)(state.level).toBe(1);
        (0, vitest_1.expect)(state.rxLevel).toBe(1);
        (0, vitest_1.expect)(state.rxBusy).toBe(false);
        (0, vitest_1.expect)(state.rxToken).toBe(0);
        (0, vitest_1.expect)(state.rxQueue).toEqual([]);
        (0, vitest_1.expect)(state.cyclesPerBit).toBeCloseTo(4000000 / 9600, 2);
    });
    (0, vitest_1.it)('should handle different baud rates', () => {
        const state4800 = (0, tec_common_1.createSerialState)(4000000, 4800);
        const state9600 = (0, tec_common_1.createSerialState)(4000000, 9600);
        (0, vitest_1.expect)(state4800.cyclesPerBit).toBeCloseTo(4000000 / 4800, 2);
        (0, vitest_1.expect)(state9600.cyclesPerBit).toBeCloseTo(4000000 / 9600, 2);
        (0, vitest_1.expect)(state4800.cyclesPerBit).toBeGreaterThan(state9600.cyclesPerBit);
    });
});
(0, vitest_1.describe)('createTecSerialDecoder', () => {
    (0, vitest_1.it)('should create a decoder with basic config', () => {
        const clock = new cycle_clock_1.CycleClock();
        const decoder = (0, tec_common_1.createTecSerialDecoder)({
            cycleClock: clock,
            baud: 9600,
            clockHz: 4000000,
        });
        (0, vitest_1.expect)(decoder).toBeDefined();
    });
    (0, vitest_1.it)('should create a decoder with onByte callback', () => {
        const clock = new cycle_clock_1.CycleClock();
        const receivedBytes = [];
        const decoder = (0, tec_common_1.createTecSerialDecoder)({
            cycleClock: clock,
            baud: 9600,
            clockHz: 4000000,
            onByte: (byte) => receivedBytes.push(byte),
        });
        (0, vitest_1.expect)(decoder).toBeDefined();
    });
});
//# sourceMappingURL=tec-common.test.js.map