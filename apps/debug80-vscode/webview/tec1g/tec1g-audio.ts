/**
 * @file Speaker UI and Web Audio wiring for the TEC-1G webview.
 */

import { createAudioCore, type AudioCore } from '../common/audio-core';
import type { VscodeApi } from '../common/vscode';
import type { Tec1gUpdatePayload } from './entry-types';

export function createTec1gAudio(options: {
  muteEl: HTMLElement;
  speakerEl: HTMLElement;
  speakerLabel: HTMLElement | null;
  vscode?: Pick<VscodeApi, 'getState' | 'setState'>;
  audioCore?: AudioCore;
}): {
  applySpeakerFromUpdate: (data: Tec1gUpdatePayload) => void;
  applyMuteState: () => void;
  unlockAudio: () => void;
  updateAudio: () => void;
  wireMuteClick: () => void;
} {
  const { muteEl, speakerEl, speakerLabel } = options;

  let muted = true;
  let lastSpeakerHz = 0;
  const core = options.audioCore ?? createAudioCore();

  function updateAudio(): void {
    core.updateAudio(muted, lastSpeakerHz);
  }

  function applyMuteState(): void {
    muteEl.textContent = muted ? 'MUTED' : 'SOUND';
    if (!muted) {
      core.ensureAudio();
    }
    updateAudio();
  }

  function unlockAudio(): void {
    if (!muted) {
      core.unlockAudio();
      updateAudio();
    }
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
      applyMuteState();
    });
  }

  return { applySpeakerFromUpdate, applyMuteState, unlockAudio, updateAudio, wireMuteClick };
}
