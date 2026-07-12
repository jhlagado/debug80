import { describe, expect, it, vi } from 'vitest';
import { handleJoystickRequest } from '../../src/debug/requests/tec1g-joystick-request';

describe('TEC-1G joystick request handling', () => {
  it('applies a masked joystick byte to the runtime', () => {
    const runtime = { setJoystickState: vi.fn() };

    expect(handleJoystickRequest(runtime, { mask: 0x141 })).toBeNull();

    expect(runtime.setJoystickState).toHaveBeenCalledWith(0x41);
  });

  it('rejects malformed joystick payloads', () => {
    const runtime = { setJoystickState: vi.fn() };

    expect(handleJoystickRequest(runtime, { mask: 'left' })).toBe(
      'Debug80: Missing TEC-1G joystick mask.'
    );
    expect(runtime.setJoystickState).not.toHaveBeenCalled();
  });

  it('reports when the TEC-1G runtime is not active', () => {
    expect(handleJoystickRequest(undefined, { mask: 0x01 })).toBe(
      'Debug80: TEC-1G platform not active.'
    );
  });
});
