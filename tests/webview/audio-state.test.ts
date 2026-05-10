/**
 * @file Regression tests: TEC speaker mute state survives webview reloads.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudioController } from '../../webview/tec1/audio';
import { createTec1gAudio } from '../../webview/tec1g/tec1g-audio';
import type { VscodeApi } from '../../webview/common/vscode';
import type { AudioCore } from '../../webview/common/audio-core';

function createStatefulVscode(initialState: unknown = null): VscodeApi {
  let state = initialState;
  return {
    postMessage: vi.fn(),
    getState: () => state,
    setState: (nextState: unknown) => {
      state = nextState;
    },
  };
}

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
    const vscode = createStatefulVscode();

    const audio = createAudioController(muteEl, vscode);
    audio.applyMuteState();

    expect(muteEl.textContent).toBe('MUTED');
  });

  it('restores TEC-1 unmuted state after a simulated reload', () => {
    const vscode = createStatefulVscode();
    const firstMuteEl = document.createElement('div');
    const firstAudio = createAudioController(firstMuteEl, vscode);

    firstAudio.toggleMute();

    const reloadedMuteEl = document.createElement('div');
    const reloadedAudio = createAudioController(reloadedMuteEl, vscode);
    reloadedAudio.applyMuteState();

    expect(firstMuteEl.textContent).toBe('SOUND');
    expect(reloadedMuteEl.textContent).toBe('SOUND');
  });

  it('re-applies TEC-1 audio core when persisted state is unmuted', () => {
    const muteEl = document.createElement('div');
    const audioCore = createAudioCoreMock();
    const audio = createAudioController(
      muteEl,
      createStatefulVscode({ audioMute: { tec1: false } }),
      audioCore
    );

    audio.applyMuteState();

    expect(muteEl.textContent).toBe('SOUND');
    expect(audioCore.ensureAudio).toHaveBeenCalledTimes(1);
    expect(audioCore.updateAudio).toHaveBeenCalledWith(false, 0);
  });

  it('unlocks TEC-1 audio on later user gesture when persisted state is unmuted', () => {
    const audioCore = createAudioCoreMock();
    const audio = createAudioController(
      document.createElement('div'),
      createStatefulVscode({ audioMute: { tec1: false } }),
      audioCore
    );

    audio.unlockAudio();

    expect(audioCore.unlockAudio).toHaveBeenCalledTimes(1);
    expect(audioCore.updateAudio).toHaveBeenCalledWith(false, 0);
  });

  it('persists TEC-1G mute toggles through vscode state', () => {
    const vscode = createStatefulVscode();
    const muteEl = document.createElement('div');
    const speakerEl = document.createElement('div');
    const speakerLabel = document.createElement('div');

    const audio = createTec1gAudio({ muteEl, speakerEl, speakerLabel, vscode });
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
      vscode,
    });
    reloadedAudio.applyMuteState();

    expect(reloadedMuteEl.textContent).toBe('SOUND');
  });

  it('re-applies TEC-1G audio core when persisted state is unmuted', () => {
    const muteEl = document.createElement('div');
    const speakerEl = document.createElement('div');
    const speakerLabel = document.createElement('div');
    const audioCore = createAudioCoreMock();
    const audio = createTec1gAudio({
      muteEl,
      speakerEl,
      speakerLabel,
      vscode: createStatefulVscode({ audioMute: { tec1g: false } }),
      audioCore,
    });

    audio.applyMuteState();

    expect(muteEl.textContent).toBe('SOUND');
    expect(audioCore.ensureAudio).toHaveBeenCalledTimes(1);
    expect(audioCore.updateAudio).toHaveBeenCalledWith(false, 0);
  });

  it('unlocks TEC-1G audio on later user gesture when persisted state is unmuted', () => {
    const audioCore = createAudioCoreMock();
    const audio = createTec1gAudio({
      muteEl: document.createElement('div'),
      speakerEl: document.createElement('div'),
      speakerLabel: document.createElement('div'),
      vscode: createStatefulVscode({ audioMute: { tec1g: false } }),
      audioCore,
    });

    audio.unlockAudio();

    expect(audioCore.unlockAudio).toHaveBeenCalledTimes(1);
    expect(audioCore.updateAudio).toHaveBeenCalledWith(false, 0);
  });
});
