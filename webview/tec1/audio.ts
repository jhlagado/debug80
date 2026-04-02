type AudioContextCtor = typeof AudioContext;

export interface Tec1AudioController {
  applyMuteState(): void;
  setSpeakerHz(hz: number): void;
  toggleMute(): void;
  updateAudio(): void;
}

export function createAudioController(muteEl: HTMLElement | null): Tec1AudioController {
  let muted = true;
  let speakerHz = 0;
  let audioCtx: AudioContext | null = null;
  let osc: OscillatorNode | null = null;
  let gain: GainNode | null = null;

  const ensureAudio = (): void => {
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
  };

  const updateAudio = (): void => {
    if (!audioCtx || !osc || !gain || muted || speakerHz <= 0) {
      if (gain) {
        gain.gain.value = 0;
      }
      return;
    }
    osc.frequency.setValueAtTime(speakerHz, audioCtx.currentTime);
    gain.gain.setTargetAtTime(0.15, audioCtx.currentTime, 0.01);
  };

  const applyMuteState = (): void => {
    if (muteEl) {
      muteEl.textContent = muted ? 'MUTED' : 'SOUND';
    }
    if (muted && gain) {
      gain.gain.value = 0;
    }
    updateAudio();
  };

  return {
    applyMuteState,
    setSpeakerHz(hz: number): void {
      speakerHz = hz;
    },
    toggleMute(): void {
      muted = !muted;
      if (!muted) {
        ensureAudio();
      }
      applyMuteState();
    },
    updateAudio,
  };
}
