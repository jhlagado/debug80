import { describe, expect, it, vi } from 'vitest';
import { applyTec1gPlatformUpdate } from '../../webview/tec1g/tec1g-platform-update';

function makeDeps() {
  return {
    display: { applyDigits: vi.fn() },
    audio: { applySpeakerFromUpdate: vi.fn() },
    applySpeed: vi.fn(),
    lcdRenderer: { applyLcdUpdate: vi.fn() },
    matrixUi: {
      applyMatrixRows: vi.fn(),
      applyMatrixGreenRows: vi.fn(),
      applyMatrixBlueRows: vi.fn(),
      applyMatrixBrightness: vi.fn(),
      applyCapsLock: vi.fn(),
      applyMatrixMode: vi.fn(),
      handleKeyEvent: vi.fn(),
      init: vi.fn(),
    },
    glcdRenderer: { applyGlcdUpdate: vi.fn() },
    keypad: {
      setSysCtrlValue: vi.fn(),
      updateSysCtrl: vi.fn(),
      updateStatusLeds: vi.fn(),
    },
  };
}

describe('tec1g platform update application', () => {
  it('preserves display digits when a partial update omits digits', () => {
    const deps = makeDeps();

    applyTec1gPlatformUpdate(deps, {
      matrixBrightness: [255],
    });

    expect(deps.display.applyDigits).not.toHaveBeenCalled();
    expect(deps.matrixUi.applyMatrixBrightness).toHaveBeenCalledWith([255], undefined, undefined);
  });

  it('applies digits when present in the update payload', () => {
    const deps = makeDeps();

    applyTec1gPlatformUpdate(deps, {
      digits: [1, 2, 3, 4, 5, 6],
    });

    expect(deps.display.applyDigits).toHaveBeenCalledWith([1, 2, 3, 4, 5, 6]);
  });

  it('applies partial brightness updates when only green or blue changes', () => {
    const deps = makeDeps();

    applyTec1gPlatformUpdate(deps, {
      matrixBrightnessG: [128],
    });

    expect(deps.matrixUi.applyMatrixBrightness).toHaveBeenCalledWith(undefined, [128], undefined);

    deps.matrixUi.applyMatrixBrightness.mockClear();

    applyTec1gPlatformUpdate(deps, {
      matrixBrightnessB: [64],
    });

    expect(deps.matrixUi.applyMatrixBrightness).toHaveBeenCalledWith(undefined, undefined, [64]);
  });
});
