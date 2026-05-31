/**
 * @fileoverview Launch argument resolution and config merging helpers.
 *
 * This file stays at the `src/debug/` top level (rather than `src/debug/launch/`)
 * because it is imported by both `adapter.ts` (the public entry point) and by
 * `src/platforms/manifest.ts`, making it a cross-cutting utility. Moving it into
 * a subdir would require consumers to update their import paths without gaining
 * any structural clarity.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { LaunchRequestArguments } from './session/types';
import type { PlatformKind } from './launch/program-loader';
import type { Tec1gPlatformConfig } from '../platforms/types';

/**
 * Shallow-merge nested platform blocks so a target can override e.g. `tec1g.appStart`
 * without replacing the entire root `tec1g` object (which would drop `romHex` and break MON-3).
 */
function mergeNestedPlatformBlock<T extends object>(
  ...parts: Array<Partial<T> | undefined>
): T | undefined {
  const out: Record<string, unknown> = {};
  for (const p of parts) {
    if (p === undefined || typeof p !== 'object' || Array.isArray(p)) {
      continue;
    }
    Object.assign(out, p as Record<string, unknown>);
  }
  return Object.keys(out).length > 0 ? (out as T) : undefined;
}

type LaunchConfigManifest = Partial<LaunchRequestArguments> & {
  projectPlatform?: string;
  defaultProfile?: string;
  source?: string;
  bundledAssets?: Record<
    string,
    { bundleId?: string; path?: string; destination?: string } | undefined
  >;
  profiles?: Record<
    string,
    | {
        platform?: string;
        bundledAssets?: Record<
          string,
          { bundleId?: string; path?: string; destination?: string } | undefined
        >;
      }
    | undefined
  >;
  targets?: Record<
    string,
    Partial<LaunchRequestArguments> & { sourceFile?: string; source?: string; profile?: string }
  >;
  defaultTarget?: string;
  target?: string;
};

type LaunchTargetConfig = Partial<LaunchRequestArguments> & {
  sourceFile?: string;
  source?: string;
  profile?: string;
};

type BundledAssetReferenceLike = {
  bundleId?: string;
  path?: string;
  destination?: string;
};

type ConfigDiscoveryHelpers = { resolveBaseDir: (args: LaunchRequestArguments) => string };

type LoadedLaunchConfig = {
  path: string;
  manifest: LaunchConfigManifest;
};

type ResolvedLaunchConfig = LoadedLaunchConfig & {
  targetName: string | undefined;
  targetCfg: LaunchTargetConfig | undefined;
};

function normalizeNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : undefined;
}

function normalizePathString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveProfilePlatform(
  profileName: string | undefined,
  cfg: LaunchConfigManifest
): string | undefined {
  const normalizedName = normalizeNonEmptyString(profileName);
  if (normalizedName === undefined) {
    return undefined;
  }
  const profile = cfg.profiles?.[normalizedName];
  return normalizeNonEmptyString(profile?.platform);
}

function resolveBundledAssetReference(
  cfg: LaunchConfigManifest,
  targetCfg: LaunchTargetConfig | undefined,
  assetName: string
): BundledAssetReferenceLike | undefined {
  const profileName =
    normalizeNonEmptyString(targetCfg?.profile) ?? normalizeNonEmptyString(cfg.defaultProfile);
  if (profileName !== undefined) {
    const profileAsset = cfg.profiles?.[profileName]?.bundledAssets?.[assetName];
    if (profileAsset !== undefined) {
      return profileAsset;
    }
  }

  return cfg.bundledAssets?.[assetName];
}

function resolveExtensionBundledAssetPath(
  reference: BundledAssetReferenceLike
): string | undefined {
  const extension = vscode.extensions.getExtension('jhlagado.debug80');
  if (extension === undefined) {
    return undefined;
  }

  const bundleId = normalizePathString(reference.bundleId);
  const assetPath = normalizePathString(reference.path);
  if (bundleId === undefined || assetPath === undefined) {
    return undefined;
  }

  const candidate = path.join(
    extension.extensionPath,
    'resources',
    'bundles',
    ...bundleId.split('/'),
    assetPath
  );
  return fs.existsSync(candidate) ? candidate : undefined;
}

function resolveBundledAssetRuntimePath(
  candidatePath: string | undefined,
  reference: BundledAssetReferenceLike | undefined,
  baseDir: string
): string | undefined {
  const resolvedCandidate =
    candidatePath !== undefined && candidatePath !== ''
      ? path.isAbsolute(candidatePath)
        ? path.normalize(candidatePath)
        : path.resolve(baseDir, candidatePath)
      : undefined;
  if (resolvedCandidate !== undefined && fs.existsSync(resolvedCandidate)) {
    return resolvedCandidate;
  }

  if (reference === undefined) {
    return resolvedCandidate;
  }

  const destination = normalizePathString(reference.destination);
  const resolvedDestination =
    destination !== undefined
      ? path.isAbsolute(destination)
        ? path.normalize(destination)
        : path.resolve(baseDir, destination)
      : undefined;

  const shouldUseBundle =
    resolvedCandidate === undefined ||
    resolvedDestination === undefined ||
    path.normalize(resolvedCandidate) === path.normalize(resolvedDestination);
  if (!shouldUseBundle) {
    return resolvedCandidate;
  }

  return resolveExtensionBundledAssetPath(reference) ?? resolvedCandidate;
}

function inferSiblingDebugMapReference(
  reference: BundledAssetReferenceLike | undefined
): BundledAssetReferenceLike | undefined {
  const bundleId = normalizePathString(reference?.bundleId);
  const assetPath = normalizePathString(reference?.path);
  if (bundleId === undefined || assetPath === undefined) {
    return undefined;
  }
  const parsed = path.parse(assetPath);
  if (parsed.name.length === 0) {
    return undefined;
  }
  const debugMapPath = path.join(parsed.dir, `${parsed.name}.d8.json`);
  const destination = normalizePathString(reference?.destination);
  return {
    bundleId,
    path: debugMapPath,
    ...(destination !== undefined
      ? {
          destination: path.join(path.dirname(destination), `${parsed.name}.d8.json`),
        }
      : {}),
  };
}

function resolveLaunchPlatform(
  args: LaunchRequestArguments,
  cfg: LaunchConfigManifest,
  targetCfg: LaunchTargetConfig | undefined
): string | undefined {
  const explicit =
    normalizeNonEmptyString(args.platform) ??
    normalizeNonEmptyString(targetCfg?.platform) ??
    normalizeNonEmptyString(cfg.platform) ??
    normalizeNonEmptyString(cfg.projectPlatform);
  if (explicit !== undefined) {
    return explicit;
  }

  const targetProfile = resolveProfilePlatform(targetCfg?.profile, cfg);
  if (targetProfile !== undefined) {
    return targetProfile;
  }

  const defaultProfile = resolveProfilePlatform(cfg.defaultProfile, cfg);
  if (defaultProfile !== undefined) {
    return defaultProfile;
  }

  const profiles = Object.values(cfg.profiles ?? {}) as Array<{ platform?: string } | undefined>;
  for (const profile of profiles) {
    const platform = normalizeNonEmptyString(profile?.platform);
    if (platform !== undefined) {
      return platform;
    }
  }

  return undefined;
}

/**
 * When `romHex` lives only under another target's `tec1g` block (common for MON-3),
 * the active target's partial `tec1g` would otherwise drop it after merge.
 * If root and merged base have no non-empty `romHex`, inherit from the first target
 * (alphabetically) that defines `romHex`, then apply root overrides.
 */
function resolveTec1gBaseForMerge(cfg: {
  tec1g?: Tec1gPlatformConfig;
  targets?: Record<
    string,
    Partial<LaunchRequestArguments> & { sourceFile?: string; source?: string }
  >;
}): Tec1gPlatformConfig | undefined {
  const root = cfg.tec1g;
  if (root !== undefined && typeof root.romHex === 'string' && root.romHex.trim() !== '') {
    return root;
  }
  let inherited: Tec1gPlatformConfig | undefined;
  const names = Object.keys(cfg.targets ?? {}).sort((a, b) => a.localeCompare(b));
  for (const name of names) {
    const t = cfg.targets?.[name]?.tec1g;
    if (t !== undefined && typeof t.romHex === 'string' && t.romHex.trim() !== '') {
      inherited = { ...t };
      break;
    }
  }
  if (inherited === undefined) {
    return root;
  }
  return { ...inherited, ...(root ?? {}) };
}

function resolveConfigSearchStart(args: LaunchRequestArguments, workspaceRoot: string): string {
  const sourcePath =
    args.asm !== undefined && args.asm !== ''
      ? args.asm
      : args.sourceFile !== undefined && args.sourceFile !== ''
        ? args.sourceFile
        : undefined;
  return sourcePath !== undefined ? path.dirname(sourcePath) : workspaceRoot;
}

function ancestorDirs(startDir: string): string[] {
  const dirs: string[] = [];
  for (let dir = startDir; ; ) {
    dirs.push(dir);
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return dirs;
}

function configCandidateNames(args: LaunchRequestArguments): string[] {
  const candidates: string[] = [];
  if (args.projectConfig !== undefined && args.projectConfig !== '') {
    candidates.push(args.projectConfig);
  }
  candidates.push('debug80.json');
  candidates.push(path.join('.vscode', 'debug80.json'));
  return candidates;
}

function findConfigPath(args: LaunchRequestArguments, workspaceRoot: string): string | undefined {
  const candidates = configCandidateNames(args);
  const startDir = resolveConfigSearchStart(args, workspaceRoot);
  for (const dir of ancestorDirs(startDir)) {
    for (const candidate of candidates) {
      const full = path.isAbsolute(candidate) ? candidate : path.join(dir, candidate);
      if (fs.existsSync(full)) {
        return full;
      }
    }
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkgRaw = fs.readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(pkgRaw) as { debug80?: unknown };
        if (pkg.debug80 !== undefined) {
          return pkgPath;
        }
      } catch {
        /* ignore */
      }
    }
  }
  return undefined;
}

function readLaunchConfig(configPath: string): LaunchConfigManifest {
  if (configPath.endsWith('package.json')) {
    const pkgRaw = fs.readFileSync(configPath, 'utf-8');
    const pkg = JSON.parse(pkgRaw) as { debug80?: unknown };
    return (pkg.debug80 as LaunchConfigManifest | undefined) ?? { targets: {} };
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw) as LaunchConfigManifest;
}

function loadLaunchConfig(
  args: LaunchRequestArguments,
  helpers: ConfigDiscoveryHelpers
): LoadedLaunchConfig | undefined {
  const workspaceRoot = helpers.resolveBaseDir(args);
  const configPath = findConfigPath(args, workspaceRoot);
  if (configPath === undefined) {
    return undefined;
  }
  return { path: configPath, manifest: readLaunchConfig(configPath) };
}

function resolveLaunchTarget(
  loaded: LoadedLaunchConfig,
  args: LaunchRequestArguments
): ResolvedLaunchConfig {
  const cfg = loaded.manifest;
  const targets = cfg.targets ?? {};
  const targetName = args.target ?? cfg.target ?? cfg.defaultTarget ?? Object.keys(targets)[0];
  return {
    ...loaded,
    targetName,
    targetCfg: targetName !== undefined ? (targets[targetName] ?? undefined) : undefined,
  };
}

function applyPlatformBlockMerges(
  merged: LaunchRequestArguments,
  cfg: LaunchConfigManifest,
  targetCfg: LaunchTargetConfig | undefined,
  args: LaunchRequestArguments
): void {
  const mergedSimple = mergeNestedPlatformBlock(cfg.simple, targetCfg?.simple, args.simple);
  if (mergedSimple !== undefined) {
    merged.simple = mergedSimple;
  } else {
    delete merged.simple;
  }

  const mergedTec1 = mergeNestedPlatformBlock(cfg.tec1, targetCfg?.tec1, args.tec1);
  if (mergedTec1 !== undefined) {
    merged.tec1 = mergedTec1;
  } else {
    delete merged.tec1;
  }

  const mergedTec1g = mergeNestedPlatformBlock(
    resolveTec1gBaseForMerge(cfg),
    targetCfg?.tec1g,
    args.tec1g
  );
  if (mergedTec1g !== undefined) {
    merged.tec1g = mergedTec1g;
  } else {
    delete merged.tec1g;
  }
}

function setIfDefined<K extends keyof LaunchRequestArguments>(
  merged: LaunchRequestArguments,
  key: K,
  value: LaunchRequestArguments[K] | undefined
): void {
  if (value !== undefined) {
    merged[key] = value;
  }
}

function resolveAsmInput(
  cfg: LaunchConfigManifest,
  targetCfg: LaunchTargetConfig | undefined,
  args: LaunchRequestArguments
): string | undefined {
  return (
    args.asm ??
    args.sourceFile ??
    targetCfg?.asm ??
    targetCfg?.sourceFile ??
    targetCfg?.source ??
    cfg.asm ??
    cfg.sourceFile ??
    cfg.source
  );
}

function resolveSourceInput(
  cfg: LaunchConfigManifest,
  targetCfg: LaunchTargetConfig | undefined,
  args: LaunchRequestArguments
): string | undefined {
  return (
    args.sourceFile ??
    args.asm ??
    targetCfg?.sourceFile ??
    targetCfg?.asm ??
    targetCfg?.source ??
    cfg.sourceFile ??
    cfg.asm ??
    cfg.source
  );
}

function applyAzmOptions(
  merged: LaunchRequestArguments,
  cfg: LaunchConfigManifest,
  targetCfg: LaunchTargetConfig | undefined,
  args: LaunchRequestArguments
): void {
  const azmResolved = { ...(cfg.azm ?? {}), ...(targetCfg?.azm ?? {}), ...(args.azm ?? {}) };
  setIfDefined(
    merged,
    'azm',
    Object.keys(azmResolved).length > 0 ? azmResolved : undefined
  );
}

function applySourceLaunchFields(
  merged: LaunchRequestArguments,
  cfg: LaunchConfigManifest,
  targetCfg: LaunchTargetConfig | undefined,
  args: LaunchRequestArguments
): void {
  setIfDefined(merged, 'asm', resolveAsmInput(cfg, targetCfg, args));
  setIfDefined(merged, 'assembler', args.assembler ?? targetCfg?.assembler ?? cfg.assembler);
  applyAzmOptions(merged, cfg, targetCfg, args);
  setIfDefined(merged, 'sourceFile', resolveSourceInput(cfg, targetCfg, args));
}

function applyArtifactLaunchFields(
  merged: LaunchRequestArguments,
  cfg: LaunchConfigManifest,
  targetCfg: LaunchTargetConfig | undefined,
  args: LaunchRequestArguments
): void {
  setIfDefined(merged, 'hex', args.hex ?? targetCfg?.hex ?? cfg.hex);
  setIfDefined(merged, 'outputDir', args.outputDir ?? targetCfg?.outputDir ?? cfg.outputDir);
  setIfDefined(
    merged,
    'artifactBase',
    args.artifactBase ?? targetCfg?.artifactBase ?? cfg.artifactBase
  );
  setIfDefined(
    merged,
    'sourceRoots',
    args.sourceRoots ?? targetCfg?.sourceRoots ?? cfg.sourceRoots
  );
  setIfDefined(merged, 'debugMaps', args.debugMaps ?? targetCfg?.debugMaps ?? cfg.debugMaps);
}

function applyExecutionLaunchFields(
  merged: LaunchRequestArguments,
  cfg: LaunchConfigManifest,
  targetCfg: LaunchTargetConfig | undefined,
  args: LaunchRequestArguments
): void {
  setIfDefined(merged, 'entry', args.entry ?? targetCfg?.entry ?? cfg.entry);
  setIfDefined(merged, 'simple', args.simple ?? targetCfg?.simple ?? cfg.simple);
  setIfDefined(
    merged,
    'stopOnEntry',
    args.stopOnEntry !== undefined ? args.stopOnEntry : (targetCfg?.stopOnEntry ?? cfg.stopOnEntry)
  );
  setIfDefined(merged, 'assemble', args.assemble ?? targetCfg?.assemble ?? cfg.assemble);
  setIfDefined(
    merged,
    'stepOverMaxInstructions',
    args.stepOverMaxInstructions ??
      targetCfg?.stepOverMaxInstructions ??
      cfg.stepOverMaxInstructions
  );
  setIfDefined(
    merged,
    'stepOutMaxInstructions',
    args.stepOutMaxInstructions ?? targetCfg?.stepOutMaxInstructions ?? cfg.stepOutMaxInstructions
  );
}

function applyBundledRomPath(
  merged: LaunchRequestArguments,
  options: {
    platformResolved: string | undefined;
    launchPlatformResolved: string | undefined;
    bundledRomReference: BundledAssetReferenceLike | undefined;
    workspaceRoot: string;
  }
): void {
  const resolvedRomHex = resolveBundledAssetRuntimePath(
    merged.tec1?.romHex ?? merged.tec1g?.romHex,
    options.bundledRomReference,
    options.workspaceRoot
  );
  if (resolvedRomHex === undefined) {
    return;
  }
  if (options.launchPlatformResolved === 'tec1' || options.platformResolved === 'tec1') {
    merged.tec1 = { ...(merged.tec1 ?? {}), romHex: resolvedRomHex };
  } else if (
    options.launchPlatformResolved === 'tec1g' ||
    options.platformResolved === 'tec1g'
  ) {
    merged.tec1g = { ...(merged.tec1g ?? {}), romHex: resolvedRomHex };
  }
}

function applyBundledDebugMapPath(
  merged: LaunchRequestArguments,
  cfg: LaunchConfigManifest,
  targetCfg: LaunchTargetConfig | undefined,
  bundledRomReference: BundledAssetReferenceLike | undefined,
  workspaceRoot: string
): void {
  const bundledDebugMapReference =
    resolveBundledAssetReference(cfg, targetCfg, 'debugMap') ??
    inferSiblingDebugMapReference(bundledRomReference);
  const resolvedDebugMap = resolveBundledAssetRuntimePath(
    undefined,
    bundledDebugMapReference,
    workspaceRoot
  );
  if (resolvedDebugMap !== undefined) {
    const existing = merged.debugMaps ?? [];
    merged.debugMaps = existing.includes(resolvedDebugMap)
      ? existing
      : [...existing, resolvedDebugMap];
  }
}

function applyBundledAssetPaths(
  merged: LaunchRequestArguments,
  cfg: LaunchConfigManifest,
  targetCfg: LaunchTargetConfig | undefined,
  args: LaunchRequestArguments,
  workspaceRoot: string
): void {
  const platformResolved = args.platform ?? targetCfg?.platform ?? cfg.platform;
  const launchPlatformResolved = resolveLaunchPlatform(args, cfg, targetCfg);
  const bundledRomReference = resolveBundledAssetReference(cfg, targetCfg, 'romHex');

  applyBundledRomPath(merged, {
    platformResolved,
    launchPlatformResolved,
    bundledRomReference,
    workspaceRoot,
  });
  applyBundledDebugMapPath(merged, cfg, targetCfg, bundledRomReference, workspaceRoot);

  if (launchPlatformResolved !== undefined) {
    merged.platform = launchPlatformResolved;
  } else if (platformResolved !== undefined) {
    merged.platform = platformResolved;
  }
}

function buildMergedLaunchArgs(
  resolved: ResolvedLaunchConfig,
  args: LaunchRequestArguments,
  workspaceRoot: string
): LaunchRequestArguments {
  const cfg = resolved.manifest;
  const targetCfg = resolved.targetCfg;
  const merged: LaunchRequestArguments = {
    ...cfg,
    ...targetCfg,
    ...args,
  };

  applyPlatformBlockMerges(merged, cfg, targetCfg, args);
  applySourceLaunchFields(merged, cfg, targetCfg, args);
  applyArtifactLaunchFields(merged, cfg, targetCfg, args);
  applyExecutionLaunchFields(merged, cfg, targetCfg, args);
  applyBundledAssetPaths(merged, cfg, targetCfg, args, workspaceRoot);
  setIfDefined(merged, 'target', resolved.targetName ?? args.target);
  return merged;
}

export function normalizePlatformName(args: LaunchRequestArguments): PlatformKind {
  const raw = args.platform ?? 'simple';
  const name = raw.trim().toLowerCase();
  if (name === '') {
    return 'simple';
  }
  return name;
}

export function populateFromConfig(
  args: LaunchRequestArguments,
  helpers: ConfigDiscoveryHelpers
): LaunchRequestArguments {
  try {
    const workspaceRoot = helpers.resolveBaseDir(args);
    const loaded = loadLaunchConfig(args, helpers);
    if (loaded === undefined) {
      return args;
    }
    return buildMergedLaunchArgs(resolveLaunchTarget(loaded, args), args, workspaceRoot);
  } catch {
    return args;
  }
}
