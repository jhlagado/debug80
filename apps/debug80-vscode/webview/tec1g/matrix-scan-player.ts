import type {
  Tec1gMatrixScanCycle,
  Tec1gMatrixScanRow,
} from '@jhlagado/debug80-runtime/platforms/tec1g/types';

type MatrixScanPlayerOptions = {
  targetLagMs?: number;
  maxLagMs?: number;
};

const LED_COUNT = 8;
const DEFAULT_CLOCK_HZ = 4_000_000;
/**
 * Exposure normalization: a clean scan lights each row 1/8 of the time, so a
 * duty of 1/EXPOSURE_FULL_SCAN_ROWS maps to full display brightness. Relative
 * brightness between LEDs stays exactly proportional to measured duty.
 */
const EXPOSURE_FULL_SCAN_ROWS = 8;
/** Perceptual response curve applied to normalized duty (LEDs vs. monitors). */
const EXPOSURE_GAMMA = 2.2;
/** Render this far behind the newest captured data to absorb arrival jitter. */
const DEFAULT_TARGET_LAG_MS = 60;
/** Beyond this backlog of emulated time, jump the playhead and count drops. */
const DEFAULT_MAX_LAG_MS = 250;
/** Idle rAF ticks (no scan data) before falling back to the latch-state view. */
const IDLE_FRAMES_BEFORE_STATIC = 15;
/** Rolling window used to estimate the effective emulation clock rate. */
const CLOCK_SAMPLE_WINDOW_MS = 2000;

export type MatrixScanPlayer = {
  enqueue(cycles: Tec1gMatrixScanCycle[], droppedCycles?: number, clockHz?: number): void;
  renderStaticRows(redRows: number[], greenRows?: number[], blueRows?: number[]): void;
  stop(): void;
};

export function createMatrixScanPlayer(
  canvas: HTMLCanvasElement | null,
  statsEl?: HTMLElement | null,
  options: MatrixScanPlayerOptions = {}
): MatrixScanPlayer {
  const ctx = canvas?.getContext('2d') ?? null;
  const targetLagMs = options.targetLagMs ?? DEFAULT_TARGET_LAG_MS;
  const maxLagMs = options.maxLagMs ?? DEFAULT_MAX_LAG_MS;

  const cycleQueue: Tec1gMatrixScanCycle[] = [];
  let matrixClockHz = DEFAULT_CLOCK_HZ;
  let playheadCycle: number | null = null;
  let lastFrameTs: number | null = null;
  let rafId: number | null = null;
  let idleFrames = 0;
  let droppedByRuntime = 0;
  let droppedByPlayback = 0;
  let lastScanHz = 0;

  // Effective clock estimation: emulated cycles observed per wall-clock second.
  const clockSamples: Array<{ wallMs: number; cycle: number }> = [];

  // Latch planes from the runtime payload; shown when no scan is in flight.
  let staticRed = new Array(LED_COUNT).fill(0);
  let staticGreen = new Array(LED_COUNT).fill(0);
  let staticBlue = new Array(LED_COUNT).fill(0);

  // Per-LED on-time accumulators for the current display frame.
  const onR = new Float64Array(64);
  const onG = new Float64Array(64);
  const onB = new Float64Array(64);

  function schedule(): void {
    if (rafId !== null || typeof requestAnimationFrame !== 'function') {
      return;
    }
    rafId = requestAnimationFrame(playFrame);
  }

  function clearCanvas(): void {
    if (!canvas || !ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  /**
   * Draws one LED. Channel values are perceptual intensities in 0..1.
   * Off LEDs render as a frosted translucent diffuser; lit LEDs get a hot
   * centre, saturated body, dark rim, and a glow halo that scales with
   * intensity — matching the pre-canvas DOM styling.
   */
  function drawLed(row: number, col: number, red: number, green: number, blue: number): void {
    if (!canvas || !ctx) {
      return;
    }
    // Dot diameter is 75% of the cell pitch, matching the original 24px
    // dots on a 32px grid from the DOM-based matrix.
    const cell = Math.min(canvas.width, canvas.height) / LED_COUNT;
    const radius = cell * 0.375;
    const cx = col * cell + cell / 2;
    const cy = row * cell + cell / 2;

    // Frosted diffuser base with a top-left highlight (always present).
    const base = ctx.createRadialGradient(
      cx - radius * 0.24,
      cy - radius * 0.36,
      radius * 0.1,
      cx,
      cy,
      radius
    );
    base.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
    base.addColorStop(0.45, 'rgba(200, 204, 212, 0.12)');
    base.addColorStop(1, 'rgba(110, 115, 125, 0.09)');
    ctx.beginPath();
    ctx.fillStyle = base;
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    const level = Math.max(red, green, blue);
    if (level <= 0) {
      return;
    }
    // Hue-normalized channels; overall intensity applied via globalAlpha so
    // dim LEDs read as a faint tint over the diffuser, not a muddy colour.
    const r = red / level;
    const g = green / level;
    const b = blue / level;
    const lit = ctx.createRadialGradient(
      cx - radius * 0.16,
      cy - radius * 0.36,
      radius * 0.08,
      cx,
      cy,
      radius
    );
    lit.addColorStop(
      0,
      `rgb(${Math.round(70 + 185 * r)}, ${Math.round(70 + 185 * g)}, ${Math.round(70 + 185 * b)})`
    );
    lit.addColorStop(
      0.42,
      `rgb(${Math.round(20 + 235 * r)}, ${Math.round(20 + 235 * g)}, ${Math.round(20 + 235 * b)})`
    );
    lit.addColorStop(
      1,
      `rgb(${Math.round(4 + 120 * r)}, ${Math.round(4 + 120 * g)}, ${Math.round(4 + 120 * b)})`
    );
    ctx.save();
    ctx.globalAlpha = level;
    ctx.shadowColor = `rgba(${Math.round(100 + 155 * r)}, ${Math.round(100 + 155 * g)}, ${Math.round(100 + 155 * b)}, 0.92)`;
    ctx.shadowBlur = (4 + 18 * level) * (cell / 32);
    ctx.beginPath();
    ctx.fillStyle = lit;
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Maps normalized duty (0..1 of a clean scan) to a perceptual intensity. */
  function channelLevel(normalizedDuty: number): number {
    if (normalizedDuty <= 0) {
      return 0;
    }
    return Math.pow(Math.min(1, normalizedDuty), 1 / EXPOSURE_GAMMA);
  }

  function msToCycles(ms: number): number {
    return (ms / 1000) * matrixClockHz;
  }

  function cyclesToMs(cycles: number): number {
    return matrixClockHz > 0 ? (cycles / matrixClockHz) * 1000 : 0;
  }

  function latestEndCycle(): number | null {
    const last = cycleQueue[cycleQueue.length - 1];
    return last === undefined ? null : last.endCycle;
  }

  function effectiveClockHz(): number {
    const first = clockSamples[0];
    const last = clockSamples[clockSamples.length - 1];
    if (first === undefined || last === undefined || last.wallMs <= first.wallMs) {
      return 0;
    }
    return ((last.cycle - first.cycle) / (last.wallMs - first.wallMs)) * 1000;
  }

  function updateStats(): void {
    if (!statsEl) {
      return;
    }
    const scanText = lastScanHz > 0 ? `${lastScanHz.toFixed(1)} Hz` : '-- Hz';
    const effHz = effectiveClockHz();
    const cpuText = effHz > 0 ? `${(effHz / 1_000_000).toFixed(2)} MHz` : '-- MHz';
    const latest = latestEndCycle();
    const bufferMs =
      latest !== null && playheadCycle !== null
        ? Math.max(0, cyclesToMs(latest - playheadCycle))
        : 0;
    statsEl.textContent =
      `SCAN ${scanText} | CPU ${cpuText} | buffer ${bufferMs.toFixed(0)} ms` +
      ` | dropped ${droppedByRuntime + droppedByPlayback}`;
  }

  /** Adds a row event's on-time (in cycles) into the per-LED accumulators. */
  function accumulateRow(rowImage: Tec1gMatrixScanRow, onCycles: number): void {
    const row = Math.max(0, Math.min(7, Math.trunc(rowImage.row)));
    for (let col = 0; col < LED_COUNT; col += 1) {
      const hardwareCol = 7 - col;
      const mask = 1 << hardwareCol;
      const idx = row * 8 + col;
      if ((rowImage.red & mask) !== 0) {
        onR[idx] += onCycles;
      }
      if ((rowImage.green & mask) !== 0) {
        onG[idx] += onCycles;
      }
      if ((rowImage.blue & mask) !== 0) {
        onB[idx] += onCycles;
      }
    }
  }

  function renderExposure(windowCycles: number): void {
    clearCanvas();
    const scale = windowCycles > 0 ? EXPOSURE_FULL_SCAN_ROWS / windowCycles : 0;
    for (let row = 0; row < LED_COUNT; row += 1) {
      for (let col = 0; col < LED_COUNT; col += 1) {
        const idx = row * 8 + col;
        drawLed(
          row,
          col,
          channelLevel(onR[idx] * scale),
          channelLevel(onG[idx] * scale),
          channelLevel(onB[idx] * scale)
        );
      }
    }
  }

  function renderStaticPlanes(): void {
    clearCanvas();
    for (let row = 0; row < LED_COUNT; row += 1) {
      for (let col = 0; col < LED_COUNT; col += 1) {
        const hardwareCol = 7 - col;
        const mask = 1 << hardwareCol;
        drawLed(
          row,
          col,
          channelLevel(((staticRed[row] ?? 0) & mask) !== 0 ? 1 : 0),
          channelLevel(((staticGreen[row] ?? 0) & mask) !== 0 ? 1 : 0),
          channelLevel(((staticBlue[row] ?? 0) & mask) !== 0 ? 1 : 0)
        );
      }
    }
  }

  /** Drops fully-consumed cycles; counts those skipped by a playhead jump. */
  function evictBefore(cycle: number, countAsDropped: boolean): void {
    let removed = 0;
    while (cycleQueue.length > 0 && cycleQueue[0].endCycle <= cycle) {
      cycleQueue.shift();
      removed += 1;
    }
    if (countAsDropped) {
      droppedByPlayback += removed;
    }
  }

  function playFrame(timestamp: number): void {
    rafId = null;
    const latest = latestEndCycle();
    if (latest === null || playheadCycle === null) {
      idleFrames += 1;
      if (idleFrames >= IDLE_FRAMES_BEFORE_STATIC) {
        lastFrameTs = null;
        renderStaticPlanes();
        updateStats();
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

    // Jump forward if the backlog exceeds the allowed lag.
    if (cyclesToMs(latest - playheadCycle) > maxLagMs) {
      playheadCycle = latest - msToCycles(targetLagMs);
      evictBefore(playheadCycle, true);
    }

    let windowEnd = playheadCycle + msToCycles(wallDeltaMs);
    if (windowEnd > latest) {
      windowEnd = latest;
    }
    if (windowEnd <= playheadCycle) {
      // Starved: emulation has not produced data past the playhead yet.
      idleFrames += 1;
      if (idleFrames >= IDLE_FRAMES_BEFORE_STATIC) {
        lastFrameTs = null;
        renderStaticPlanes();
        updateStats();
        return;
      }
      schedule();
      return;
    }
    idleFrames = 0;

    onR.fill(0);
    onG.fill(0);
    onB.fill(0);
    const windowStart = playheadCycle;
    const windowCycles = windowEnd - windowStart;
    for (const cycle of cycleQueue) {
      if (cycle.endCycle <= windowStart) {
        continue;
      }
      if (cycle.startCycle >= windowEnd) {
        break;
      }
      const span = Math.max(1, cycle.endCycle - cycle.startCycle);
      const overlap =
        (Math.min(cycle.endCycle, windowEnd) - Math.max(cycle.startCycle, windowStart)) / span;
      if (overlap <= 0) {
        continue;
      }
      for (const rowImage of cycle.rows) {
        accumulateRow(rowImage, rowImage.dwellCycles * overlap);
      }
    }
    renderExposure(windowCycles);

    playheadCycle = windowEnd;
    evictBefore(playheadCycle, false);
    updateStats();
    schedule();
  }

  return {
    enqueue(cycles: Tec1gMatrixScanCycle[], droppedCycles = 0, clockHz = 0): void {
      droppedByRuntime += Math.max(0, Math.trunc(droppedCycles));
      if (clockHz > 0) {
        matrixClockHz = clockHz;
      }
      for (const cycle of cycles) {
        if (cycle.rows.length !== 8) {
          continue;
        }
        // A cycle counter behind the queue tail means the emulation restarted.
        const tail = latestEndCycle();
        if (tail !== null && cycle.startCycle < tail - msToCycles(1000)) {
          cycleQueue.length = 0;
          playheadCycle = null;
          clockSamples.length = 0;
        }
        cycleQueue.push(cycle);
      }
      const latest = latestEndCycle();
      if (latest !== null) {
        const last = cycleQueue[cycleQueue.length - 1];
        lastScanHz =
          last.endCycle > last.startCycle ? matrixClockHz / (last.endCycle - last.startCycle) : 0;
        if (playheadCycle === null) {
          playheadCycle = Math.max(cycleQueue[0].startCycle, latest - msToCycles(targetLagMs));
        }
        const nowMs =
          typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : Date.now();
        clockSamples.push({ wallMs: nowMs, cycle: latest });
        while (clockSamples.length > 2 && nowMs - clockSamples[0].wallMs > CLOCK_SAMPLE_WINDOW_MS) {
          clockSamples.shift();
        }
        schedule();
      }
      updateStats();
    },
    renderStaticRows(redRows: number[], greenRows: number[] = [], blueRows: number[] = []): void {
      staticRed = redRows.slice(0, LED_COUNT);
      staticGreen = greenRows.slice(0, LED_COUNT);
      staticBlue = blueRows.slice(0, LED_COUNT);
      if (cycleQueue.length === 0 && rafId === null) {
        renderStaticPlanes();
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
      clockSamples.length = 0;
    },
  };
}
