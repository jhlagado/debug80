/**
 * @fileoverview Mapping and debug-map helpers for the debug adapter.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as asm80Module from 'asm80/asm.js';
import * as asm80Monolith from 'asm80/monolith.js';
import {
  MappingParseResult,
  SourceMapAnchor,
  SourceMapSegment,
  parseMapping,
} from '../mapping/parser';
import { resolveListingSourcePath } from './path-resolver';
import { applyLayer2 } from '../mapping/layer2';
import {
  buildSourceMapIndex,
  SourceMapIndex,
  ResolvePathFn,
} from '../mapping/source-map';
import {
  buildD8DebugMap,
  buildMappingFromD8DebugMap,
  parseD8DebugMap,
} from '../mapping/d8-map';

export interface MappingServiceOptions {
  platform: string;
  baseDir: string;
  resolveMappedPath: ResolvePathFn;
  relativeIfPossible: (filePath: string, baseDir: string) => string;
  resolveExtraDebugMapPath: (listingPath: string) => string;
  resolveDebugMapPath: (
    args: {
      artifactBase?: string;
      outputDir?: string;
    },
    baseDir: string,
    asmPath: string | undefined,
    listingPath: string
  ) => string;
  log: (message: string) => void;
}

export interface MappingBuildResult {
  mapping: MappingParseResult;
  index: SourceMapIndex;
  missingSources: string[];
}

/**
 * Builds (or loads) a mapping for a primary listing file and any extra listings.
 */
export function buildMappingFromListing(options: {
  listingContent: string;
  listingPath: string;
  asmPath?: string;
  sourceFile?: string;
  extraListingPaths: string[];
  mapArgs: { artifactBase?: string; outputDir?: string };
  service: MappingServiceOptions;
}): MappingBuildResult {
  const {
    listingContent,
    listingPath,
    asmPath,
    sourceFile,
    extraListingPaths,
    mapArgs,
    service,
  } = options;

  const mapPath = service.resolveDebugMapPath(mapArgs, service.baseDir, asmPath, listingPath);
  const mapStale = isDebugMapStale(mapPath, listingPath);
  if (mapStale) {
    service.log('Debug80: D8 debug map is older than the LST. Regenerating from LST.');
  }

  let debugMap = mapStale ? undefined : loadDebugMap(mapPath, service);
  let missingSources: string[] = [];

  if (!debugMap) {
    const baseMapping = parseListingMapping(listingContent);
    applySourceFallback(baseMapping, sourceFile, service.baseDir, service.resolveMappedPath);
    const layer2 = applyLayer2(baseMapping, {
      resolvePath: (file) => service.resolveMappedPath(file),
    });
    missingSources = layer2.missingSources;
    if (missingSources.length > 0) {
      const unique = Array.from(new Set(missingSources));
      service.log(`Debug80: Missing source files for Layer 2 mapping: ${unique.join(', ')}`);
    }
    debugMap = buildD8DebugMap(baseMapping, {
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
      generator: { name: 'debug80' },
    });
    writeDebugMap(debugMap, mapPath, service, listingPath);
  }

  let mapping = buildMappingFromD8DebugMap(debugMap);
  const extraMapping = loadExtraListingMapping(extraListingPaths, service);
  if (extraMapping) {
    mapping = mergeMappings(mapping, extraMapping);
  }
  if (service.platform === 'tec1g') {
    applyTec1gBootstrapAlias(mapping);
  }

  const index = buildSourceMapIndex(mapping, (file) => service.resolveMappedPath(file));
  return { mapping, index, missingSources };
}

function parseListingMapping(listingContent: string): MappingParseResult {
  return parseMapping(listingContent);
}

function isDebugMapStale(mapPath: string, listingPath: string): boolean {
  if (!fs.existsSync(mapPath) || !fs.existsSync(listingPath)) {
    return false;
  }
  try {
    const mapStat = fs.statSync(mapPath);
    const listingStat = fs.statSync(listingPath);
    return listingStat.mtimeMs > mapStat.mtimeMs;
  } catch {
    return false;
  }
}

function applySourceFallback(
  mapping: MappingParseResult,
  sourceFile: string | undefined,
  baseDir: string,
  resolveMappedPath: ResolvePathFn
): void {
  if (sourceFile === undefined || sourceFile.length === 0) {
    return;
  }
  const fallback = resolveMappedPath(sourceFile) ?? path.resolve(baseDir, sourceFile);
  if (fallback.length === 0) {
    return;
  }
  for (const segment of mapping.segments) {
    const current = segment.loc.file;
    if (current === null) {
      segment.loc.file = fallback;
      continue;
    }
    const resolved = resolveMappedPath(current) ?? path.resolve(baseDir, current);
    if (!fs.existsSync(resolved)) {
      segment.loc.file = fallback;
    }
  }
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
      service.log(
        `${prefix}: Invalid D8 debug map at "${mapPath}". Regenerating from LST. (${error})`
      );
      return undefined;
    }
    return map;
  } catch (err) {
    const prefix = `Debug80 [${service.platform}]`;
    service.log(
      `${prefix}: Failed to read D8 debug map at "${mapPath}". Regenerating from LST. (${String(err)})`
    );
    return undefined;
  }
}

function writeDebugMap(
  map: ReturnType<typeof buildD8DebugMap>,
  mapPath: string,
  service: MappingServiceOptions,
  listingPath: string
): void {
  try {
    fs.mkdirSync(path.dirname(mapPath), { recursive: true });
    const enriched = {
      ...map,
      generator: {
        ...map.generator,
        inputs: {
          listing: service.relativeIfPossible(listingPath, service.baseDir),
        },
      },
    };
    fs.writeFileSync(mapPath, JSON.stringify(enriched, null, 2));
  } catch (err) {
    service.log(`Debug80: Failed to write D8 debug map: ${String(err)}`);
  }
}

function loadExtraListingMapping(
  listingPaths: string[],
  service: MappingServiceOptions
): MappingParseResult | undefined {
  if (listingPaths.length === 0) {
    return undefined;
  }
  const combined: MappingParseResult = { segments: [], anchors: [] };
  for (const listingPath of listingPaths) {
    try {
      const mapPath = service.resolveExtraDebugMapPath(listingPath);
      const mapStale = isDebugMapStale(mapPath, listingPath);
      if (mapStale) {
        const prefix = `Debug80 [${service.platform}]`;
        service.log(
          `${prefix}: D8 debug map for extra listing is older than the LST. Regenerating (${listingPath}).`
        );
      }

      let debugMap = !mapStale && fs.existsSync(mapPath) ? loadDebugMap(mapPath, service) : undefined;
      if (debugMap) {
        const mapping = buildMappingFromD8DebugMap(debugMap);
        combined.segments.push(...mapping.segments);
        combined.anchors.push(...mapping.anchors);
        continue;
      }

      const mapping = buildExtraListingMapping(listingPath, service);
      if (!mapping) {
        continue;
      }
      combined.segments.push(...mapping.segments);
      combined.anchors.push(...mapping.anchors);
      debugMap = buildD8DebugMap(mapping, {
        arch: 'z80',
        addressWidth: 16,
        endianness: 'little',
        generator: { name: 'debug80' },
      });
      writeDebugMap(debugMap, mapPath, service, listingPath);
    } catch (err) {
      const prefix = `Debug80 [${service.platform}]`;
      service.log(`${prefix}: failed to read extra listing "${listingPath}": ${String(err)}`);
    }
  }
  if (combined.segments.length === 0 && combined.anchors.length === 0) {
    return undefined;
  }
  return combined;
}

function buildExtraListingMapping(
  listingPath: string,
  service: MappingServiceOptions
): MappingParseResult | undefined {
  const fallbackSource = resolveListingSourcePath(listingPath);
  if (typeof fallbackSource === 'string' && fallbackSource.length > 0) {
    const asmMapping = buildAsm80Mapping(fallbackSource, service);
    if (asmMapping) {
      return asmMapping;
    }
  }
  const content = fs.readFileSync(listingPath, 'utf-8');
  const parsed = parseMapping(content);
  if (typeof fallbackSource === 'string' && fallbackSource.length > 0) {
    const hasFile = parsed.segments.some((segment) => segment.loc.file !== null);
    if (!hasFile) {
      for (const segment of parsed.segments) {
        segment.loc.file = fallbackSource;
        segment.loc.line = segment.lst.line;
      }
    }
  }
  return parsed;
}

function mergeMappings(base: MappingParseResult, extra: MappingParseResult): MappingParseResult {
  return {
    segments: [...base.segments, ...extra.segments],
    anchors: [...base.anchors, ...extra.anchors],
  };
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

function buildAsm80Mapping(
  sourcePath: string,
  service: MappingServiceOptions
): MappingParseResult | undefined {
  const baseDir = path.dirname(sourcePath);
  const sourceText = fs.readFileSync(sourcePath, 'utf-8');
  asm80Module.fileGet((file: string, binary?: boolean) => {
    const resolved = path.resolve(baseDir, file);
    if (!fs.existsSync(resolved)) {
      return null;
    }
    return binary === true ? fs.readFileSync(resolved) : fs.readFileSync(resolved, 'utf-8');
  });
  const [err, compiled, symbols] = asm80Module.compile(sourceText, asm80Monolith.Z80);
  if (err !== null && err !== undefined) {
    const message = typeof err === 'object' && err !== null ? JSON.stringify(err) : String(err);
    service.log(`Debug80: asm80 failed to build ROM mapping for "${sourcePath}": ${message}`);
    return undefined;
  }
  const lines = Array.isArray(compiled?.[0]) ? compiled[0] : [];
  const segments: SourceMapSegment[] = [];
  for (const entry of lines) {
    if (typeof entry.addr !== 'number' || !Array.isArray(entry.lens) || entry.lens.length === 0) {
      continue;
    }
    const start = entry.addr & 0xffff;
    const end = Math.min(0x10000, start + entry.lens.length);
    const file =
      typeof entry.includedFile === 'string' && entry.includedFile.length > 0
        ? path.resolve(baseDir, entry.includedFile)
        : sourcePath;
    const lineNumber =
      typeof entry.numline === 'number' && Number.isFinite(entry.numline) ? entry.numline : null;
    segments.push({
      start,
      end,
      loc: { file, line: lineNumber },
      lst: {
        line: typeof entry.numline === 'number' ? entry.numline : 0,
        text: typeof entry.line === 'string' ? entry.line : '',
      },
      confidence: 'HIGH',
    });
  }

  const anchors: SourceMapAnchor[] = [];
  if (symbols !== null && symbols !== undefined) {
    for (const [name, entry] of Object.entries(symbols)) {
      if (!name || name.endsWith('$') || (name[0] === '_' && name[1] === '_')) {
        continue;
      }
      if (typeof entry.value !== 'number' || !Number.isFinite(entry.value)) {
        continue;
      }
      const defined = entry.defined;
      const fileRaw = defined?.file;
      const file =
        typeof fileRaw === 'string' && fileRaw !== '*main*' && fileRaw.length > 0
          ? path.resolve(baseDir, fileRaw)
          : sourcePath;
      const lineNumber =
        typeof defined?.line === 'number' && Number.isFinite(defined.line) ? defined.line : 1;
      anchors.push({
        symbol: name,
        address: entry.value & 0xffff,
        file,
        line: lineNumber,
      });
    }
  }

  if (segments.length === 0 && anchors.length === 0) {
    return undefined;
  }
  return { segments, anchors };
}
