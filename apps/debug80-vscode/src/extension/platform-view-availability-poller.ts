export interface PlatformViewAvailabilityPoller {
  getAvailable(): boolean;
  refresh(): Promise<void>;
  start(): void;
  stop(): void;
}

export function createPlatformViewAvailabilityPoller(options: {
  check: () => Promise<boolean>;
  onChange: (available: boolean) => void;
  intervalMs?: number;
}): PlatformViewAvailabilityPoller {
  let available = false;
  let checking = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const intervalMs = options.intervalMs ?? 3000;

  async function refresh(): Promise<void> {
    if (checking) {
      return;
    }
    checking = true;
    try {
      const next = await options.check();
      if (next !== available) {
        available = next;
        options.onChange(available);
      }
    } finally {
      checking = false;
    }
  }

  function start(): void {
    if (timer !== undefined) {
      return;
    }
    void refresh();
    timer = setInterval(() => void refresh(), intervalMs);
  }

  function stop(): void {
    if (timer === undefined) {
      return;
    }
    clearInterval(timer);
    timer = undefined;
  }

  return { getAvailable: () => available, refresh, start, stop };
}
