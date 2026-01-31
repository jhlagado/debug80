"use strict";
/**
 * @file Custom Request Type Guards Tests
 * @description Tests for DAP custom request type guards and extractors
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const types_1 = require("../src/debug/types");
(0, vitest_1.describe)('Terminal Input Payload', () => {
    (0, vitest_1.describe)('isTerminalInputPayload', () => {
        (0, vitest_1.it)('should return true for valid payload', () => {
            (0, vitest_1.expect)((0, types_1.isTerminalInputPayload)({ text: 'hello' })).toBe(true);
        });
        (0, vitest_1.it)('should return true for payload with empty text', () => {
            (0, vitest_1.expect)((0, types_1.isTerminalInputPayload)({ text: '' })).toBe(true);
        });
        (0, vitest_1.it)('should return false for null', () => {
            (0, vitest_1.expect)((0, types_1.isTerminalInputPayload)(null)).toBe(false);
        });
        (0, vitest_1.it)('should return false for undefined', () => {
            (0, vitest_1.expect)((0, types_1.isTerminalInputPayload)(undefined)).toBe(false);
        });
        (0, vitest_1.it)('should return false for missing text property', () => {
            (0, vitest_1.expect)((0, types_1.isTerminalInputPayload)({})).toBe(false);
        });
    });
    (0, vitest_1.describe)('extractTerminalText', () => {
        (0, vitest_1.it)('should extract text from valid payload', () => {
            (0, vitest_1.expect)((0, types_1.extractTerminalText)({ text: 'hello' })).toBe('hello');
        });
        (0, vitest_1.it)('should return empty string for non-string text', () => {
            (0, vitest_1.expect)((0, types_1.extractTerminalText)({ text: 123 })).toBe('');
        });
        (0, vitest_1.it)('should return empty string for null', () => {
            (0, vitest_1.expect)((0, types_1.extractTerminalText)(null)).toBe('');
        });
        (0, vitest_1.it)('should return empty string for undefined', () => {
            (0, vitest_1.expect)((0, types_1.extractTerminalText)(undefined)).toBe('');
        });
        (0, vitest_1.it)('should return empty string for missing text', () => {
            (0, vitest_1.expect)((0, types_1.extractTerminalText)({})).toBe('');
        });
    });
});
(0, vitest_1.describe)('Key Press Payload', () => {
    (0, vitest_1.describe)('isKeyPressPayload', () => {
        (0, vitest_1.it)('should return true for valid payload', () => {
            (0, vitest_1.expect)((0, types_1.isKeyPressPayload)({ code: 42 })).toBe(true);
        });
        (0, vitest_1.it)('should return true for code 0', () => {
            (0, vitest_1.expect)((0, types_1.isKeyPressPayload)({ code: 0 })).toBe(true);
        });
        (0, vitest_1.it)('should return false for string code', () => {
            (0, vitest_1.expect)((0, types_1.isKeyPressPayload)({ code: '42' })).toBe(false);
        });
        (0, vitest_1.it)('should return false for null', () => {
            (0, vitest_1.expect)((0, types_1.isKeyPressPayload)(null)).toBe(false);
        });
        (0, vitest_1.it)('should return false for missing code', () => {
            (0, vitest_1.expect)((0, types_1.isKeyPressPayload)({})).toBe(false);
        });
    });
    (0, vitest_1.describe)('extractKeyCode', () => {
        (0, vitest_1.it)('should extract code from valid payload', () => {
            (0, vitest_1.expect)((0, types_1.extractKeyCode)({ code: 42 })).toBe(42);
        });
        (0, vitest_1.it)('should extract code 0', () => {
            (0, vitest_1.expect)((0, types_1.extractKeyCode)({ code: 0 })).toBe(0);
        });
        (0, vitest_1.it)('should return undefined for string code', () => {
            (0, vitest_1.expect)((0, types_1.extractKeyCode)({ code: '42' })).toBeUndefined();
        });
        (0, vitest_1.it)('should return undefined for NaN', () => {
            (0, vitest_1.expect)((0, types_1.extractKeyCode)({ code: NaN })).toBeUndefined();
        });
        (0, vitest_1.it)('should return undefined for Infinity', () => {
            (0, vitest_1.expect)((0, types_1.extractKeyCode)({ code: Infinity })).toBeUndefined();
        });
        (0, vitest_1.it)('should return undefined for null', () => {
            (0, vitest_1.expect)((0, types_1.extractKeyCode)(null)).toBeUndefined();
        });
        (0, vitest_1.it)('should return undefined for missing code', () => {
            (0, vitest_1.expect)((0, types_1.extractKeyCode)({})).toBeUndefined();
        });
    });
});
(0, vitest_1.describe)('Speed Change Payload', () => {
    (0, vitest_1.describe)('isSpeedChangePayload', () => {
        (0, vitest_1.it)('should return true for slow mode', () => {
            (0, vitest_1.expect)((0, types_1.isSpeedChangePayload)({ mode: 'slow' })).toBe(true);
        });
        (0, vitest_1.it)('should return true for fast mode', () => {
            (0, vitest_1.expect)((0, types_1.isSpeedChangePayload)({ mode: 'fast' })).toBe(true);
        });
        (0, vitest_1.it)('should return false for invalid mode', () => {
            (0, vitest_1.expect)((0, types_1.isSpeedChangePayload)({ mode: 'medium' })).toBe(false);
        });
        (0, vitest_1.it)('should return false for null', () => {
            (0, vitest_1.expect)((0, types_1.isSpeedChangePayload)(null)).toBe(false);
        });
        (0, vitest_1.it)('should return false for missing mode', () => {
            (0, vitest_1.expect)((0, types_1.isSpeedChangePayload)({})).toBe(false);
        });
    });
    (0, vitest_1.describe)('extractSpeedMode', () => {
        (0, vitest_1.it)('should extract slow mode', () => {
            (0, vitest_1.expect)((0, types_1.extractSpeedMode)({ mode: 'slow' })).toBe('slow');
        });
        (0, vitest_1.it)('should extract fast mode', () => {
            (0, vitest_1.expect)((0, types_1.extractSpeedMode)({ mode: 'fast' })).toBe('fast');
        });
        (0, vitest_1.it)('should return undefined for invalid mode', () => {
            (0, vitest_1.expect)((0, types_1.extractSpeedMode)({ mode: 'medium' })).toBeUndefined();
        });
        (0, vitest_1.it)('should return undefined for null', () => {
            (0, vitest_1.expect)((0, types_1.extractSpeedMode)(null)).toBeUndefined();
        });
        (0, vitest_1.it)('should return undefined for missing mode', () => {
            (0, vitest_1.expect)((0, types_1.extractSpeedMode)({})).toBeUndefined();
        });
    });
});
(0, vitest_1.describe)('Serial Input Payload', () => {
    (0, vitest_1.describe)('isSerialInputPayload', () => {
        (0, vitest_1.it)('should return true for valid payload', () => {
            (0, vitest_1.expect)((0, types_1.isSerialInputPayload)({ text: 'data' })).toBe(true);
        });
        (0, vitest_1.it)('should return false for null', () => {
            (0, vitest_1.expect)((0, types_1.isSerialInputPayload)(null)).toBe(false);
        });
    });
    (0, vitest_1.describe)('extractSerialText', () => {
        (0, vitest_1.it)('should extract text from valid payload', () => {
            (0, vitest_1.expect)((0, types_1.extractSerialText)({ text: 'serial data' })).toBe('serial data');
        });
        (0, vitest_1.it)('should return empty string for invalid payload', () => {
            (0, vitest_1.expect)((0, types_1.extractSerialText)(null)).toBe('');
        });
    });
});
(0, vitest_1.describe)('Memory View Request', () => {
    (0, vitest_1.describe)('isMemoryViewRequest', () => {
        (0, vitest_1.it)('should return true for object', () => {
            (0, vitest_1.expect)((0, types_1.isMemoryViewRequest)({ id: 'view1' })).toBe(true);
        });
        (0, vitest_1.it)('should return true for empty object', () => {
            (0, vitest_1.expect)((0, types_1.isMemoryViewRequest)({})).toBe(true);
        });
        (0, vitest_1.it)('should return false for null', () => {
            (0, vitest_1.expect)((0, types_1.isMemoryViewRequest)(null)).toBe(false);
        });
        (0, vitest_1.it)('should return false for primitive', () => {
            (0, vitest_1.expect)((0, types_1.isMemoryViewRequest)('string')).toBe(false);
        });
    });
});
(0, vitest_1.describe)('Memory Snapshot Payload', () => {
    (0, vitest_1.describe)('extractMemorySnapshotPayload', () => {
        (0, vitest_1.it)('should extract all fields', () => {
            const payload = {
                before: 32,
                rowSize: 8,
                views: [{ id: 'v1', view: 'hl' }],
            };
            const result = (0, types_1.extractMemorySnapshotPayload)(payload);
            (0, vitest_1.expect)(result.before).toBe(32);
            (0, vitest_1.expect)(result.rowSize).toBe(8);
            (0, vitest_1.expect)(result.views).toHaveLength(1);
        });
        (0, vitest_1.it)('should accept rowSize 16', () => {
            const result = (0, types_1.extractMemorySnapshotPayload)({ rowSize: 16 });
            (0, vitest_1.expect)(result.rowSize).toBe(16);
        });
        (0, vitest_1.it)('should reject invalid rowSize', () => {
            const result = (0, types_1.extractMemorySnapshotPayload)({ rowSize: 32 });
            (0, vitest_1.expect)(result.rowSize).toBeUndefined();
        });
        (0, vitest_1.it)('should return empty object for null', () => {
            const result = (0, types_1.extractMemorySnapshotPayload)(null);
            (0, vitest_1.expect)(result).toEqual({});
        });
        (0, vitest_1.it)('should return empty object for primitive', () => {
            const result = (0, types_1.extractMemorySnapshotPayload)('invalid');
            (0, vitest_1.expect)(result).toEqual({});
        });
        (0, vitest_1.it)('should filter non-object views', () => {
            const result = (0, types_1.extractMemorySnapshotPayload)({
                views: [{ id: 'v1' }, 'invalid', null, { id: 'v2' }],
            });
            (0, vitest_1.expect)(result.views).toHaveLength(2);
        });
    });
});
(0, vitest_1.describe)('extractViewEntry', () => {
    const mockClamp = (val, defaultVal) => {
        return typeof val === 'number' ? Math.min(Math.max(val, 0), 256) : defaultVal;
    };
    (0, vitest_1.it)('should extract all fields from complete entry', () => {
        const entry = { id: 'myView', view: 'pc', after: 32, address: 0x1000 };
        const result = (0, types_1.extractViewEntry)(entry, mockClamp);
        (0, vitest_1.expect)(result.id).toBe('myView');
        (0, vitest_1.expect)(result.view).toBe('pc');
        (0, vitest_1.expect)(result.after).toBe(32);
        (0, vitest_1.expect)(result.address).toBe(0x1000);
    });
    (0, vitest_1.it)('should provide defaults for missing fields', () => {
        const result = (0, types_1.extractViewEntry)({}, mockClamp);
        (0, vitest_1.expect)(result.id).toBe('view');
        (0, vitest_1.expect)(result.view).toBe('hl');
        (0, vitest_1.expect)(result.after).toBe(16);
        (0, vitest_1.expect)(result.address).toBeNull();
    });
    (0, vitest_1.it)('should mask address to 16 bits', () => {
        const entry = { address: 0x12345 };
        const result = (0, types_1.extractViewEntry)(entry, mockClamp);
        (0, vitest_1.expect)(result.address).toBe(0x2345);
    });
    (0, vitest_1.it)('should handle non-string id', () => {
        const entry = { id: 123 };
        const result = (0, types_1.extractViewEntry)(entry, mockClamp);
        (0, vitest_1.expect)(result.id).toBe('view');
    });
    (0, vitest_1.it)('should handle non-string view', () => {
        const entry = { view: 456 };
        const result = (0, types_1.extractViewEntry)(entry, mockClamp);
        (0, vitest_1.expect)(result.view).toBe('hl');
    });
    (0, vitest_1.it)('should use clamp function for after value', () => {
        const customClamp = () => 42;
        const result = (0, types_1.extractViewEntry)({ after: 100 }, customClamp);
        (0, vitest_1.expect)(result.after).toBe(42);
    });
    (0, vitest_1.it)('should return null address for non-finite values', () => {
        (0, vitest_1.expect)((0, types_1.extractViewEntry)({ address: NaN }, mockClamp).address).toBeNull();
        (0, vitest_1.expect)((0, types_1.extractViewEntry)({ address: Infinity }, mockClamp).address).toBeNull();
        (0, vitest_1.expect)((0, types_1.extractViewEntry)({ address: 'str' }, mockClamp).address).toBeNull();
    });
});
//# sourceMappingURL=custom-request-types.test.js.map