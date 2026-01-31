/**
 * @file ROM request helper tests.
 */

import { describe, it, expect } from 'vitest';
import { buildRomSourcesResponse } from '../../src/debug/rom-requests';

describe('rom-requests', () => {
  it('wraps ROM sources in response body', () => {
    const sources = [
      { label: 'main.lst', path: '/tmp/main.lst', kind: 'listing' as const },
      { label: 'main.asm', path: '/tmp/main.asm', kind: 'source' as const },
    ];
    expect(buildRomSourcesResponse(sources)).toEqual({ sources });
  });
});
