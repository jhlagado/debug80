type Tec1PlatformUpdatePayload = {
  digits?: number[];
  segmentIntensities?: number[];
  segmentScanCycles?: import('@jhlagado/debug80-runtime/platforms/tec-common').SevenSegmentScanCycle[];
  segmentDroppedScanCycles?: number;
  segmentClockHz?: number;
  segmentScanStopped?: boolean;
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
  segmentPlayer: {
    enqueue: (
      cycles: NonNullable<Tec1PlatformUpdatePayload['segmentScanCycles']>,
      droppedCycles?: number,
      clockHz?: number
    ) => void;
    renderStatic: (digits?: number[], intensities?: number[]) => void;
    stop: () => void;
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
  player: Tec1PlatformUpdateDependencies['segmentPlayer']
): void {
  if (payload.segmentScanStopped === true) {
    player.stop();
    player.renderStatic(payload.digits, payload.segmentIntensities);
    return;
  }
  if (Array.isArray(payload.segmentScanCycles)) {
    player.enqueue(
      payload.segmentScanCycles,
      payload.segmentDroppedScanCycles,
      payload.segmentClockHz
    );
  }
  if (Array.isArray(payload.segmentIntensities) || Array.isArray(payload.digits)) {
    player.renderStatic(payload.digits, payload.segmentIntensities);
  }
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
  applySevenSegmentUpdate(payload, deps.segmentPlayer);
  applySpeakerUpdate(payload, deps);
  deps.audio.updateAudio();

  if (payload.speedMode === 'slow' || payload.speedMode === 'fast') {
    deps.applySpeed(payload.speedMode);
  }
  deps.lcdRenderer.applyLcdUpdate(payload);
  deps.matrixRenderer.applyMatrixUpdate(payload);
}
