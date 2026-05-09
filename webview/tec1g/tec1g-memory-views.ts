/**
 * @file DOM descriptors for the four memory dump columns (A–D) in the TEC-1G memory tab.
 */

import type { MemoryViewEntry } from '../common/memory-panel';

/**
 * Resolves the fixed `view-a` … `view-d` regions from `index.html`.
 */
export function createTec1gMemoryViews(): MemoryViewEntry[] {
  return [
    {
      id: 'a',
      view: document.getElementById('view-a') as HTMLSelectElement | null,
      address: document.getElementById('address-a') as HTMLInputElement | null,
      addr: document.getElementById('addr-a'),
      symbol: document.getElementById('sym-a'),
      dump: document.getElementById('dump-a'),
    },
    {
      id: 'b',
      view: document.getElementById('view-b') as HTMLSelectElement | null,
      address: document.getElementById('address-b') as HTMLInputElement | null,
      addr: document.getElementById('addr-b'),
      symbol: document.getElementById('sym-b'),
      dump: document.getElementById('dump-b'),
    },
    {
      id: 'c',
      view: document.getElementById('view-c') as HTMLSelectElement | null,
      address: document.getElementById('address-c') as HTMLInputElement | null,
      addr: document.getElementById('addr-c'),
      symbol: document.getElementById('sym-c'),
      dump: document.getElementById('dump-c'),
    },
    {
      id: 'd',
      view: document.getElementById('view-d') as HTMLSelectElement | null,
      address: document.getElementById('address-d') as HTMLInputElement | null,
      addr: document.getElementById('addr-d'),
      symbol: document.getElementById('sym-d'),
      dump: document.getElementById('dump-d'),
    },
  ];
}
