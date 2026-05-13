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
  helpers: { resolveBaseDir: (args: LaunchRequestArguments) => string }
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
    let cfg: LaunchConfigManifest;

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

    const assemblerResolved = args.assembler ?? targetCfg?.assembler ?? cfg.assembler;
    if (assemblerResolved !== undefined) {
      merged.assembler = assemblerResolved;
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
    const launchPlatformResolved = resolveLaunchPlatform(args, cfg, targetCfg);

    const simpleResolved = args.simple ?? targetCfg?.simple ?? cfg.simple;
    if (simpleResolved !== undefined) {
      merged.simple = simpleResolved;
    }

    // args.stopOnEntry carries the global session setting from the Debug80 panel
    // (managed in PlatformViewProvider, not stored in debug80.json). It always
    // takes priority. Fall back to the project config only when the launch was
    // triggered without an explicit value (e.g. a raw launch.json with no panel).
    const stopOnEntryResolved =
      args.stopOnEntry !== undefined
        ? args.stopOnEntry
        : (targetCfg?.stopOnEntry ?? cfg.stopOnEntry);
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

    const bundledRomReference = resolveBundledAssetReference(cfg, targetCfg, 'romHex');
    const bundledListingReference = resolveBundledAssetReference(cfg, targetCfg, 'listing');
    const resolvedRomHex = resolveBundledAssetRuntimePath(
      merged.tec1?.romHex ?? merged.tec1g?.romHex,
      bundledRomReference,
      workspaceRoot
    );
    const resolvedExtraListing = resolveBundledAssetRuntimePath(
      merged.tec1?.extraListings?.[0] ?? merged.tec1g?.extraListings?.[0],
      bundledListingReference,
      workspaceRoot
    );

    if (resolvedRomHex !== undefined) {
      if (launchPlatformResolved === 'tec1' || platformResolved === 'tec1') {
        merged.tec1 = { ...(merged.tec1 ?? {}), romHex: resolvedRomHex };
      } else if (launchPlatformResolved === 'tec1g' || platformResolved === 'tec1g') {
        merged.tec1g = { ...(merged.tec1g ?? {}), romHex: resolvedRomHex };
      }
    }

    if (resolvedExtraListing !== undefined) {
      if (launchPlatformResolved === 'tec1' || platformResolved === 'tec1') {
        const extraListings = (merged.tec1?.extraListings ?? [])
          .map((entry) =>
            resolveBundledAssetRuntimePath(entry, bundledListingReference, workspaceRoot)
          )
          .filter((entry): entry is string => entry !== undefined);
        merged.tec1 = {
          ...(merged.tec1 ?? {}),
          extraListings:
            extraListings.length > 0
              ? extraListings
              : resolvedExtraListing !== undefined
                ? [resolvedExtraListing]
                : [],
        };
      } else if (launchPlatformResolved === 'tec1g' || platformResolved === 'tec1g') {
        const extraListings = (merged.tec1g?.extraListings ?? [])
          .map((entry) =>
            resolveBundledAssetRuntimePath(entry, bundledListingReference, workspaceRoot)
          )
          .filter((entry): entry is string => entry !== undefined);
        merged.tec1g = {
          ...(merged.tec1g ?? {}),
          extraListings:
            extraListings.length > 0
              ? extraListings
              : resolvedExtraListing !== undefined
                ? [resolvedExtraListing]
                : [],
        };
      }
    }

    if (launchPlatformResolved !== undefined) {
      merged.platform = launchPlatformResolved;
    } else if (platformResolved !== undefined) {
      merged.platform = platformResolved;
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
