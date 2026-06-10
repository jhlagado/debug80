type Tec1PlatformUpdatePayload = {
  digits?: number[];
  segmentIntensities?: number[];
  matrix?: number[];
  speaker?: boolean;
  speedMode?: string;
  lcd?: number[];
  speakerHz?: number;
};

type Tec1PlatformUpdateDependencies = {
  audio: {
    setSpeakerHz: (hz: number) => void;
    updateAudio: () => void;
  };
  applySpeed: (mode: string) => void;
  display: {
    applyDigits: (digits: number[]) => void;
    applySegmentIntensities: (intensities: number[]) => void;
  };
  lcdRenderer: {
    applyLcdUpdate: (payload: Tec1PlatformUpdatePayload) => void;
  };
  matrixRenderer: {
    applyMatrixUpdate: (payload: Tec1PlatformUpdatePayload) => void;
  };
  speakerEl: HTMLElement;
  speakerHzEl: HTMLElement;
};

function applySevenSegmentUpdate(
  payload: Tec1PlatformUpdatePayload,
  display: Tec1PlatformUpdateDependencies['display']
): void {
  if (Array.isArray(payload.segmentIntensities)) {
    display.applySegmentIntensities(payload.segmentIntensities);
    return;
  }
  display.applyDigits(payload.digits || []);
}

function applySpeakerUpdate(
  payload: Tec1PlatformUpdatePayload,
  deps: Pick<Tec1PlatformUpdateDependencies, 'audio' | 'speakerEl' | 'speakerHzEl'>
): void {
  deps.speakerEl.classList.toggle('on', Boolean(payload.speaker));

  if (typeof payload.speakerHz !== 'number') {
    return;
  }
  if (payload.speakerHz > 0) {
    deps.speakerHzEl.textContent = payload.speakerHz + ' Hz';
    deps.audio.setSpeakerHz(payload.speakerHz);
  } else {
    deps.speakerHzEl.textContent = '';
    deps.audio.setSpeakerHz(0);
  }
}

export function applyTec1PlatformUpdate(
  payload: Tec1PlatformUpdatePayload,
  deps: Tec1PlatformUpdateDependencies
): void {
  applySevenSegmentUpdate(payload, deps.display);
  applySpeakerUpdate(payload, deps);
  deps.audio.updateAudio();

  if (payload.speedMode === 'slow' || payload.speedMode === 'fast') {
    deps.applySpeed(payload.speedMode);
  }
  deps.lcdRenderer.applyLcdUpdate(payload);
  deps.matrixRenderer.applyMatrixUpdate(payload);
}
