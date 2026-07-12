/**
 * @fileoverview TEC-1G joystick custom request handling.
 */

export type JoystickRuntime = {
  setJoystickState: (mask: number) => void;
};

function parseJoystickMask(args: unknown): number | null {
  if (typeof args !== 'object' || args === null) {
    return null;
  }
  const mask = (args as { mask?: unknown }).mask;
  if (typeof mask !== 'number' || !Number.isFinite(mask)) {
    return null;
  }
  return mask & 0xff;
}

export function handleJoystickRequest(
  runtime: JoystickRuntime | undefined,
  args: unknown
): string | null {
  const mask = parseJoystickMask(args);
  if (mask === null) {
    return 'Debug80: Missing TEC-1G joystick mask.';
  }
  if (runtime === undefined) {
    return 'Debug80: TEC-1G platform not active.';
  }
  runtime.setJoystickState(mask);
  return null;
}
