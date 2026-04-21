import { createAudioCore } from '../common/audio-core';

export interface Tec1AudioController {
  applyMuteState(): void;
  setSpeakerHz(hz: number): void;
  toggleMute(): void;
  updateAudio(): void;
}

export function createAudioController(muteEl: HTMLElement | null): Tec1AudioController {
  let muted = true;
  let speakerHz = 0;
  const core = createAudioCore();

  const updateAudio = (): void => {
    core.updateAudio(muted, speakerHz);
  };

  const applyMuteState = (): void => {
    if (muteEl) {
      muteEl.textContent = muted ? 'MUTED' : 'SOUND';
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
        core.ensureAudio();
      }
      applyMuteState();
    },
    updateAudio,
  };
}
