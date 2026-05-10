import { createAudioCore, type AudioCore } from '../common/audio-core';
import { readAudioMuted, writeAudioMuted } from '../common/audio-mute-state';
import type { VscodeApi } from '../common/vscode';

export interface Tec1AudioController {
  applyMuteState(): void;
  setSpeakerHz(hz: number): void;
  toggleMute(): void;
  updateAudio(): void;
}

export function createAudioController(
  muteEl: HTMLElement | null,
  vscode?: Pick<VscodeApi, 'getState' | 'setState'>,
  audioCore?: AudioCore
): Tec1AudioController {
  let muted = readAudioMuted(vscode, 'tec1');
  let speakerHz = 0;
  const core = audioCore ?? createAudioCore();

  const updateAudio = (): void => {
    core.updateAudio(muted, speakerHz);
  };

  const applyMuteState = (): void => {
    if (muteEl) {
      muteEl.textContent = muted ? 'MUTED' : 'SOUND';
    }
    if (!muted) {
      core.ensureAudio();
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
      writeAudioMuted(vscode, 'tec1', muted);
      if (!muted) {
        core.ensureAudio();
      }
      applyMuteState();
    },
    updateAudio,
  };
}
