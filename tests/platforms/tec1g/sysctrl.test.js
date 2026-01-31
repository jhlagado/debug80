"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const sysctrl_1 = require("../src/platforms/tec1g/sysctrl");
(0, vitest_1.describe)('decodeSysCtrl', () => {
    (0, vitest_1.it)('enables shadow when bit 0 is clear', () => {
        (0, vitest_1.expect)((0, sysctrl_1.decodeSysCtrl)(0x00).shadowEnabled).toBe(true);
        (0, vitest_1.expect)((0, sysctrl_1.decodeSysCtrl)(0x01).shadowEnabled).toBe(false);
    });
    (0, vitest_1.it)('decodes protect and expand bits', () => {
        const state = (0, sysctrl_1.decodeSysCtrl)(0x06);
        (0, vitest_1.expect)(state.protectEnabled).toBe(true);
        (0, vitest_1.expect)(state.expandEnabled).toBe(true);
    });
    (0, vitest_1.it)('ignores bits outside the low three', () => {
        const state = (0, sysctrl_1.decodeSysCtrl)(0xff);
        (0, vitest_1.expect)(state.shadowEnabled).toBe(false);
        (0, vitest_1.expect)(state.protectEnabled).toBe(true);
        (0, vitest_1.expect)(state.expandEnabled).toBe(true);
    });
});
//# sourceMappingURL=sysctrl.test.js.map