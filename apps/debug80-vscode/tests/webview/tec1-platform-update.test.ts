import { describe, expect, it, vi } from 'vitest';
import { applyTec1PlatformUpdate } from '../../webview/tec1/platform-update';

function createHarness() {
  const speakerEl = document.createElement('div');
  const speakerHzEl = document.createElement('span');
  const display = {
    applyDigits: vi.fn(),
    applySegmentIntensities: vi.fn(),
  };
  const audio = {
    setSpeakerHz: vi.fn(),
    updateAudio: vi.fn(),
  };
  const lcdRenderer = {
    applyLcdUpdate: vi.fn(),
  };
  const matrixRenderer = {
    applyMatrixUpdate: vi.fn(),
  };
  const applySpeed = vi.fn();

  return {
    audio,
    applySpeed,
    display,
    lcdRenderer,
    matrixRenderer,
    speakerEl,
    speakerHzEl,
    applyUpdate: (payload: Parameters<typeof applyTec1PlatformUpdate>[0]) =>
      applyTec1PlatformUpdate(payload, {
        audio,
        applySpeed,
        display,
        lcdRenderer,
        matrixRenderer,
        speakerEl,
        speakerHzEl,
      }),
  };
}

describe('TEC-1 platform update application', () => {
  it('uses segment intensities when present, otherwise falls back to digits', () => {
    const harness = createHarness();

    harness.applyUpdate({ segmentIntensities: [0, 0.5, 1], digits: [1, 2, 3] });
    harness.applyUpdate({ digits: [4, 5, 6] });
    harness.applyUpdate({});

    expect(harness.display.applySegmentIntensities).toHaveBeenCalledWith([0, 0.5, 1]);
    expect(harness.display.applyDigits).toHaveBeenNthCalledWith(1, [4, 5, 6]);
    expect(harness.display.applyDigits).toHaveBeenNthCalledWith(2, []);
  });

  it('applies speaker state and speaker frequency to the UI and audio controller', () => {
    const harness = createHarness();

    harness.applyUpdate({ speaker: true, speakerHz: 440 });
    expect(harness.speakerEl.classList.contains('on')).toBe(true);
    expect(harness.speakerHzEl.textContent).toBe('440 Hz');
    expect(harness.audio.setSpeakerHz).toHaveBeenCalledWith(440);

    harness.applyUpdate({ speaker: false, speakerHz: 0 });
    expect(harness.speakerEl.classList.contains('on')).toBe(false);
    expect(harness.speakerHzEl.textContent).toBe('');
    expect(harness.audio.setSpeakerHz).toHaveBeenCalledWith(0);
    expect(harness.audio.updateAudio).toHaveBeenCalledTimes(2);
  });

  it('applies valid speed changes and forwards payloads to display renderers', () => {
    const harness = createHarness();
    const payload = { speedMode: 'slow', lcd: [1], matrix: [2] };

    harness.applyUpdate(payload);
    harness.applyUpdate({ speedMode: 'turbo' });

    expect(harness.applySpeed).toHaveBeenCalledTimes(1);
    expect(harness.applySpeed).toHaveBeenCalledWith('slow');
    expect(harness.lcdRenderer.applyLcdUpdate).toHaveBeenCalledWith(payload);
    expect(harness.matrixRenderer.applyMatrixUpdate).toHaveBeenCalledWith(payload);
  });
});
