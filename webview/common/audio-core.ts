/**
 * Shared Web Audio synthesis core — square-wave oscillator with gain control.
 * Platform audio controllers wrap this to add mute state and UI wiring.
 */

type AudioContextCtor = typeof AudioContext;

export interface AudioCore {
  ensureAudio(): void;
  updateAudio(muted: boolean, hz: number): void;
}

export function createAudioCore(): AudioCore {
  let audioCtx: AudioContext | null = null;
  let osc: OscillatorNode | null = null;
  let gain: GainNode | null = null;

  function ensureAudio(): void {
    if (!audioCtx) {
      const Ctx =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
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

  function updateAudio(muted: boolean, hz: number): void {
    if (!audioCtx || !osc || !gain || muted || hz <= 0) {
      if (gain) {
        gain.gain.value = 0;
      }
      return;
    }
    osc.frequency.setValueAtTime(hz, audioCtx.currentTime);
    gain.gain.setTargetAtTime(0.15, audioCtx.currentTime, 0.01);
  }

  return { ensureAudio, updateAudio };
}
