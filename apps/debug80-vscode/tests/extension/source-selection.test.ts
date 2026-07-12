/**
 * @file Source file selection helper tests.
 */

import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  buildSourcePickItems,
  resolveResourceSourceSelection,
} from '../../src/extension/source-selection';

const projectRoot = '/workspace/proj';
const sourceCandidates = ['src/main.asm'];

function resolveProjectSource(resourcePath: string, candidates = sourceCandidates) {
  return resolveResourceSourceSelection(resourcePath, projectRoot, candidates);
}

describe('source-selection', () => {
  it('selects an open resource when it is a candidate inside the project folder', () => {
    expect(resolveProjectSource('/workspace/proj/src/main.asm')).toBe('src/main.asm');
  });

  it('does not treat sibling folder prefixes as project-relative paths', () => {
    expect(resolveProjectSource('/workspace/proj2/src/main.asm')).toBeUndefined();
  });

  it('allows in-project filenames that begin with two dots', () => {
    expect(resolveProjectSource('/workspace/proj/..main.asm', ['..main.asm'])).toBe('..main.asm');
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
