/**
 * @file Regression tests: TEC speaker mute state is session-local.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudioController } from '../../webview/tec1/audio';
import { createTec1gAudio } from '../../webview/tec1g/tec1g-audio';
import type { AudioCore } from '../../webview/common/audio-core';

function createAudioCoreMock(): AudioCore & {
  ensureAudio: ReturnType<typeof vi.fn>;
  unlockAudio: ReturnType<typeof vi.fn>;
  updateAudio: ReturnType<typeof vi.fn>;
} {
  return {
    ensureAudio: vi.fn(),
    unlockAudio: vi.fn(),
    updateAudio: vi.fn(),
  };
}

describe('webview audio mute state', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('defaults TEC-1 audio to muted', () => {
    const muteEl = document.createElement('div');
    const audio = createAudioController(muteEl);
    audio.applyMuteState();

    expect(muteEl.textContent).toBe('MUTED');
  });

  it('does not persist TEC-1 unmuted state after a simulated reload', () => {
    const firstMuteEl = document.createElement('div');
    const firstAudio = createAudioController(firstMuteEl);

    firstAudio.toggleMute();

    const reloadedMuteEl = document.createElement('div');
    const reloadedAudio = createAudioController(reloadedMuteEl);
    reloadedAudio.applyMuteState();

    expect(firstMuteEl.textContent).toBe('SOUND');
    expect(reloadedMuteEl.textContent).toBe('MUTED');
  });

  it('enables TEC-1 audio core when unmuted in the current session', () => {
    const muteEl = document.createElement('div');
    const audioCore = createAudioCoreMock();
    const audio = createAudioController(muteEl, undefined, audioCore);

    audio.toggleMute();

    expect(muteEl.textContent).toBe('SOUND');
    expect(audioCore.ensureAudio).toHaveBeenCalledTimes(1);
    expect(audioCore.updateAudio).toHaveBeenCalledWith(false, 0);
  });

  it('unlocks TEC-1 audio on later user gesture when unmuted in the current session', () => {
    const audioCore = createAudioCoreMock();
    const audio = createAudioController(document.createElement('div'), undefined, audioCore);

    audio.toggleMute();

    audio.unlockAudio();

    expect(audioCore.unlockAudio).toHaveBeenCalledTimes(1);
    expect(audioCore.updateAudio).toHaveBeenCalledWith(false, 0);
  });

  it('does not persist TEC-1G mute toggles through webview reloads', () => {
    const muteEl = document.createElement('div');
    const speakerEl = document.createElement('div');
    const speakerLabel = document.createElement('div');

    const audio = createTec1gAudio({ muteEl, speakerEl, speakerLabel });
    audio.wireMuteClick();
    audio.applyMuteState();

    expect(muteEl.textContent).toBe('MUTED');

    muteEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(muteEl.textContent).toBe('SOUND');

    const reloadedMuteEl = document.createElement('div');
    const reloadedAudio = createTec1gAudio({
      muteEl: reloadedMuteEl,
      speakerEl,
      speakerLabel,
    });
    reloadedAudio.applyMuteState();

    expect(reloadedMuteEl.textContent).toBe('MUTED');
  });

  it('enables TEC-1G audio core when unmuted in the current session', () => {
    const muteEl = document.createElement('div');
    const speakerEl = document.createElement('div');
    const speakerLabel = document.createElement('div');
    const audioCore = createAudioCoreMock();
    const audio = createTec1gAudio({
      muteEl,
      speakerEl,
      speakerLabel,
      audioCore,
    });
    audio.wireMuteClick();

    muteEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(muteEl.textContent).toBe('SOUND');
    expect(audioCore.ensureAudio).toHaveBeenCalledTimes(1);
    expect(audioCore.updateAudio).toHaveBeenCalledWith(false, 0);
  });

  it('unlocks TEC-1G audio on later user gesture when unmuted in the current session', () => {
    const audioCore = createAudioCoreMock();
    const muteEl = document.createElement('div');
    const audio = createTec1gAudio({
      muteEl,
      speakerEl: document.createElement('div'),
      speakerLabel: document.createElement('div'),
      audioCore,
    });
    audio.wireMuteClick();

    muteEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    audio.unlockAudio();

    expect(audioCore.unlockAudio).toHaveBeenCalledTimes(1);
    expect(audioCore.updateAudio).toHaveBeenCalledWith(false, 0);
  });
});
