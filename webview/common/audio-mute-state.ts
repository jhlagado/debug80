import type { VscodeApi } from './vscode';

export type AudioMutePlatform = 'tec1' | 'tec1g';

type AudioMuteState = {
  audioMute?: Partial<Record<AudioMutePlatform, boolean>>;
};

function asAudioMuteState(state: unknown): AudioMuteState {
  return state && typeof state === 'object' ? (state as AudioMuteState) : {};
}

export function readAudioMuted(
  vscode: Pick<VscodeApi, 'getState'> | undefined,
  platform: AudioMutePlatform
): boolean {
  const state = asAudioMuteState(vscode?.getState());
  const stored = state.audioMute?.[platform];
  return typeof stored === 'boolean' ? stored : true;
}

export function writeAudioMuted(
  vscode: Pick<VscodeApi, 'getState' | 'setState'> | undefined,
  platform: AudioMutePlatform,
  muted: boolean
): void {
  if (!vscode) {
    return;
  }
  const state = asAudioMuteState(vscode.getState());
  vscode.setState({
    ...state,
    audioMute: {
      ...state.audioMute,
      [platform]: muted,
    },
  });
}
