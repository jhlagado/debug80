/**
 * @fileoverview Staged launch config merge helpers.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { LaunchRequestArguments } from '../session/types';
import type { Tec1gPlatformConfig } from '../../platforms/types';

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

export type LaunchConfigManifest = Partial<LaunchRequestArguments> & {
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

export type LaunchTargetConfig = Partial<LaunchRequestArguments> & {
  sourceFile?: string;
  source?: string;
  profile?: string;
};

type BundledAssetReferenceLike = {
  bundleId?: string;
  path?: string;
  destination?: string;
};

export type ResolvedLaunchConfig = {
  path: string;
  manifest: LaunchConfigManifest;
  targetName: string | undefined;
  targetCfg: LaunchTargetConfig | undefined;
};

type MergeOptions = {
  resolveBundledAssetPath?: (reference: BundledAssetReferenceLike) => string | undefined;
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

function firstPresent<T>(...values: Array<T | null | undefined>): T | undefined {
  return values.find((value) => value !== undefined && value !== null) ?? undefined;
}

function firstNormalizedString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const normalized = normalizeNonEmptyString(value);
    if (normalized !== undefined) {
      return normalized;
    }
  }
  return undefined;
}

function resolveRuntimePath(
  candidatePath: string | undefined,
  baseDir: string
): string | undefined {
  if (candidatePath === undefined || candidatePath === '') {
    return undefined;
  }
  return path.isAbsolute(candidatePath)
    ? path.normalize(candidatePath)
    : path.resolve(baseDir, candidatePath);
}

function resolveDestinationPath(
  reference: BundledAssetReferenceLike | undefined,
  baseDir: string
): string | undefined {
  const destination = normalizePathString(reference?.destination);
  return destination !== undefined
    ? path.isAbsolute(destination)
      ? path.normalize(destination)
      : path.resolve(baseDir, destination)
    : undefined;
}

function shouldUseBundledAsset(
  resolvedCandidate: string | undefined,
  resolvedDestination: string | undefined
): boolean {
  return (
    resolvedCandidate === undefined ||
    resolvedDestination === undefined ||
    path.normalize(resolvedCandidate) === path.normalize(resolvedDestination)
  );
}

function hasNonEmptyRomHex(
  config: Tec1gPlatformConfig | undefined
): config is Tec1gPlatformConfig {
  return typeof config?.romHex === 'string' && config.romHex.trim() !== '';
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
  baseDir: string,
  options: MergeOptions
): string | undefined {
  const resolvedCandidate = resolveRuntimePath(candidatePath, baseDir);
  if (resolvedCandidate !== undefined && fs.existsSync(resolvedCandidate)) {
    return resolvedCandidate;
  }

  if (reference === undefined) {
    return resolvedCandidate;
  }

  const resolvedDestination = resolveDestinationPath(reference, baseDir);
  if (!shouldUseBundledAsset(resolvedCandidate, resolvedDestination)) {
    return resolvedCandidate;
  }

  return (
    options.resolveBundledAssetPath?.(reference) ??
    resolveExtensionBundledAssetPath(reference) ??
    resolvedCandidate
  );
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
  const explicit = firstNormalizedString(
    args.platform,
    targetCfg?.platform,
    cfg.platform,
    cfg.projectPlatform
  );
  if (explicit !== undefined) {
    return explicit;
  }

  const profilePlatform = firstPresent(
    resolveProfilePlatform(targetCfg?.profile, cfg),
    resolveProfilePlatform(cfg.defaultProfile, cfg)
  );
  if (profilePlatform !== undefined) {
    return profilePlatform;
  }

  const profiles = Object.values(cfg.profiles ?? {}) as Array<{ platform?: string } | undefined>;
  return profiles
    .map((profile) => normalizeNonEmptyString(profile?.platform))
    .find((platform) => platform !== undefined);
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
  if (hasNonEmptyRomHex(root)) {
    return root;
  }
  const names = Object.keys(cfg.targets ?? {}).sort((a, b) => a.localeCompare(b));
  const inherited = names
    .map((name) => cfg.targets?.[name]?.tec1g)
    .find(hasNonEmptyRomHex);
  if (inherited === undefined) {
    return root;
  }
  return { ...inherited, ...(root ?? {}) };
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
  return firstPresent(
    args.asm ?? args.sourceFile,
    targetCfg?.asm,
    targetCfg?.sourceFile,
    targetCfg?.source,
    cfg.asm,
    cfg.sourceFile,
    cfg.source
  );
}

function resolveSourceInput(
  cfg: LaunchConfigManifest,
  targetCfg: LaunchTargetConfig | undefined,
  args: LaunchRequestArguments
): string | undefined {
  return firstPresent(
    args.sourceFile ?? args.asm,
    targetCfg?.sourceFile,
    targetCfg?.asm,
    targetCfg?.source,
    cfg.sourceFile,
    cfg.asm,
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
  setIfDefined(merged, 'azm', Object.keys(azmResolved).length > 0 ? azmResolved : undefined);
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
  setIfDefined(merged, 'hex', firstPresent(args.hex, targetCfg?.hex, cfg.hex));
  setIfDefined(
    merged,
    'outputDir',
    firstPresent(args.outputDir, targetCfg?.outputDir, cfg.outputDir)
  );
  setIfDefined(
    merged,
    'artifactBase',
    firstPresent(args.artifactBase, targetCfg?.artifactBase, cfg.artifactBase)
  );
  setIfDefined(
    merged,
    'sourceRoots',
    firstPresent(args.sourceRoots, targetCfg?.sourceRoots, cfg.sourceRoots)
  );
  setIfDefined(
    merged,
    'debugMaps',
    firstPresent(args.debugMaps, targetCfg?.debugMaps, cfg.debugMaps)
  );
}

function applyExecutionLaunchFields(
  merged: LaunchRequestArguments,
  cfg: LaunchConfigManifest,
  targetCfg: LaunchTargetConfig | undefined,
  args: LaunchRequestArguments
): void {
  setIfDefined(merged, 'entry', firstPresent(args.entry, targetCfg?.entry, cfg.entry));
  setIfDefined(merged, 'simple', firstPresent(args.simple, targetCfg?.simple, cfg.simple));
  setIfDefined(
    merged,
    'stopOnEntry',
    firstPresent(args.stopOnEntry, targetCfg?.stopOnEntry, cfg.stopOnEntry)
  );
  setIfDefined(
    merged,
    'assemble',
    firstPresent(args.assemble, targetCfg?.assemble, cfg.assemble)
  );
  setIfDefined(
    merged,
    'stepOverMaxInstructions',
    firstPresent(
      args.stepOverMaxInstructions,
      targetCfg?.stepOverMaxInstructions,
      cfg.stepOverMaxInstructions
    )
  );
  setIfDefined(
    merged,
    'stepOutMaxInstructions',
    firstPresent(
      args.stepOutMaxInstructions,
      targetCfg?.stepOutMaxInstructions,
      cfg.stepOutMaxInstructions
    )
  );
}

function applyBundledRomPath(
  merged: LaunchRequestArguments,
  options: {
    platformResolved: string | undefined;
    launchPlatformResolved: string | undefined;
    bundledRomReference: BundledAssetReferenceLike | undefined;
    workspaceRoot: string;
    mergeOptions: MergeOptions;
  }
): void {
  const resolvedRomHex = resolveBundledAssetRuntimePath(
    merged.tec1?.romHex ?? merged.tec1g?.romHex,
    options.bundledRomReference,
    options.workspaceRoot,
    options.mergeOptions
  );
  if (resolvedRomHex === undefined) {
    return;
  }
  const platform = firstPresent(options.launchPlatformResolved, options.platformResolved);
  if (platform === 'tec1') {
    merged.tec1 = { ...(merged.tec1 ?? {}), romHex: resolvedRomHex };
  } else if (platform === 'tec1g') {
    merged.tec1g = { ...(merged.tec1g ?? {}), romHex: resolvedRomHex };
  }
}

function applyBundledDebugMapPath(
  merged: LaunchRequestArguments,
  cfg: LaunchConfigManifest,
  targetCfg: LaunchTargetConfig | undefined,
  bundledRomReference: BundledAssetReferenceLike | undefined,
  workspaceRoot: string,
  options: MergeOptions
): void {
  const bundledDebugMapReference =
    resolveBundledAssetReference(cfg, targetCfg, 'debugMap') ??
    inferSiblingDebugMapReference(bundledRomReference);
  const resolvedDebugMap = resolveBundledAssetRuntimePath(
    undefined,
    bundledDebugMapReference,
    workspaceRoot,
    options
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
  workspaceRoot: string,
  options: MergeOptions
): void {
  const platformResolved = args.platform ?? targetCfg?.platform ?? cfg.platform;
  const launchPlatformResolved = resolveLaunchPlatform(args, cfg, targetCfg);
  const bundledRomReference = resolveBundledAssetReference(cfg, targetCfg, 'romHex');

  applyBundledRomPath(merged, {
    platformResolved,
    launchPlatformResolved,
    bundledRomReference,
    workspaceRoot,
    mergeOptions: options,
  });
  applyBundledDebugMapPath(merged, cfg, targetCfg, bundledRomReference, workspaceRoot, options);

  if (launchPlatformResolved !== undefined) {
    merged.platform = launchPlatformResolved;
  } else if (platformResolved !== undefined) {
    merged.platform = platformResolved;
  }
}

export function mergeLaunchConfigStages(
  resolved: ResolvedLaunchConfig,
  args: LaunchRequestArguments,
  workspaceRoot: string,
  options: MergeOptions = {}
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
  applyBundledAssetPaths(merged, cfg, targetCfg, args, workspaceRoot, options);
  setIfDefined(merged, 'target', resolved.targetName ?? args.target);
  return merged;
}
