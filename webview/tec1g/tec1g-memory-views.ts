/**
 * @file DOM descriptors for the four memory dump columns (A–D) in the TEC-1G memory tab.
 */

export type Tec1gMemoryViewRow = {
  id: string;
  view: HTMLElement | null;
  address: HTMLElement | null;
  addr: HTMLElement | null;
  symbol: HTMLElement | null;
  dump: HTMLElement | null;
};

/**
 * Resolves the fixed `view-a` … `view-d` regions from `index.html`.
 */
export function createTec1gMemoryViews(): Tec1gMemoryViewRow[] {
  return [
    {
      id: 'a',
      view: document.getElementById('view-a'),
      address: document.getElementById('address-a'),
      addr: document.getElementById('addr-a'),
      symbol: document.getElementById('sym-a'),
      dump: document.getElementById('dump-a'),
    },
    {
      id: 'b',
      view: document.getElementById('view-b'),
      address: document.getElementById('address-b'),
      addr: document.getElementById('addr-b'),
      symbol: document.getElementById('sym-b'),
      dump: document.getElementById('dump-b'),
    },
    {
      id: 'c',
      view: document.getElementById('view-c'),
      address: document.getElementById('address-c'),
      addr: document.getElementById('addr-c'),
      symbol: document.getElementById('sym-c'),
      dump: document.getElementById('dump-c'),
    },
    {
      id: 'd',
      view: document.getElementById('view-d'),
      address: document.getElementById('address-d'),
      addr: document.getElementById('addr-d'),
      symbol: document.getElementById('sym-d'),
      dump: document.getElementById('dump-d'),
    },
  ];
}
