/**
 * @file Speaker UI and Web Audio wiring for the TEC-1G webview.
 */

import { createAudioCore } from '../common/audio-core';
import type { Tec1gUpdatePayload } from './entry-types';

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
  const core = createAudioCore();

  function updateAudio(): void {
    core.updateAudio(muted, lastSpeakerHz);
  }

  function applyMuteState(): void {
    muteEl.textContent = muted ? 'MUTED' : 'SOUND';
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
        core.ensureAudio();
      }
      applyMuteState();
    });
  }

  return { applySpeakerFromUpdate, applyMuteState, updateAudio, wireMuteClick };
}
