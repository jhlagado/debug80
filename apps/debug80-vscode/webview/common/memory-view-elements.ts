import type { MemoryViewEntry } from './memory-panel';

const MEMORY_VIEW_IDS = ['a', 'b', 'c', 'd'] as const;

function byId<T extends HTMLElement>(root: ParentNode, id: string): T | null {
  const element = root.querySelector(`#${id}`);
  return element instanceof HTMLElement ? (element as T) : null;
}

export function createMemoryViewEntries(root: ParentNode = document): MemoryViewEntry[] {
  return MEMORY_VIEW_IDS.map((id) => ({
    id,
    view: byId<HTMLSelectElement>(root, `view-${id}`),
    address: byId<HTMLInputElement>(root, `address-${id}`),
    addr: byId<HTMLElement>(root, `addr-${id}`),
    symbol: byId<HTMLElement>(root, `sym-${id}`),
    dump: byId<HTMLElement>(root, `dump-${id}`),
  }));
}
