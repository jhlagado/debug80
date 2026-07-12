import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryViewEntries } from '../../../webview/common/memory-view-elements';

describe('memory view DOM element collection', () => {
  beforeEach(() => {
    document.body.innerHTML = ['a', 'b', 'c', 'd']
      .map(
        (id) => `
          <section>
            <select id="view-${id}"></select>
            <input id="address-${id}" />
            <span id="addr-${id}"></span>
            <span id="sym-${id}"></span>
            <pre id="dump-${id}"></pre>
          </section>
        `
      )
      .join('');
  });

  it('returns the four fixed memory view entries in panel order', () => {
    const views = createMemoryViewEntries(document);

    expect(views.map((entry) => entry.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(views[0].view!.id).toBe('view-a');
    expect(views[0].address!.id).toBe('address-a');
    expect(views[0].addr!.id).toBe('addr-a');
    expect(views[0].symbol!.id).toBe('sym-a');
    expect(views[0].dump!.id).toBe('dump-a');
    expect(views[3].view!.id).toBe('view-d');
    expect(views[3].dump!.id).toBe('dump-d');
  });

  it('keeps missing optional handles nullable', () => {
    document.getElementById('dump-c')?.remove();

    const views = createMemoryViewEntries(document);

    expect(views[2].id).toBe('c');
    expect(views[2].dump).toBeNull();
  });
});
