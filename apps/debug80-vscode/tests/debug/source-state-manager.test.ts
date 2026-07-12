/**
 * @file SourceStateManager tests.
 */

import { describe, it, expect } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import type {
  BuildSourceStateArgs,
  SourceManagerState,
} from '../../src/debug/mapping/source-manager';
import type { SourceMapIndex } from '../../src/mapping/source-map';
import {
  SourceStateManager,
  SourceManagerLike,
} from '../../src/debug/mapping/source-state-manager';

describe('SourceStateManager', () => {
  it('throws if build is called before manager is set', () => {
    const state = new SourceStateManager();
    expect(() =>
      state.build({
        hexPath: path.join(os.tmpdir(), 'test.hex'),
        sourceRoots: [],
        mapArgs: {},
      })
    ).toThrow('SourceStateManager: SourceManager not initialized');
  });

  it('builds state and collects ROM sources via SourceManager', () => {
    const emptyIndex: SourceMapIndex = {
      segmentsByAddress: [],
      segmentsByFileLine: new Map(),
      anchorsByFile: new Map(),
    };
    const manager: SourceManagerLike = {
      buildState: (args: BuildSourceStateArgs): SourceManagerState => ({
        sourceFile: args.sourceFile ?? args.hexPath,
        sourceRoots: args.sourceRoots,
        mapping: { segments: [], anchors: [] },
        mappingIndex: emptyIndex,
        missingSources: [],
      }),
    };

    const state = new SourceStateManager();
    state.setManager(manager);

    const hexPath = path.join(os.tmpdir(), 'test.hex');
    const build = state.build({
      hexPath,
      sourceRoots: ['src'],
      mapArgs: {},
    });

    expect(build.sourceFile).toBe(hexPath);
    expect(build.sourceRoots).toContain('src');
  });
});
