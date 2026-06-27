/**
 * @fileoverview Mapping and debug-map helpers for the debug adapter.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  MappingParseResult,
  SourceAddressSpace,
  SourceMapAnchor,
  SourceMapSegment,
} from '../../mapping/types';
import {
  propagateMisassignedIncludeSegments,
  remapMisassignedIncludeAnchors,
  syncSegmentLocationsFromAnchors,
} from '../../mapping/include-remap';
import {
  buildSourceMapIndex,
  SourceMapIndex,
  ResolvePathFn,
  setSegmentWarningHandler,
} from '../../mapping/source-map';
import {
  buildD8DebugMap,
  buildMappingFromD8DebugMap,
  D8DebugMap,
  parseD8DebugMap,
} from '../../mapping/d8-map';
import { validateD8Segments } from '../../mapping/d8-validate';
import { Logger } from '../../util/logger';

export interface MappingServiceOptions {
  platform: string;
  baseDir: string;
  resolveMappedPath: ResolvePathFn;
  relativeIfPossible: (filePath: string, baseDir: string) => string;
  resolveDebugMapPath: (
    args: {
      artifactBase?: string;
      outputDir?: string;
    },
    baseDir: string,
    asmPath: string | undefined,
    hexPath: string
  ) => string;
  logger: Logger;
}

export interface MappingBuildResult {
  mapping: MappingParseResult;
  index: SourceMapIndex;
  missingSources: string[];
}

function loadFirstExistingDebugMap(
  candidates: string[],
  service: MappingServiceOptions
): { map: D8DebugMap | undefined; pathUsed: string | undefined } {
  for (const p of candidates) {
    const m = loadDebugMap(p, service);
    if (m !== undefined) {
      return { map: m, pathUsed: p };
    }
  }
  return { map: undefined, pathUsed: undefined };
}

/**
 * Loads the native D8 map for the current target.
 */
export function buildMappingFromDebugMap(options: {
  hexPath: string;
  asmPath?: string;
  sourceFile?: string;
  mapArgs: { artifactBase?: string; outputDir?: string };
  auxiliaryDebugMaps?: string[];
  debugMapAddressSpaces?: Record<string, SourceAddressSpace>;
  service: MappingServiceOptions;
}): MappingBuildResult {
  const {
    hexPath,
    asmPath,
    sourceFile,
    mapArgs,
    auxiliaryDebugMaps = [],
    debugMapAddressSpaces = {},
    service,
  } = options;
  void sourceFile;

  const mapPath = service.resolveDebugMapPath(mapArgs, service.baseDir, asmPath, hexPath);
  const { map: loadedMap, pathUsed: debugMapLoadedFrom } = loadFirstExistingDebugMap(
    [mapPath],
    service
  );
  const hasNativeMap = loadedMap !== undefined && isNativeDebugMap(loadedMap);
  if (hasNativeMap) {
    service.logger.info(
      `Debug80: Source map loaded: ${formatMapDisplayPath(debugMapLoadedFrom ?? mapPath, service)} (${getDebugMapGeneratorLabel(loadedMap)}, target).`
    );
    const d8Warnings = validateD8Segments(loadedMap);
    for (const w of d8Warnings) {
      service.logger.warn(`Debug80: D8 quality warning [${w.file}]: ${w.message}`);
    }
  }
  if (loadedMap !== undefined && !hasNativeMap) {
    service.logger.warn(
      `Debug80: Ignoring non-native source map: ${formatMapDisplayPath(debugMapLoadedFrom ?? mapPath, service)}. Build the selected target with AZM to regenerate it.`
    );
  }
  if (loadedMap === undefined) {
    service.logger.warn(
      `Debug80: Source map missing: ${formatMapDisplayPath(mapPath, service)}. Build the selected target with AZM to generate it.`
    );
  }

  const mapping =
    hasNativeMap && loadedMap !== undefined
      ? buildMappingFromD8DebugMap(loadedMap)
      : emptyMapping();

  let auxiliaryLoadedCount = 0;
  for (const auxiliaryPath of auxiliaryDebugMaps) {
    const auxiliaryMap = loadDebugMap(auxiliaryPath, service);
    if (auxiliaryMap === undefined) {
      service.logger.warn(
        `Debug80: Platform source map missing: ${formatMapDisplayPath(auxiliaryPath, service)}. ROM source mapping may be unavailable.`
      );
      continue;
    }
    if (!isNativeDebugMap(auxiliaryMap)) {
      service.logger.warn(
        `Debug80: Ignoring non-native platform source map: ${formatMapDisplayPath(auxiliaryPath, service)}.`
      );
      continue;
    }
    auxiliaryLoadedCount += 1;
    service.logger.info(
      `Debug80: Source map loaded: ${formatMapDisplayPath(auxiliaryPath, service)} (${getDebugMapGeneratorLabel(auxiliaryMap)}, platform ROM).`
    );
    const auxiliaryMapping = withAddressSpace(
      buildMappingFromD8DebugMap(
      resolveAuxiliaryDebugMapFiles(auxiliaryMap, auxiliaryPath, (file) =>
        service.resolveMappedPath(file)
      )
      ),
      debugMapAddressSpaces[path.normalize(auxiliaryPath)]
    );
    mapping.segments.push(...auxiliaryMapping.segments);
    mapping.anchors.push(...auxiliaryMapping.anchors);
  }

  if (service.platform === 'tec1g') {
    applyTec1gBootstrapAlias(mapping);
  }

  // Some assemblers still attribute many
  // labels to an include parent (e.g. packages.z80 vs glcd_library.z80). Remap, propagate
  // segment files across the whole included routine, then sync anchor lines onto segment starts.
  const includeAnchorRemaps = remapMisassignedIncludeAnchors(mapping.anchors, (file) =>
    service.resolveMappedPath(file)
  );
  propagateMisassignedIncludeSegments(mapping, includeAnchorRemaps, (file) =>
    service.resolveMappedPath(file)
  );
  syncSegmentLocationsFromAnchors(mapping, new Set(includeAnchorRemaps.map((r) => r.address)));

  setSegmentWarningHandler((msg) => service.logger.warn(`Debug80: ${msg}`));

  const index = buildSourceMapIndex(mapping, (file) => service.resolveMappedPath(file));
  const mappedFileCount = countMappedFiles(mapping.segments);
  const mapSources = [
    hasNativeMap ? 'target' : undefined,
    auxiliaryLoadedCount > 0
      ? `${formatCount(auxiliaryLoadedCount)} platform ROM ${auxiliaryLoadedCount === 1 ? 'map' : 'maps'}`
      : undefined,
  ].filter((value): value is string => value !== undefined);

  service.logger.info(
    `Debug80: Source mapping ready: ${formatCount(index.segmentsByAddress.length)} executable ranges across ` +
      `${formatCount(mappedFileCount)} files; ${formatCount(mapping.anchors.length)} anchors` +
      `${mapSources.length > 0 ? ` (${mapSources.join(', ')})` : ''}.`
  );

  return { mapping, index, missingSources: [] };
}

function withAddressSpace(
  mapping: MappingParseResult,
  addressSpace: SourceAddressSpace | undefined
): MappingParseResult {
  if (addressSpace === undefined) {
    return mapping;
  }
  return {
    segments: mapping.segments.map((segment) => ({ ...segment, addressSpace })),
    anchors: mapping.anchors.map((anchor) => ({ ...anchor, addressSpace })),
  };
}

function formatMapDisplayPath(mapPath: string, service: MappingServiceOptions): string {
  const relative = service.relativeIfPossible(mapPath, service.baseDir);
  if (relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative;
  }
  return path.basename(mapPath);
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

function countMappedFiles(segments: SourceMapSegment[]): number {
  const fileSet = new Set<string>();
  for (const seg of segments) {
    if (seg.loc.file !== null) {
      fileSet.add(seg.loc.file);
    }
  }
  return fileSet.size;
}

function resolveAuxiliaryDebugMapFiles(
  map: D8DebugMap,
  mapPath: string,
  resolveMappedPath: (file: string) => string | undefined
): D8DebugMap {
  const baseDir = path.dirname(mapPath);
  const files: D8DebugMap['files'] = {};
  for (const [fileKey, entry] of Object.entries(map.files)) {
    const absoluteKey =
      path.isAbsolute(fileKey) || fileKey.startsWith('file:')
        ? fileKey
        : (resolveMappedPath(fileKey) ?? path.join(baseDir, fileKey));
    files[absoluteKey] = entry;
  }
  return { ...map, files };
}

function loadDebugMap(
  mapPath: string,
  service: MappingServiceOptions
): ReturnType<typeof buildD8DebugMap> | undefined {
  if (!fs.existsSync(mapPath)) {
    return undefined;
  }
  try {
    const raw = fs.readFileSync(mapPath, 'utf-8');
    const { map, error } = parseD8DebugMap(raw);
    if (!map) {
      const prefix = `Debug80 [${service.platform}]`;
      service.logger.warn(
        `${prefix}: Invalid D8 debug map at "${mapPath}". Build the selected target with AZM to regenerate it. (${error})`
      );
      return undefined;
    }
    return map;
  } catch (err) {
    const prefix = `Debug80 [${service.platform}]`;
    service.logger.error(
      `${prefix}: Failed to read D8 debug map at "${mapPath}". Build the selected target with AZM to regenerate it. (${String(err)})`
    );
    return undefined;
  }
}

export function isNativeDebugMap(map: D8DebugMap): boolean {
  const generator = map.generator;
  if (generator === undefined) {
    return true;
  }

  const generatorName = normalizeGeneratorIdentity(generator.name);
  if (generatorName === 'debug80') {
    return false;
  }

  const generatorTool = normalizeGeneratorIdentity(generator.tool);
  if (generatorTool === 'debug80') {
    return false;
  }

  return true;
}

function getDebugMapGeneratorLabel(map: D8DebugMap): string {
  const generator = map.generator;
  const generatorName = generator?.name?.trim();
  if (typeof generatorName === 'string' && generatorName.length > 0) {
    return generatorName;
  }

  const generatorTool = generator?.tool?.trim();
  return typeof generatorTool === 'string' && generatorTool.length > 0
    ? generatorTool
    : 'unknown generator';
}

function normalizeGeneratorIdentity(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function emptyMapping(): MappingParseResult {
  return { segments: [], anchors: [] };
}

function applyTec1gBootstrapAlias(mapping: MappingParseResult): void {
  const shadowStart = 0xc000;
  const shadowEnd = 0xc100;
  const lowStart = 0x0000;
  const lowEnd = 0x0100;

  const lowRangeFiles = new Set<string>();
  for (const segment of mapping.segments) {
    if (segment.loc.file === null) {
      continue;
    }
    if (segment.start < lowEnd && segment.end > lowStart) {
      lowRangeFiles.add(segment.loc.file);
    }
  }

  const aliasedSegments: SourceMapSegment[] = [];
  for (const segment of mapping.segments) {
    if (segment.loc.file === null) {
      continue;
    }
    if (segment.start >= shadowEnd || segment.end <= shadowStart) {
      continue;
    }
    if (lowRangeFiles.has(segment.loc.file)) {
      continue;
    }
    const sliceStart = Math.max(segment.start, shadowStart);
    const sliceEnd = Math.min(segment.end, shadowEnd);
    if (sliceEnd <= sliceStart) {
      continue;
    }
    aliasedSegments.push({
      ...segment,
      start: sliceStart - shadowStart,
      end: sliceEnd - shadowStart,
    });
  }

  if (aliasedSegments.length > 0) {
    mapping.segments.push(...aliasedSegments);
  }

  const lowAnchorFiles = new Set<string>();
  for (const anchor of mapping.anchors) {
    if (anchor.address >= lowStart && anchor.address < lowEnd) {
      lowAnchorFiles.add(anchor.file);
    }
  }

  const aliasedAnchors: SourceMapAnchor[] = [];
  for (const anchor of mapping.anchors) {
    if (anchor.address < shadowStart || anchor.address >= shadowEnd) {
      continue;
    }
    if (lowAnchorFiles.has(anchor.file)) {
      continue;
    }
    aliasedAnchors.push({
      ...anchor,
      address: anchor.address - shadowStart,
    });
  }

  if (aliasedAnchors.length > 0) {
    mapping.anchors.push(...aliasedAnchors);
  }
}
