export type PointerHoldController = {
  cancel: () => void;
};

export type PointerHoldOptions = {
  minimumHoldMs?: number;
  onPress: () => void;
  onRelease: () => void;
  onPointerDown?: () => void;
};

/**
 * Wires a single-owner pointer hold to an on-screen hardware control.
 *
 * A quick tap remains active for the configured minimum pulse, while a longer
 * press releases immediately. Re-pressing during a pending minimum pulse
 * continues the same logical hold instead of emitting a false release.
 */
export function wirePointerHold(
  element: HTMLElement,
  options: PointerHoldOptions
): PointerHoldController {
  const minimumHoldMs = Math.max(0, options.minimumHoldMs ?? 0);
  let activePointerId: number | null = null;
  let pressedAt = 0;
  let releaseTimer: number | null = null;
  let logicallyPressed = false;
  let pointerCaptured = false;

  function finishRelease(): void {
    if (!logicallyPressed) {
      return;
    }
    logicallyPressed = false;
    options.onRelease();
  }

  function clearReleaseTimer(): void {
    if (releaseTimer === null) {
      return;
    }
    window.clearTimeout(releaseTimer);
    releaseTimer = null;
  }

  function release(event: PointerEvent): void {
    if (activePointerId === null || event.pointerId !== activePointerId) {
      return;
    }
    const pointerId = activePointerId;
    activePointerId = null;
    pointerCaptured = false;
    try {
      element.releasePointerCapture(pointerId);
    } catch {
      /* Pointer capture is optional in the webview test environment. */
    }
    const wait = Math.max(0, minimumHoldMs - (Date.now() - pressedAt));
    if (wait === 0) {
      finishRelease();
      return;
    }
    clearReleaseTimer();
    releaseTimer = window.setTimeout(() => {
      releaseTimer = null;
      finishRelease();
    }, wait);
  }

  function onPointerDown(event: PointerEvent): void {
    event.preventDefault();
    options.onPointerDown?.();
    if (activePointerId !== null) {
      return;
    }
    clearReleaseTimer();
    activePointerId = event.pointerId;
    pressedAt = Date.now();
    try {
      element.setPointerCapture(event.pointerId);
      pointerCaptured = true;
    } catch {
      pointerCaptured = false;
    }
    if (!logicallyPressed) {
      logicallyPressed = true;
      options.onPress();
    }
  }

  function onPointerLeave(event: PointerEvent): void {
    if (!pointerCaptured) {
      release(event);
    }
  }

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
  element.addEventListener('lostpointercapture', release);
  element.addEventListener('pointerleave', onPointerLeave);

  return {
    cancel() {
      const pointerId = activePointerId;
      activePointerId = null;
      pointerCaptured = false;
      if (pointerId !== null) {
        try {
          element.releasePointerCapture(pointerId);
        } catch {
          /* Pointer capture may already have been released. */
        }
      }
      clearReleaseTimer();
      finishRelease();
    },
  };
}
