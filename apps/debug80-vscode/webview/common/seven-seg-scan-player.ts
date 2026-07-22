import type { SevenSegmentScanCycle } from '@jhlagado/debug80-runtime/platforms/tec-common';
import type { SevenSegDisplay } from './seven-seg-display';

type SevenSegmentScanPlayerOptions = {
  targetLagMs?: number;
  maxLagMs?: number;
};

const DIGIT_COUNT = 6;
const SEGMENT_COUNT = 8;
const DEFAULT_CLOCK_HZ = 4_000_000;
const EXPOSURE_FULL_SCAN_DIGITS = 6;
const EXPOSURE_GAMMA = 2.2;
const DEFAULT_TARGET_LAG_MS = 60;
const DEFAULT_MAX_LAG_MS = 250;
const IDLE_FRAMES_BEFORE_STATIC = 15;

export type SevenSegmentScanPlayer = {
  enqueue(cycles: SevenSegmentScanCycle[], droppedCycles?: number, clockHz?: number): void;
  renderStatic(digits?: number[], intensities?: number[]): void;
  stop(): void;
};

export function createSevenSegmentScanPlayer(
  display: Pick<SevenSegDisplay, 'applyDigits' | 'applySegmentIntensities'>,
  options: SevenSegmentScanPlayerOptions = {}
): SevenSegmentScanPlayer {
  const targetLagMs = options.targetLagMs ?? DEFAULT_TARGET_LAG_MS;
  const maxLagMs = options.maxLagMs ?? DEFAULT_MAX_LAG_MS;
  const cycleQueue: SevenSegmentScanCycle[] = [];
  const onCycles = new Float64Array(DIGIT_COUNT * SEGMENT_COUNT);
  let clockHz = DEFAULT_CLOCK_HZ;
  let playheadCycle: number | null = null;
  let lastFrameTs: number | null = null;
  let rafId: number | null = null;
  let idleFrames = 0;
  let staticDigits = new Array(DIGIT_COUNT).fill(0);
  let staticIntensities: number[] | null = null;

  function schedule(): void {
    if (rafId !== null || typeof requestAnimationFrame !== 'function') {
      return;
    }
    rafId = requestAnimationFrame(playFrame);
  }

  function msToCycles(ms: number): number {
    return (ms / 1000) * clockHz;
  }

  function cyclesToMs(cycles: number): number {
    return clockHz > 0 ? (cycles / clockHz) * 1000 : 0;
  }

  function latestEndCycle(): number | null {
    return cycleQueue.at(-1)?.endCycle ?? null;
  }

  function evictBefore(cycle: number): void {
    while (cycleQueue.length > 0 && cycleQueue[0].endCycle <= cycle) {
      cycleQueue.shift();
    }
  }

  function renderStaticState(): void {
    if (staticIntensities !== null) {
      display.applySegmentIntensities(staticIntensities);
      return;
    }
    display.applyDigits(staticDigits);
  }

  function segmentLevel(normalizedDuty: number): number {
    if (normalizedDuty <= 0) {
      return 0;
    }
    return Math.pow(Math.min(1, normalizedDuty), 1 / EXPOSURE_GAMMA);
  }

  function accumulateCycle(scan: SevenSegmentScanCycle, overlap: number): void {
    for (const phase of scan.phases) {
      const dwell = Math.max(0, phase.dwellCycles) * overlap;
      for (let digit = 0; digit < DIGIT_COUNT; digit += 1) {
        if ((phase.digitMask & (1 << digit)) === 0) {
          continue;
        }
        for (let segment = 0; segment < SEGMENT_COUNT; segment += 1) {
          if ((phase.segments & (1 << segment)) !== 0) {
            onCycles[digit * SEGMENT_COUNT + segment] += dwell;
          }
        }
      }
    }
  }

  function renderExposure(windowCycles: number): void {
    const scale = windowCycles > 0 ? EXPOSURE_FULL_SCAN_DIGITS / windowCycles : 0;
    display.applySegmentIntensities(Array.from(onCycles, (value) => segmentLevel(value * scale)));
  }

  function playFrame(timestamp: number): void {
    rafId = null;
    const latest = latestEndCycle();
    if (latest === null || playheadCycle === null) {
      idleFrames += 1;
      if (idleFrames >= IDLE_FRAMES_BEFORE_STATIC) {
        lastFrameTs = null;
        renderStaticState();
        return;
      }
      schedule();
      return;
    }

    if (lastFrameTs === null) {
      lastFrameTs = timestamp;
      schedule();
      return;
    }

    const wallDeltaMs = Math.max(0, Math.min(100, timestamp - lastFrameTs));
    lastFrameTs = timestamp;
    if (cyclesToMs(latest - playheadCycle) > maxLagMs) {
      playheadCycle = latest - msToCycles(targetLagMs);
      evictBefore(playheadCycle);
    }

    const windowEnd = Math.min(latest, playheadCycle + msToCycles(wallDeltaMs));
    if (windowEnd <= playheadCycle) {
      idleFrames += 1;
      if (idleFrames >= IDLE_FRAMES_BEFORE_STATIC) {
        lastFrameTs = null;
        renderStaticState();
        return;
      }
      schedule();
      return;
    }
    idleFrames = 0;

    onCycles.fill(0);
    const windowStart = playheadCycle;
    const windowCycles = windowEnd - windowStart;
    for (const scan of cycleQueue) {
      if (scan.endCycle <= windowStart) {
        continue;
      }
      if (scan.startCycle >= windowEnd) {
        break;
      }
      const span = Math.max(1, scan.endCycle - scan.startCycle);
      const overlap =
        (Math.min(scan.endCycle, windowEnd) - Math.max(scan.startCycle, windowStart)) / span;
      if (overlap > 0) {
        accumulateCycle(scan, overlap);
      }
    }
    renderExposure(windowCycles);

    playheadCycle = windowEnd;
    evictBefore(playheadCycle);
    schedule();
  }

  return {
    enqueue(cycles, _droppedCycles = 0, nextClockHz = 0): void {
      if (nextClockHz > 0) {
        clockHz = nextClockHz;
      }
      for (const scan of cycles) {
        const coveredDigits = scan.phases.reduce(
          (mask, phase) => mask | (phase.digitMask & 0x3f),
          0
        );
        if (scan.phases.length === 0 || coveredDigits !== 0x3f) {
          continue;
        }
        const tail = latestEndCycle();
        if (tail !== null && scan.startCycle < tail - msToCycles(1000)) {
          cycleQueue.length = 0;
          playheadCycle = null;
        }
        cycleQueue.push(scan);
      }
      const latest = latestEndCycle();
      if (latest !== null) {
        if (playheadCycle === null) {
          playheadCycle = Math.max(cycleQueue[0].startCycle, latest - msToCycles(targetLagMs));
        }
        schedule();
      }
    },
    renderStatic(digits = [], intensities = []): void {
      staticDigits = digits.slice(0, DIGIT_COUNT);
      staticIntensities = intensities.length > 0 ? intensities.slice(0, 48) : null;
      if (cycleQueue.length === 0 && rafId === null) {
        renderStaticState();
      }
    },
    stop(): void {
      if (rafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
      }
      rafId = null;
      cycleQueue.length = 0;
      playheadCycle = null;
      lastFrameTs = null;
      idleFrames = 0;
    },
  };
}
