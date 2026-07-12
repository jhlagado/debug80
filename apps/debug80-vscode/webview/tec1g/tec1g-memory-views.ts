/**
 * @file DOM descriptors for the four memory dump columns (A–D) in the TEC-1G memory tab.
 */

import type { MemoryViewEntry } from '../common/memory-panel';
import { createMemoryViewEntries } from '../common/memory-view-elements';

/**
 * Resolves the fixed `view-a` … `view-d` regions from `index.html`.
 */
export function createTec1gMemoryViews(): MemoryViewEntry[] {
  return createMemoryViewEntries(document);
}
