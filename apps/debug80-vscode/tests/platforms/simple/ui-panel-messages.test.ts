/**
 * @file Simple UI panel message handler tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSimpleMessage } from '../../../src/platforms/simple/ui-panel-messages';
import { createPanelTestContext } from '../panel-message-fixtures';

describe('simple ui-panel-messages', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores hardware messages unsupported by the simple panel', async () => {
    const { ctx, customRequest } = createPanelTestContext();

    await handleSimpleMessage({ type: 'key', code: 0x12 }, ctx);
    await handleSimpleMessage({ type: 'reset' }, ctx);
    await handleSimpleMessage({ type: 'speed', mode: 'fast' }, ctx);
    await handleSimpleMessage({ type: 'serialSend', text: 'HI' }, ctx);

    expect(customRequest).not.toHaveBeenCalled();
  });

  it('keeps tab and refresh routing for the simple panel', async () => {
    const { ctx, customRequest, postSnapshot } = createPanelTestContext();

    await handleSimpleMessage({ type: 'tab', tab: 'ui' }, ctx);
    expect(ctx.getActiveTab()).toBe('ui');

    await handleSimpleMessage({ type: 'tab', tab: 'memory' }, ctx);
    await handleSimpleMessage(
      { type: 'refresh', views: [{ id: 'a', view: 'bytes', address: 0x4000 }] },
      ctx
    );
    await Promise.resolve();

    expect(ctx.getActiveTab()).toBe('memory');
    expect(ctx.memoryViews.viewModes.a).toBe('bytes');
    expect(ctx.memoryViews.viewAddress.a).toBe(0x4000);
    expect(postSnapshot).toHaveBeenCalled();
    expect(customRequest).not.toHaveBeenCalled();
  });

  it('keeps register and memory edit routing for the simple panel', async () => {
    const { ctx, customRequest, postSnapshot } = createPanelTestContext();

    await handleSimpleMessage({ type: 'registerEdit', register: 'bc', value: '1234' }, ctx);
    await handleSimpleMessage({ type: 'memoryEdit', address: 0x1234, value: 'AB' }, ctx);
    await Promise.resolve();

    expect(customRequest).toHaveBeenCalledWith('debug80/registerWrite', {
      register: 'bc',
      value: '1234',
    });
    expect(customRequest).toHaveBeenCalledWith('debug80/memoryWrite', {
      address: 0x1234,
      value: 'AB',
    });
    expect(postSnapshot).toHaveBeenCalled();
  });
});
