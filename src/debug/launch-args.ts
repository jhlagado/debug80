/**
 * @fileoverview Launch argument resolution and config merging helpers.
 */

import * as fs from 'fs';
import * as path from 'path';
import { LaunchRequestArguments } from './types';
import type { PlatformKind } from './program-loader';
import { isPathWithin } from './path-utils';

export interface LaunchArgsHelpers {
  resolveBaseDir: (args: LaunchRequestArguments) => string;
  resolveAsmPath: (asm: string | undefined, baseDir: string) => string | undefined;
  resolveRelative: (filePath: string, baseDir: string) => string;
  resolveCacheDir: (baseDir: string) => string | undefined;
  buildListingCacheKey: (listingPath: string) => string;
  relativeIfPossible: (filePath: string, baseDir: string) => string;
}

export function normalizePlatformName(args: LaunchRequestArguments): PlatformKind {
  const raw = args.platform ?? 'simple';
  const name = raw.trim().toLowerCase();
  if (name === '') {
    return 'simple';
  }
  if (name !== 'simple' && name !== 'tec1' && name !== 'tec1g') {
    throw new Error(`Unsupported platform "${raw}".`);
  }
  return name;
}

export function populateFromConfig(
  args: LaunchRequestArguments,
  helpers: Pick<LaunchArgsHelpers, 'resolveBaseDir'>
): LaunchRequestArguments {
  const configCandidates: string[] = [];

  if (args.projectConfig !== undefined && args.projectConfig !== '') {
    configCandidates.push(args.projectConfig);
  }
  configCandidates.push('debug80.json');
  configCandidates.push('.debug80.json');
  configCandidates.push(path.join('.vscode', 'debug80.json'));

  const workspaceRoot = helpers.resolveBaseDir(args);
  const startDir =
    args.asm !== undefined && args.asm !== ''
      ? path.dirname(args.asm)
      : args.sourceFile !== undefined && args.sourceFile !== ''
        ? path.dirname(args.sourceFile)
        : workspaceRoot;

  const dirsToCheck: string[] = [];
  for (let dir = startDir; ; ) {
    dirsToCheck.push(dir);
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  let configPath: string | undefined;
  for (const dir of dirsToCheck) {
    for (const candidate of configCandidates) {
      const full = path.isAbsolute(candidate) ? candidate : path.join(dir, candidate);
      if (fs.existsSync(full)) {
        configPath = full;
        break;
      }
    }
    if (configPath !== undefined) {
      break;
    }
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkgRaw = fs.readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(pkgRaw) as { debug80?: unknown };
        if (pkg.debug80 !== undefined) {
          configPath = pkgPath;
          break;
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (configPath === undefined) {
    return args;
  }

  try {
    let cfg: {
      defaultTarget?: string;
      targets?: Record<
        string,
        Partial<LaunchRequestArguments> & { sourceFile?: string; source?: string }
      >;
    } & (Partial<LaunchRequestArguments> & { sourceFile?: string; source?: string });

    if (configPath.endsWith('package.json')) {
      const pkgRaw = fs.readFileSync(configPath, 'utf-8');
      const pkg = JSON.parse(pkgRaw) as { debug80?: unknown };
      cfg =
        (pkg.debug80 as typeof cfg) ??
        ({
          targets: {},
        } as typeof cfg);
    } else {
      const raw = fs.readFileSync(configPath, 'utf-8');
      cfg = JSON.parse(raw) as typeof cfg;
    }

    const targets = cfg.targets ?? {};
    const targetName = args.target ?? cfg.target ?? cfg.defaultTarget ?? Object.keys(targets)[0];
    const targetCfg = (targetName !== undefined ? targets[targetName] : undefined) ?? undefined;

    const merged: LaunchRequestArguments = {
      ...cfg,
      ...targetCfg,
      ...args,
    };

    const asmResolved =
      args.asm ??
      args.sourceFile ??
      targetCfg?.asm ??
      targetCfg?.sourceFile ??
      targetCfg?.source ??
      cfg.asm ??
      cfg.sourceFile ??
      cfg.source;
    if (asmResolved !== undefined) {
      merged.asm = asmResolved;
    }

    const sourceResolved =
      args.sourceFile ??
      args.asm ??
      targetCfg?.sourceFile ??
      targetCfg?.asm ??
      targetCfg?.source ??
      cfg.sourceFile ??
      cfg.asm ??
      cfg.source;
    if (sourceResolved !== undefined) {
      merged.sourceFile = sourceResolved;
    }

    const hexResolved = args.hex ?? targetCfg?.hex ?? cfg.hex;
    if (hexResolved !== undefined) {
      merged.hex = hexResolved;
    }

    const listingResolved = args.listing ?? targetCfg?.listing ?? cfg.listing;
    if (listingResolved !== undefined) {
      merged.listing = listingResolved;
    }

    const outputDirResolved = args.outputDir ?? targetCfg?.outputDir ?? cfg.outputDir;
    if (outputDirResolved !== undefined) {
      merged.outputDir = outputDirResolved;
    }

    const artifactResolved = args.artifactBase ?? targetCfg?.artifactBase ?? cfg.artifactBase;
    if (artifactResolved !== undefined) {
      merged.artifactBase = artifactResolved;
    }

    const entryResolved = args.entry ?? targetCfg?.entry ?? cfg.entry;
    if (entryResolved !== undefined) {
      merged.entry = entryResolved;
    }

    const platformResolved = args.platform ?? targetCfg?.platform ?? cfg.platform;
    if (platformResolved !== undefined) {
      merged.platform = platformResolved;
    }

    const simpleResolved = args.simple ?? targetCfg?.simple ?? cfg.simple;
    if (simpleResolved !== undefined) {
      merged.simple = simpleResolved;
    }

    const stopOnEntryResolved = args.stopOnEntry ?? targetCfg?.stopOnEntry ?? cfg.stopOnEntry;
    if (stopOnEntryResolved !== undefined) {
      merged.stopOnEntry = stopOnEntryResolved;
    }

    const assembleResolved = args.assemble ?? targetCfg?.assemble ?? cfg.assemble;
    if (assembleResolved !== undefined) {
      merged.assemble = assembleResolved;
    }

    const sourceRootsResolved = args.sourceRoots ?? targetCfg?.sourceRoots ?? cfg.sourceRoots;
    if (sourceRootsResolved !== undefined) {
      merged.sourceRoots = sourceRootsResolved;
    }

    const stepOverResolved =
      args.stepOverMaxInstructions ??
      targetCfg?.stepOverMaxInstructions ??
      cfg.stepOverMaxInstructions;
    if (stepOverResolved !== undefined) {
      merged.stepOverMaxInstructions = stepOverResolved;
    }

    const stepOutResolved =
      args.stepOutMaxInstructions ??
      targetCfg?.stepOutMaxInstructions ??
      cfg.stepOutMaxInstructions;
    if (stepOutResolved !== undefined) {
      merged.stepOutMaxInstructions = stepOutResolved;
    }

    const targetResolved = targetName ?? args.target;
    if (targetResolved !== undefined) {
      merged.target = targetResolved;
    }

    return merged;
  } catch {
    return args;
  }
}

export function resolveDebugMapPath(
  args: LaunchRequestArguments,
  baseDir: string,
  asmPath: string | undefined,
  listingPath: string,
  helpers: Pick<LaunchArgsHelpers, 'resolveCacheDir' | 'buildListingCacheKey' | 'resolveRelative'>
): string {
  const artifactBase =
    args.artifactBase ??
    (asmPath === undefined
      ? path.basename(listingPath, '.lst')
      : path.basename(asmPath, path.extname(asmPath)));
  const cacheDir = helpers.resolveCacheDir(baseDir);
  if (cacheDir !== undefined && cacheDir.length > 0) {
    const key = helpers.buildListingCacheKey(listingPath);
    return path.join(cacheDir, `${artifactBase}.${key}.d8dbg.json`);
  }
  const outDirRaw = args.outputDir ?? path.dirname(listingPath);
  const outDir = helpers.resolveRelative(outDirRaw, baseDir);
  return path.join(outDir, `${artifactBase}.d8dbg.json`);
}

export function resolveExtraDebugMapPath(
  listingPath: string,
  helpers: Pick<LaunchArgsHelpers, 'resolveCacheDir' | 'buildListingCacheKey'>
): string {
  const base = path.basename(listingPath, path.extname(listingPath));
  const cacheDir = helpers.resolveCacheDir(path.dirname(listingPath));
  if (cacheDir !== undefined && cacheDir.length > 0) {
    const key = helpers.buildListingCacheKey(listingPath);
    return path.join(cacheDir, `${base}.${key}.d8dbg.json`);
  }
  const dir = path.dirname(listingPath);
  return path.join(dir, `${base}.d8dbg.json`);
}

export function resolveRelative(filePath: string, baseDir: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.resolve(baseDir, filePath);
}

export function normalizeSourcePath(sourcePath: string, baseDir: string): string {
  if (path.isAbsolute(sourcePath)) {
    return path.resolve(sourcePath);
  }
  return path.resolve(baseDir, sourcePath);
}

export function resolveArtifacts(
  args: LaunchRequestArguments,
  baseDir: string,
  helpers: Pick<LaunchArgsHelpers, 'resolveAsmPath' | 'resolveRelative'>
): { hexPath: string; listingPath: string; asmPath?: string | undefined } {
  const asmPath = helpers.resolveAsmPath(args.asm, baseDir);

  let hexPath = args.hex;
  let listingPath = args.listing;

  const hexMissing = hexPath === undefined || hexPath === '';
  const listingMissing = listingPath === undefined || listingPath === '';

  if (hexMissing || listingMissing) {
    if (asmPath === undefined || asmPath === '') {
      throw new Error(
        'Z80 runtime requires "asm" (root asm file) or explicit "hex" and "listing" paths.'
      );
    }
    const artifactBase = args.artifactBase ?? path.basename(asmPath, path.extname(asmPath));
    const outDirRaw = args.outputDir ?? path.dirname(asmPath);
    const outDir = helpers.resolveRelative(outDirRaw, baseDir);
    hexPath = path.join(outDir, `${artifactBase}.hex`);
    listingPath = path.join(outDir, `${artifactBase}.lst`);
  }

  if (
    hexPath === undefined ||
    listingPath === undefined ||
    hexPath === '' ||
    listingPath === ''
  ) {
    throw new Error('Z80 runtime requires resolvable HEX and LST paths.');
  }

  const hexAbs = helpers.resolveRelative(hexPath, baseDir);
  const listingAbs = helpers.resolveRelative(listingPath, baseDir);

  return { hexPath: hexAbs, listingPath: listingAbs, asmPath };
}

export function relativeIfPossible(filePath: string, baseDir: string): string {
  const normalizedBase = path.resolve(baseDir);
  const normalizedPath = path.resolve(filePath);
  if (isPathWithin(normalizedPath, normalizedBase)) {
    return path.relative(normalizedBase, normalizedPath) || normalizedPath;
  }
  return normalizedPath;
}

export function resolveAsmPath(asm: string | undefined, baseDir: string): string | undefined {
  if (asm === undefined || asm === '') {
    return undefined;
  }
  if (path.isAbsolute(asm)) {
    return asm;
  }
  return path.resolve(baseDir, asm);
}

export function resolveBaseDir(args: LaunchRequestArguments): string {
  const workspace = process.cwd();
  if (args.projectConfig !== undefined && args.projectConfig !== '') {
    const cfgPath = path.isAbsolute(args.projectConfig)
      ? args.projectConfig
      : path.join(workspace, args.projectConfig);

    if (cfgPath.startsWith(workspace)) {
      return workspace;
    }

    return path.dirname(cfgPath);
  }
  return workspace;
}
