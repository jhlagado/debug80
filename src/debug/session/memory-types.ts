/**
 * @fileoverview Memory snapshot and memory view types.
 */

/**
 * Memory view configuration for snapshot requests.
 */
export interface MemoryViewRequest {
  /** Unique identifier for this view */
  id?: string;
  /** Register or 'absolute' for the view target */
  view?: string;
  /** Number of bytes to show after the focus address */
  after?: number;
  /** Absolute address (only used when view is 'absolute') */
  address?: number;
}

/**
 * Payload for memory snapshot request.
 */
export interface MemorySnapshotPayload {
  /** Number of bytes to show before the focus address */
  before?: number;
  /** Row size (8 or 16) */
  rowSize?: 8 | 16;
  /** View configurations */
  views?: MemoryViewRequest[];
}

/**
 * Result of reading a memory window.
 */
export interface MemoryWindow {
  /** Start address of the window */
  start: number;
  /** Bytes in the window */
  bytes: number[];
  /** Offset of the focus address within the window */
  focus: number;
}

/**
 * Normalized view entry with all fields resolved.
 */
export interface NormalizedViewEntry {
  /** Unique identifier for this view */
  id: string;
  /** Register name or 'absolute' */
  view: string;
  /** Number of bytes to show after */
  after: number;
  /** Address value (only for 'absolute' views) */
  address: number | null;
}

/**
 * Checks if value is a valid MemoryViewRequest.
 */
export function isMemoryViewRequest(value: unknown): value is MemoryViewRequest {
  return typeof value === 'object' && value !== null;
}

/**
 * Extracts memory snapshot payload from unknown value.
 * Provides defaults for missing fields.
 */
export function extractMemorySnapshotPayload(value: unknown): MemorySnapshotPayload {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  const payload = value as Record<string, unknown>;
  const result: MemorySnapshotPayload = {};

  if (typeof payload.before === 'number') {
    result.before = payload.before;
  }
  if (payload.rowSize === 8 || payload.rowSize === 16) {
    result.rowSize = payload.rowSize;
  }
  if (Array.isArray(payload.views)) {
    result.views = payload.views.filter(isMemoryViewRequest);
  }
  return result;
}

/**
 * Extracts and normalizes a view entry from unknown value.
 */
export function extractViewEntry(
  entry: MemoryViewRequest,
  clampFn: (val: unknown, defaultVal: number) => number
): NormalizedViewEntry {
  const id = typeof entry.id === 'string' ? entry.id : 'view';
  const view = typeof entry.view === 'string' ? entry.view : 'hl';
  const after = clampFn(entry.after, 16);
  const address = Number.isFinite(entry.address) ? (entry.address as number) & 0xffff : null;
  return { id, view, after, address };
}