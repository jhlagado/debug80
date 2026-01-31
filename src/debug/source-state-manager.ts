/**
 * @fileoverview Source state manager for the debug adapter.
 */

import type { SourceMapAnchor } from '../mapping/parser';
import type { BuildSourceStateArgs, SourceManagerState } from './source-manager';

export type SourceState = {
  sourceRoots: string[];
  extraListingPaths: string[];
  mapping: SourceManagerState['mapping'];
  mappingIndex: SourceManagerState['mappingIndex'];
};

type BuildResult = SourceState & { sourceFile: string };

export type SourceManagerLike = {
  buildState: (args: BuildSourceStateArgs) => SourceManagerState;
  collectRomSources: (
    extraListingPaths: string[]
  ) => Array<{ label: string; path: string; kind: 'listing' | 'source' }>;
};

/**
 * Tracks source mapping state and the current source file/anchors.
 */
export class SourceStateManager {
  manager: SourceManagerLike | undefined;
  file = '';
  lookupAnchors: SourceMapAnchor[] = [];

  setManager(manager: SourceManagerLike): void {
    this.manager = manager;
  }

  build(options: BuildSourceStateArgs): BuildResult {
    if (!this.manager) {
      throw new Error('SourceStateManager: SourceManager not initialized');
    }
    const state = this.manager.buildState(options);
    this.file = state.sourceFile;
    return {
      sourceRoots: state.sourceRoots,
      extraListingPaths: state.extraListingPaths,
      mapping: state.mapping,
      mappingIndex: state.mappingIndex,
      sourceFile: state.sourceFile,
    };
  }

  collectRomSources(extraListingPaths: string[]): Array<{ label: string; path: string; kind: 'listing' | 'source' }> {
    if (!this.manager) {
      return [];
    }
    return this.manager.collectRomSources(extraListingPaths);
  }
}
