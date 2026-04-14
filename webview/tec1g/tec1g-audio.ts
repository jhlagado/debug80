/**
 * @file Speaker UI and Web Audio wiring for the TEC-1G webview.
 */

import type { Tec1gUpdatePayload } from './entry-types';

type AudioContextCtor = typeof AudioContext;

/**
 * Square-wave preview of the emulated speaker frequency (optional mute).
 */
export function createTec1gAudio(options: {
  muteEl: HTMLElement;
  speakerEl: HTMLElement;
  speakerLabel: HTMLElement | null;
}): {
  applySpeakerFromUpdate: (data: Tec1gUpdatePayload) => void;
  applyMuteState: () => void;
  updateAudio: () => void;
  wireMuteClick: () => void;
} {
  const { muteEl, speakerEl, speakerLabel } = options;

  let muted = true;
  let lastSpeakerHz = 0;
  let audioCtx: AudioContext | null = null;
  let osc: OscillatorNode | null = null;
  let gain: GainNode | null = null;

  function ensureAudio(): void {
    if (!audioCtx) {
      const Ctx =
        window.AudioContext ?? (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
      if (!Ctx) {
        return;
      }
      audioCtx = new Ctx();
      osc = audioCtx.createOscillator();
      osc.type = 'square';
      gain = audioCtx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
    }
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }
  }

  function updateAudio(): void {
    if (!audioCtx || !osc || !gain || muted || lastSpeakerHz <= 0) {
      if (gain) {
        gain.gain.value = 0;
      }
      return;
    }
    osc.frequency.setValueAtTime(lastSpeakerHz, audioCtx.currentTime);
    gain.gain.setTargetAtTime(0.15, audioCtx.currentTime, 0.01);
  }

  function applyMuteState(): void {
    muteEl.textContent = muted ? 'MUTED' : 'SOUND';
    if (muted && gain) {
      gain.gain.value = 0;
    }
    updateAudio();
  }

  function applySpeakerFromUpdate(data: Tec1gUpdatePayload): void {
    if (data.speaker) {
      speakerEl.classList.add('on');
    } else {
      speakerEl.classList.remove('on');
    }
    if (speakerLabel) {
      if (typeof data.speakerHz === 'number' && data.speakerHz > 0) {
        speakerLabel.textContent = data.speakerHz + ' Hz';
        lastSpeakerHz = data.speakerHz;
      } else {
        speakerLabel.textContent = 'SPEAKER';
        lastSpeakerHz = 0;
      }
    }
    updateAudio();
  }

  function wireMuteClick(): void {
    muteEl.addEventListener('click', () => {
      muted = !muted;
      if (!muted) {
        ensureAudio();
      }
      applyMuteState();
    });
  }

  return {
    applySpeakerFromUpdate,
    applyMuteState,
    updateAudio,
    wireMuteClick,
  };
}
