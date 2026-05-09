/**
 * @file Regression tests: TEC speaker mute state survives webview reloads.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudioController } from '../../webview/tec1/audio';
import { createTec1gAudio } from '../../webview/tec1g/tec1g-audio';
import type { VscodeApi } from '../../webview/common/vscode';

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
});
