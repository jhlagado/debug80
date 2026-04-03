/**
 * @file TEC-1 memory panel HTML regression tests.
 */
// @vitest-environment jsdom

import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTec1MemoryHtml, type Tec1MemorySnapshotPayload } from '../../../src/platforms/tec1/memory-panel-html';

type RefreshMessage = {
  type: 'refresh';
  rowSize: number;
  views: Array<{
    id: string;
    view: string;
    after: number;
    address?: number;
  }>;
};

type TestWindow = Window & {
  acquireVsCodeApi: () => {
    postMessage: (message: RefreshMessage) => void;
  };
};

type JSDOMLike = {
  window: Window;
};

type JSDOMConstructor = new (
  html: string,
  options: {
    pretendToBeVisual?: boolean;
    runScripts?: 'dangerously';
    beforeParse?: (window: Window) => void;
  }
) => JSDOMLike;

type MemoryPanelHarness = {
  window: TestWindow;
  messages: RefreshMessage[];
  status: HTMLElement;
  viewA: HTMLSelectElement;
  addressA: HTMLInputElement;
  dumpA: HTMLElement;
  labelA: HTMLElement;
  addrA: HTMLElement;
  symA: HTMLElement;
};

function createView(
  id: string,
  view: string,
  address: number,
  start: number,
  bytes: number[],
  focus: number,
  after: number,
  symbol?: string | null,
  symbolOffset?: number | null
): Tec1MemorySnapshotPayload['views'][number] {
  return {
    id,
    view,
    address,
    start,
    bytes,
    focus,
    after,
    ...(symbol !== undefined ? { symbol } : {}),
    ...(symbolOffset !== undefined ? { symbolOffset } : {}),
  };
}

function requireElement<T extends HTMLElement>(
  element: Element | null,
  message: string,
  predicate: (value: Element) => value is T
): T {
  if (element === null || !predicate(element)) {
    throw new Error(message);
  }
  return element;
}

function createHarness(): MemoryPanelHarness {
  const messages: RefreshMessage[] = [];
  const html = getTec1MemoryHtml();
  const TypedJSDOM = JSDOM as unknown as JSDOMConstructor;
  const dom = new TypedJSDOM(html, {
    pretendToBeVisual: true,
    runScripts: 'dangerously',
    beforeParse(window: Window) {
      const testWindow = window as TestWindow;
      testWindow.acquireVsCodeApi = () => ({
        postMessage: (message: RefreshMessage) => {
          messages.push(message);
        },
      });
    },
  });
  const testWindow = dom.window as unknown as TestWindow;
  const { document } = testWindow;

  return {
    window: testWindow,
    messages,
    status: requireElement(
      document.getElementById('status'),
      'status element not found',
      (value): value is HTMLElement => value instanceof testWindow.HTMLElement
    ),
    viewA: requireElement(
      document.getElementById('view-a'),
      'view-a element not found',
      (value): value is HTMLSelectElement => value instanceof testWindow.HTMLSelectElement
    ),
    addressA: requireElement(
      document.getElementById('address-a'),
      'address-a element not found',
      (value): value is HTMLInputElement => value instanceof testWindow.HTMLInputElement
    ),
    dumpA: requireElement(
      document.getElementById('dump-a'),
      'dump-a element not found',
      (value): value is HTMLElement => value instanceof testWindow.HTMLElement
    ),
    labelA: requireElement(
      document.getElementById('label-a'),
      'label-a element not found',
      (value): value is HTMLElement => value instanceof testWindow.HTMLElement
    ),
    addrA: requireElement(
      document.getElementById('addr-a'),
      'addr-a element not found',
      (value): value is HTMLElement => value instanceof testWindow.HTMLElement
    ),
    symA: requireElement(
      document.getElementById('sym-a'),
      'sym-a element not found',
      (value): value is HTMLElement => value instanceof testWindow.HTMLElement
    ),
  };
}

describe('tec1 memory panel html', () => {
  let harness: MemoryPanelHarness;

  beforeEach(() => {
    harness = createHarness();
  });

  afterEach(() => {
    harness.window.close();
  });

  it('requests the default snapshot on load', () => {
    expect(harness.status.textContent).toBe('Refreshing…');
    expect(harness.messages[0]).toEqual({
      type: 'refresh',
      rowSize: 16,
      views: [
        { id: 'a', view: 'pc', after: 16, address: undefined },
        { id: 'b', view: 'sp', after: 16, address: undefined },
        { id: 'c', view: 'hl', after: 16, address: undefined },
        { id: 'd', view: 'de', after: 16, address: undefined },
      ],
    });
  });

  it('renders snapshots and resolves symbol-backed requests', () => {
    const { window } = harness;
    harness.viewA.value = 'absolute';
    harness.addressA.value = '0x1234';
    const snapshot: Tec1MemorySnapshotPayload = {
      before: 16,
      rowSize: 16,
      symbols: [{ name: 'BOOT', address: 0x2345 }],
      views: [
        createView('a', 'absolute', 0x1234, 0x1234, [0x42, 0x4f, 0x4f, 0x54], 1, 16, 'BOOT', 0x10),
        createView('b', 'sp', 0x2000, 0x2000, [0x31, 0x32, 0x33, 0x34], 0, 16),
        createView('c', 'hl', 0x3000, 0x3000, [0x00, 0x10, 0x20, 0x7f], 2, 16),
        createView('d', 'de', 0x4000, 0x4000, [0x55, 0xaa, 0x55, 0xaa], 3, 16),
      ],
    };

    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'snapshot', ...snapshot } })
    );

    expect(harness.status.textContent).toBe('Updated');
    expect(harness.labelA.textContent).toBe('ABSOLUTE');
    expect(harness.addrA.textContent).toBe('0x1234');
    expect(harness.symA.textContent).toBe('BOOT + 0x10');
    expect(harness.dumpA.innerHTML).toContain('byte focus');
    expect(harness.dumpA.textContent).toContain('42');
    expect(harness.dumpA.textContent).toContain('BOOT');

    harness.viewA.value = 'symbol:BOOT';
    harness.viewA.dispatchEvent(new Event('change', { bubbles: true }));

    expect(harness.addressA.value).toBe('0x2345');
    expect(harness.messages[harness.messages.length - 1]).toEqual({
      type: 'refresh',
      rowSize: 16,
      views: [
        { id: 'a', view: 'absolute', after: 16, address: 0x2345 },
        { id: 'b', view: 'sp', after: 16, address: undefined },
        { id: 'c', view: 'hl', after: 16, address: undefined },
        { id: 'd', view: 'de', after: 16, address: undefined },
      ],
    });
  });
});
