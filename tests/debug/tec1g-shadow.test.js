"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const tec1g_shadow_1 = require("../src/debug/tec1g-shadow");
const makeMemory = () => new Uint8Array(0x10000);
(0, vitest_1.describe)('ensureTec1gShadowRom', () => {
    (0, vitest_1.it)('does nothing when ROM already covers 0xC000-0xC7FF', () => {
        const memory = makeMemory();
        memory[0x0000] = 0x11;
        memory[0xc000] = 0x22;
        const info = (0, tec1g_shadow_1.ensureTec1gShadowRom)(memory, [{ start: 0xc000, end: 0xc7ff }]);
        (0, vitest_1.expect)(info.shadowCopied).toBe(false);
        (0, vitest_1.expect)(memory[0x0000]).toBe(0x11);
        (0, vitest_1.expect)(memory[0xc000]).toBe(0x22);
    });
    (0, vitest_1.it)('copies low ROM into 0xC000-0xC7FF when only low ROM is present', () => {
        const memory = makeMemory();
        memory[0x0000] = 0xaa;
        memory[0x07ff] = 0xbb;
        memory[0xc000] = 0x00;
        const info = (0, tec1g_shadow_1.ensureTec1gShadowRom)(memory, [{ start: 0x0000, end: 0x07ff }]);
        (0, vitest_1.expect)(info.shadowCopied).toBe(true);
        (0, vitest_1.expect)(memory[0xc000]).toBe(0xaa);
        (0, vitest_1.expect)(memory[0xc7ff]).toBe(0xbb);
        (0, vitest_1.expect)(memory[0x0000]).toBe(0x00);
        (0, vitest_1.expect)(memory[0x07ff]).toBe(0x00);
    });
    (0, vitest_1.it)('does nothing when there is no low ROM', () => {
        const memory = makeMemory();
        memory[0x0000] = 0x12;
        memory[0xc000] = 0x34;
        const info = (0, tec1g_shadow_1.ensureTec1gShadowRom)(memory, [{ start: 0xd000, end: 0xd7ff }]);
        (0, vitest_1.expect)(info.shadowCopied).toBe(false);
        (0, vitest_1.expect)(memory[0x0000]).toBe(0x12);
        (0, vitest_1.expect)(memory[0xc000]).toBe(0x34);
    });
});
//# sourceMappingURL=tec1g-shadow.test.js.map