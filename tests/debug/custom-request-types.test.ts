/**
 * @file Custom Request Type Guards Tests
 * @description Tests for DAP custom request type guards and extractors
 */

import { describe, it, expect } from 'vitest';
import {
  isTerminalInputPayload,
  extractTerminalText,
  isKeyPressPayload,
  extractKeyCode,
  isSpeedChangePayload,
  extractSpeedMode,
  isSerialInputPayload,
  extractSerialText,
  isMemoryViewRequest,
  extractMemorySnapshotPayload,
  extractViewEntry,
} from '../../src/debug/types';

describe('Terminal Input Payload', () => {
  describe('isTerminalInputPayload', () => {
    it('should return true for valid payload', () => {
      expect(isTerminalInputPayload({ text: 'hello' })).toBe(true);
    });

    it('should return true for payload with empty text', () => {
      expect(isTerminalInputPayload({ text: '' })).toBe(true);
    });

    it('should return false for null', () => {
      expect(isTerminalInputPayload(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isTerminalInputPayload(undefined)).toBe(false);
    });

    it('should return false for missing text property', () => {
      expect(isTerminalInputPayload({})).toBe(false);
    });
  });

  describe('extractTerminalText', () => {
    it('should extract text from valid payload', () => {
      expect(extractTerminalText({ text: 'hello' })).toBe('hello');
    });

    it('should return empty string for non-string text', () => {
      expect(extractTerminalText({ text: 123 })).toBe('');
    });

    it('should return empty string for null', () => {
      expect(extractTerminalText(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(extractTerminalText(undefined)).toBe('');
    });

    it('should return empty string for missing text', () => {
      expect(extractTerminalText({})).toBe('');
    });
  });
});

describe('Key Press Payload', () => {
  describe('isKeyPressPayload', () => {
    it('should return true for valid payload', () => {
      expect(isKeyPressPayload({ code: 42 })).toBe(true);
    });

    it('should return true for code 0', () => {
      expect(isKeyPressPayload({ code: 0 })).toBe(true);
    });

    it('should return false for string code', () => {
      expect(isKeyPressPayload({ code: '42' })).toBe(false);
    });

    it('should return false for null', () => {
      expect(isKeyPressPayload(null)).toBe(false);
    });

    it('should return false for missing code', () => {
      expect(isKeyPressPayload({})).toBe(false);
    });
  });

  describe('extractKeyCode', () => {
    it('should extract code from valid payload', () => {
      expect(extractKeyCode({ code: 42 })).toBe(42);
    });

    it('should extract code 0', () => {
      expect(extractKeyCode({ code: 0 })).toBe(0);
    });

    it('should return undefined for string code', () => {
      expect(extractKeyCode({ code: '42' })).toBeUndefined();
    });

    it('should return undefined for NaN', () => {
      expect(extractKeyCode({ code: NaN })).toBeUndefined();
    });

    it('should return undefined for Infinity', () => {
      expect(extractKeyCode({ code: Infinity })).toBeUndefined();
    });

    it('should return undefined for null', () => {
      expect(extractKeyCode(null)).toBeUndefined();
    });

    it('should return undefined for missing code', () => {
      expect(extractKeyCode({})).toBeUndefined();
    });
  });
});

describe('Speed Change Payload', () => {
  describe('isSpeedChangePayload', () => {
    it('should return true for slow mode', () => {
      expect(isSpeedChangePayload({ mode: 'slow' })).toBe(true);
    });

    it('should return true for fast mode', () => {
      expect(isSpeedChangePayload({ mode: 'fast' })).toBe(true);
    });

    it('should return false for invalid mode', () => {
      expect(isSpeedChangePayload({ mode: 'medium' })).toBe(false);
    });

    it('should return false for null', () => {
      expect(isSpeedChangePayload(null)).toBe(false);
    });

    it('should return false for missing mode', () => {
      expect(isSpeedChangePayload({})).toBe(false);
    });
  });

  describe('extractSpeedMode', () => {
    it('should extract slow mode', () => {
      expect(extractSpeedMode({ mode: 'slow' })).toBe('slow');
    });

    it('should extract fast mode', () => {
      expect(extractSpeedMode({ mode: 'fast' })).toBe('fast');
    });

    it('should return undefined for invalid mode', () => {
      expect(extractSpeedMode({ mode: 'medium' })).toBeUndefined();
    });

    it('should return undefined for null', () => {
      expect(extractSpeedMode(null)).toBeUndefined();
    });

    it('should return undefined for missing mode', () => {
      expect(extractSpeedMode({})).toBeUndefined();
    });
  });
});

describe('Serial Input Payload', () => {
  describe('isSerialInputPayload', () => {
    it('should return true for valid payload', () => {
      expect(isSerialInputPayload({ text: 'data' })).toBe(true);
    });

    it('should return false for null', () => {
      expect(isSerialInputPayload(null)).toBe(false);
    });
  });

  describe('extractSerialText', () => {
    it('should extract text from valid payload', () => {
      expect(extractSerialText({ text: 'serial data' })).toBe('serial data');
    });

    it('should return empty string for invalid payload', () => {
      expect(extractSerialText(null)).toBe('');
    });
  });
});

describe('Memory View Request', () => {
  describe('isMemoryViewRequest', () => {
    it('should return true for object', () => {
      expect(isMemoryViewRequest({ id: 'view1' })).toBe(true);
    });

    it('should return true for empty object', () => {
      expect(isMemoryViewRequest({})).toBe(true);
    });

    it('should return false for null', () => {
      expect(isMemoryViewRequest(null)).toBe(false);
    });

    it('should return false for primitive', () => {
      expect(isMemoryViewRequest('string')).toBe(false);
    });
  });
});

describe('Memory Snapshot Payload', () => {
  describe('extractMemorySnapshotPayload', () => {
    it('should extract all fields', () => {
      const payload = {
        before: 32,
        rowSize: 8,
        views: [{ id: 'v1', view: 'hl' }],
      };
      const result = extractMemorySnapshotPayload(payload);
      expect(result.before).toBe(32);
      expect(result.rowSize).toBe(8);
      expect(result.views).toHaveLength(1);
    });

    it('should accept rowSize 16', () => {
      const result = extractMemorySnapshotPayload({ rowSize: 16 });
      expect(result.rowSize).toBe(16);
    });

    it('should reject invalid rowSize', () => {
      const result = extractMemorySnapshotPayload({ rowSize: 32 });
      expect(result.rowSize).toBeUndefined();
    });

    it('should return empty object for null', () => {
      const result = extractMemorySnapshotPayload(null);
      expect(result).toEqual({});
    });

    it('should return empty object for primitive', () => {
      const result = extractMemorySnapshotPayload('invalid');
      expect(result).toEqual({});
    });

    it('should filter non-object views', () => {
      const result = extractMemorySnapshotPayload({
        views: [{ id: 'v1' }, 'invalid', null, { id: 'v2' }],
      });
      expect(result.views).toHaveLength(2);
    });
  });
});

describe('extractViewEntry', () => {
  const mockClamp = (val: unknown, defaultVal: number): number => {
    return typeof val === 'number' ? Math.min(Math.max(val, 0), 256) : defaultVal;
  };

  it('should extract all fields from complete entry', () => {
    const entry = { id: 'myView', view: 'pc', after: 32, address: 0x1000 };
    const result = extractViewEntry(entry, mockClamp);
    expect(result.id).toBe('myView');
    expect(result.view).toBe('pc');
    expect(result.after).toBe(32);
    expect(result.address).toBe(0x1000);
  });

  it('should provide defaults for missing fields', () => {
    const result = extractViewEntry({}, mockClamp);
    expect(result.id).toBe('view');
    expect(result.view).toBe('hl');
    expect(result.after).toBe(16);
    expect(result.address).toBeNull();
  });

  it('should mask address to 16 bits', () => {
    const entry = { address: 0x12345 };
    const result = extractViewEntry(entry, mockClamp);
    expect(result.address).toBe(0x2345);
  });

  it('should handle non-string id', () => {
    const entry = { id: 123 };
    const result = extractViewEntry(entry as unknown as { id?: string }, mockClamp);
    expect(result.id).toBe('view');
  });

  it('should handle non-string view', () => {
    const entry = { view: 456 };
    const result = extractViewEntry(entry as unknown as { view?: string }, mockClamp);
    expect(result.view).toBe('hl');
  });

  it('should use clamp function for after value', () => {
    const customClamp = (): number => 42;
    const result = extractViewEntry({ after: 100 }, customClamp);
    expect(result.after).toBe(42);
  });

  it('should return null address for non-finite values', () => {
    expect(extractViewEntry({ address: NaN }, mockClamp).address).toBeNull();
    expect(extractViewEntry({ address: Infinity }, mockClamp).address).toBeNull();
    expect(extractViewEntry({ address: 'str' as unknown as number }, mockClamp).address).toBeNull();
  });
});
