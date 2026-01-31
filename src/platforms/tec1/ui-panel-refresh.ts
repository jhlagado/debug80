/**
 * @file TEC-1 panel refresh helpers.
 */

export type SnapshotRequest = {
  views: Array<{ id: string; view: string; after: number; address?: number | undefined }>;
};

export interface RefreshHandlers {
  postSnapshot: (payload: SnapshotRequest) => Promise<void>;
  onSnapshotPosted: () => void;
  onSnapshotFailed: (allowErrors: boolean) => void;
}

export interface RefreshState {
  timer: ReturnType<typeof setInterval> | undefined;
  inFlight: boolean;
}

export type RefreshController = {
  state: RefreshState;
  snapshotPayload: () => SnapshotRequest;
  handlers: RefreshHandlers;
};

export type RefreshOptions = {
  allowErrors?: boolean;
};

/**
 * Creates refresh state with no active timer.
 */
export function createRefreshState(): RefreshState {
  return { timer: undefined, inFlight: false };
}

/**
 * Creates a controller bundle to keep refresh calls type-safe in UI modules.
 */
export function createRefreshController(
  payload: () => SnapshotRequest,
  handlers: RefreshHandlers
): RefreshController {
  return { state: createRefreshState(), snapshotPayload: payload, handlers };
}

/**
 * Runs a snapshot refresh if one is not already in flight.
 */
export async function refreshSnapshot(
  state: RefreshState,
  handlers: RefreshHandlers,
  payload: SnapshotRequest,
  options: RefreshOptions = {}
): Promise<void> {
  if (state.inFlight) {
    return;
  }
  state.inFlight = true;
  try {
    await handlers.postSnapshot(payload);
    handlers.onSnapshotPosted();
  } catch {
    handlers.onSnapshotFailed(options.allowErrors !== false);
  } finally {
    state.inFlight = false;
  }
}

/**
 * Starts the auto-refresh timer.
 */
export function startAutoRefresh(
  state: RefreshState,
  intervalMs: number,
  handler: () => void
): void {
  if (state.timer !== undefined) {
    return;
  }
  state.timer = setInterval(handler, intervalMs);
}

/**
 * Stops the auto-refresh timer.
 */
export function stopAutoRefresh(state: RefreshState): void {
  if (state.timer !== undefined) {
    clearInterval(state.timer);
    state.timer = undefined;
  }
}
