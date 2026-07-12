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
      applyMatrixScanCycles: vi.fn(),
      applyCapsLock: vi.fn(),
      applyKeyboardCapture: vi.fn(),
      handleKeyEvent: vi.fn(),
      init: vi.fn(),
    },
    glcdRenderer: { applyGlcdUpdate: vi.fn() },
    tms9918Renderer: { applyTms9918Update: vi.fn() },
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
      matrix: [0x80],
    });

    expect(deps.display.applyDigits).not.toHaveBeenCalled();
    expect(deps.matrixUi.applyMatrixRows).toHaveBeenCalledWith([0x80]);
  });

  it('applies digits when present in the update payload', () => {
    const deps = makeDeps();

    applyTec1gPlatformUpdate(deps, {
      digits: [1, 2, 3, 4, 5, 6],
    });

    expect(deps.display.applyDigits).toHaveBeenCalledWith([1, 2, 3, 4, 5, 6]);
  });

  it('passes matrix scan-cycle batches to the scan player', () => {
    const deps = makeDeps();
    const scanCycles = [
      {
        id: 1,
        startCycle: 10,
        endCycle: 90,
        rows: Array.from({ length: 8 }, (_, row) => ({
          row,
          red: row === 0 ? 0xff : 0,
          green: row === 1 ? 0xff : 0,
          blue: row === 2 ? 0xff : 0,
          dwellCycles: 10,
        })),
      },
    ];

    applyTec1gPlatformUpdate(deps, {
      matrixScanCycles: scanCycles,
      matrixDroppedScanCycles: 2,
      matrixClockHz: 4_000_000,
    });

    expect(deps.matrixUi.applyMatrixScanCycles).toHaveBeenCalledWith(scanCycles, 2, 4_000_000);
  });

  it('does not use MON-3 matrix mode updates as keyboard capture state', () => {
    const deps = makeDeps();

    applyTec1gPlatformUpdate(deps, {
      matrixMode: true,
    });

    expect(deps.matrixUi.applyKeyboardCapture).not.toHaveBeenCalled();
  });

  it('does not let platform caps state override local matrix keyboard caps state', () => {
    const deps = makeDeps();

    applyTec1gPlatformUpdate(deps, {
      capsLock: false,
    });

    expect(deps.matrixUi.applyCapsLock).not.toHaveBeenCalled();
  });

  it('applies TMS9918 video updates when present', () => {
    const deps = makeDeps();

    applyTec1gPlatformUpdate(deps, {
      tms9918: {
        active: true,
        videoStandard: 'pal',
        status: 0x80,
        registers: [0, 0xc2],
        framebuffer: [0xffffff],
      },
    });

    expect(deps.tms9918Renderer.applyTms9918Update).toHaveBeenCalledWith({
      tms9918: {
        active: true,
        videoStandard: 'pal',
        status: 0x80,
        registers: [0, 0xc2],
        framebuffer: [0xffffff],
      },
    });
  });
});
