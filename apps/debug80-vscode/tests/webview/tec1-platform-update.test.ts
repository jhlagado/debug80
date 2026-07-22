import { describe, expect, it, vi } from 'vitest';
import { applyTec1PlatformUpdate } from '../../webview/tec1/platform-update';

function createHarness() {
  const speakerEl = document.createElement('div');
  const speakerHzEl = document.createElement('span');
  const segmentPlayer = {
    enqueue: vi.fn(),
    renderStatic: vi.fn(),
    stop: vi.fn(),
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
    segmentPlayer,
    lcdRenderer,
    matrixRenderer,
    speakerEl,
    speakerHzEl,
    applyUpdate: (payload: Parameters<typeof applyTec1PlatformUpdate>[0]) =>
      applyTec1PlatformUpdate(payload, {
        audio,
        applySpeed,
        segmentPlayer,
        lcdRenderer,
        matrixRenderer,
        speakerEl,
        speakerHzEl,
      }),
  };
}

describe('TEC-1 platform update application', () => {
  it('forwards scan playback and static display state', () => {
    const harness = createHarness();
    const scanCycles = [
      {
        id: 1,
        startCycle: 0,
        endCycle: 60,
        phases: [{ digitMask: 0x3f, segments: 0xef, dwellCycles: 60 }],
      },
    ];

    harness.applyUpdate({
      segmentIntensities: [0, 0.5, 1],
      digits: [1, 2, 3],
      segmentScanCycles: scanCycles,
      segmentDroppedScanCycles: 2,
      segmentClockHz: 4_000_000,
    });
    harness.applyUpdate({ digits: [4, 5, 6] });
    harness.applyUpdate({});

    expect(harness.segmentPlayer.enqueue).toHaveBeenCalledWith(scanCycles, 2, 4_000_000);
    expect(harness.segmentPlayer.renderStatic).toHaveBeenNthCalledWith(1, [1, 2, 3], [0, 0.5, 1]);
    expect(harness.segmentPlayer.renderStatic).toHaveBeenNthCalledWith(2, [4, 5, 6], undefined);
    expect(harness.segmentPlayer.renderStatic).toHaveBeenCalledTimes(2);
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

  it('stops buffered scan playback before applying an idle blank', () => {
    const harness = createHarness();
    const blank = new Array(48).fill(0);

    harness.applyUpdate({
      digits: [0x3f, 0x3f, 0x3f, 0x3f, 0x3f, 0x3f],
      segmentIntensities: blank,
      segmentScanStopped: true,
    });

    expect(harness.segmentPlayer.stop).toHaveBeenCalledOnce();
    expect(harness.segmentPlayer.renderStatic).toHaveBeenCalledWith(
      [0x3f, 0x3f, 0x3f, 0x3f, 0x3f, 0x3f],
      blank
    );
    expect(harness.segmentPlayer.enqueue).not.toHaveBeenCalled();
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
