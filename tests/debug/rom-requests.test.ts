/**
 * @file ROM request helper tests.
 */

import { describe, it, expect } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import { buildRomSourcesResponse } from '../../src/debug/rom-requests';

describe('rom-requests', () => {
  it('wraps ROM sources in response body', () => {
    const tmpDir = os.tmpdir();
    const sources = [
      { label: 'main.lst', path: path.join(tmpDir, 'main.lst'), kind: 'listing' as const },
      { label: 'main.asm', path: path.join(tmpDir, 'main.asm'), kind: 'source' as const },
    ];
    expect(buildRomSourcesResponse(sources)).toEqual({ sources });
  });
});
