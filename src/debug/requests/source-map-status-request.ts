/**
 * @fileoverview Source-map diagnostics for Debug80 custom requests.
 */

import * as fs from 'fs';
import { findSegmentForAddress } from '../../mapping/source-map';
import { getTec1gExpansionAddressSpace } from '../mapping/debug-addressing';
import { resolveArtifacts, resolveDebugMapPath, resolveMappedPath } from '../mapping/path-resolver';
import type { SessionStateShape } from '../session/session-state';

export interface SourceMapStatusMapEntry {
  path: string;
  exists: boolean;
}

export interface SourceMapStatus {
  targetMap?: SourceMapStatusMapEntry;
  auxiliaryMaps: SourceMapStatusMapEntry[];
  counts: {
    sourceFiles: number;
    symbols: number;
    segments: number;
    anchors: number;
  };
  currentPc?: {
    address: number;
    mapsToSource: boolean;
    source?: {
      path: string;
      line: number;
    };
  };
}

export function buildSourceMapStatus(sessionState: SessionStateShape): SourceMapStatus {
  const launchArgs = sessionState.launch.launchArgs;
  const status: SourceMapStatus = {
    auxiliaryMaps: (launchArgs?.debugMaps ?? []).map((mapPath) => ({
      path: mapPath,
      exists: fs.existsSync(mapPath),
    })),
    counts: {
      sourceFiles: countSourceFiles(sessionState),
      symbols: sessionState.source.sourceMapSymbols.length,
      segments: sessionState.source.mapping?.segments.length ?? 0,
      anchors: sessionState.source.mapping?.anchors.length ?? 0,
    },
  };

  if (launchArgs !== undefined) {
    const targetMap = resolveTargetMapPath(sessionState);
    if (targetMap !== undefined) {
      status.targetMap = {
        path: targetMap,
        exists: fs.existsSync(targetMap),
      };
    }
  }

  const runtime = sessionState.runtimeState.execution;
  const mappingIndex = sessionState.source.mappingIndex;
  if (runtime !== undefined) {
    const pc = runtime.getPC() & 0xffff;
    const pcStatus: NonNullable<SourceMapStatus['currentPc']> = {
      address: pc,
      mapsToSource: false,
    };
    if (mappingIndex !== undefined) {
      const segment = findSegmentForAddress(
        mappingIndex,
        pc,
        getTec1gExpansionAddressSpace(pc, {
          activePlatform: launchArgs?.platform ?? '',
          tec1gRuntime: sessionState.tec1gRuntime,
        })
      );
      const line = segment?.loc.line;
      if (
        segment?.loc.file !== null &&
        segment?.loc.file !== undefined &&
        line !== null &&
        line !== undefined &&
        line >= 1
      ) {
        const resolved = resolveMappedPath(
          segment.loc.file,
          undefined,
          sessionState.source.sourceRoots
        );
        if (resolved !== undefined) {
          pcStatus.mapsToSource = true;
          pcStatus.source = { path: resolved, line };
        }
      }
    }
    status.currentPc = pcStatus;
  }

  return status;
}

function resolveTargetMapPath(sessionState: SessionStateShape): string | undefined {
  const launchArgs = sessionState.launch.launchArgs;
  if (launchArgs === undefined) {
    return undefined;
  }
  try {
    const artifacts = resolveArtifacts(launchArgs, sessionState.launch.baseDir);
    return resolveDebugMapPath(
      launchArgs,
      sessionState.launch.baseDir,
      artifacts.asmPath,
      artifacts.hexPath
    );
  } catch {
    return undefined;
  }
}

function countSourceFiles(sessionState: SessionStateShape): number {
  const files = new Set<string>();
  for (const segment of sessionState.source.mapping?.segments ?? []) {
    if (segment.loc.file !== null) {
      files.add(segment.loc.file);
    }
  }
  for (const symbol of sessionState.source.sourceMapSymbols) {
    if (symbol.file.length > 0) {
      files.add(symbol.file);
    }
  }
  return files.size;
}
