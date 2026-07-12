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
import { LaunchRequestArguments } from './session/types';
import type { PlatformKind } from './launch/program-loader';
import {
  mergeLaunchConfigStages,
  type LaunchConfigManifest,
  type ResolvedLaunchConfig,
} from './launch/launch-config-merge';

type ConfigDiscoveryHelpers = { resolveBaseDir: (args: LaunchRequestArguments) => string };

type LoadedLaunchConfig = {
  path: string;
  manifest: LaunchConfigManifest;
};

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
    return mergeLaunchConfigStages(resolveLaunchTarget(loaded, args), args, workspaceRoot);
  } catch {
    return args;
  }
}
