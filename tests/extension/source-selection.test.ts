/**
 * @file Source file selection helper tests.
 */

import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  buildSourcePickItems,
  resolveResourceSourceSelection,
} from '../../src/extension/source-selection';

describe('source-selection', () => {
  it('selects an open resource when it is a candidate inside the project folder', () => {
    expect(
      resolveResourceSourceSelection('/workspace/proj/src/main.asm', '/workspace/proj', [
        'src/main.asm',
      ])
    ).toBe('src/main.asm');
  });

  it('does not treat sibling folder prefixes as project-relative paths', () => {
    expect(
      resolveResourceSourceSelection('/workspace/proj2/src/main.asm', '/workspace/proj', [
        'src/main.asm',
      ])
    ).toBeUndefined();
  });

  it('normalizes host path separators to Debug80 project paths', () => {
    const folder = path.join('/workspace', 'proj');
    const resource = path.join(folder, 'src', 'main.asm');

    expect(resolveResourceSourceSelection(resource, folder, ['src/main.asm'])).toBe('src/main.asm');
  });

  it('marks the current source in pick items', () => {
    expect(buildSourcePickItems(['src/main.asm', 'src/other.asm'], 'src/main.asm')).toEqual([
      { label: 'src/main.asm', description: 'current program file' },
      { label: 'src/other.asm' },
    ]);
  });
});
