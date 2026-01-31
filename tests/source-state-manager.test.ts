/**
 * @file SourceStateManager tests.
 */

import { describe, it, expect } from 'vitest';
import type { BuildSourceStateArgs, SourceManagerState } from '../src/debug/source-manager';
import type { SourceMapIndex } from '../src/mapping/source-map';
import { SourceStateManager, SourceManagerLike } from '../src/debug/source-state-manager';

describe('SourceStateManager', () => {
  it('throws if build is called before manager is set', () => {
    const state = new SourceStateManager();
    expect(() =>
      state.build({
        listingContent: '',
        listingPath: '/tmp/test.lst',
        sourceRoots: [],
        extraListings: [],
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
        sourceFile: args.sourceFile ?? args.listingPath,
        sourceRoots: args.sourceRoots,
        extraListingPaths: args.extraListings,
        mapping: { segments: [], anchors: [] },
        mappingIndex: emptyIndex,
        missingSources: [],
      }),
      collectRomSources: (extraListingPaths) => [
        { label: 'listing', path: extraListingPaths[0] ?? '', kind: 'listing' },
        { label: 'source', path: `${extraListingPaths[0] ?? ''}.asm`, kind: 'source' },
      ],
    };

    const state = new SourceStateManager();
    state.setManager(manager);

    const listingPath = '/tmp/test.lst';
    const extraListings = ['extra.lst'];
    const build = state.build({
      listingContent: '',
      listingPath,
      sourceRoots: ['src'],
      extraListings,
      mapArgs: {},
    });

    expect(build.sourceFile).toBe(listingPath);
    expect(build.extraListingPaths).toContain('extra.lst');

    const sources = state.collectRomSources([listingPath]);
    expect(sources.map((entry) => entry.kind)).toEqual(['listing', 'source']);
  });
});
