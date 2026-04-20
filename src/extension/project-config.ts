/**
 * @file Shared helpers for locating and reading Debug80 project configs.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { ProjectConfig } from '../debug/types';

export const DEBUG80_PROJECT_VERSION = 2 as const;

const LEGACY_DEBUG80_PROJECT_VERSION = 1 as const;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isBundledAssetReference(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const o = value as Record<string, unknown>;
  return isNonEmptyString(o.bundleId) && isNonEmptyString(o.path) && (
    o.destination === undefined || isNonEmptyString(o.destination)
  );
}

function isProjectProfileConfig(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const o = value as Record<string, unknown>;
  if (o.platform !== undefined && !isNonEmptyString(o.platform)) {
    return false;
  }
  if (o.description !== undefined && !isNonEmptyString(o.description)) {
    return false;
  }
  const bundledAssets = o.bundledAssets;
  if (bundledAssets === undefined) {
    return true;
  }
  if (bundledAssets === null || typeof bundledAssets !== 'object' || Array.isArray(bundledAssets)) {
    return false;
  }
  return Object.values(bundledAssets).every((entry) => isBundledAssetReference(entry));
}

function normalizeProjectVersion(config: ProjectConfig): ProjectConfig {
  const hasProfiles = Object.keys(config.profiles ?? {}).length > 0;
  const hasBundledAssets = Object.keys(config.bundledAssets ?? {}).length > 0;
  if (
    config.projectVersion === DEBUG80_PROJECT_VERSION ||
    (!hasProfiles && !hasBundledAssets && config.defaultProfile === undefined)
  ) {
    return config;
  }
  return {
    ...config,
    projectVersion: DEBUG80_PROJECT_VERSION,
  };
}

export function isDebug80ProjectConfig(config: ProjectConfig | undefined): config is ProjectConfig {
  if (config === undefined) {
    return false;
  }

  const targets = config.targets;
  if (targets === undefined || Object.keys(targets).length === 0) {
    return false;
  }

  if (
    config.projectVersion !== undefined &&
    config.projectVersion !== LEGACY_DEBUG80_PROJECT_VERSION &&
    config.projectVersion !== DEBUG80_PROJECT_VERSION
  ) {
    return false;
  }

  const profiles = config.profiles;
  if (profiles !== undefined) {
    if (profiles === null || typeof profiles !== 'object' || Array.isArray(profiles)) {
      return false;
    }
    if (!Object.values(profiles).every((profile) => isProjectProfileConfig(profile))) {
      return false;
    }
    if (config.defaultProfile !== undefined && profiles[config.defaultProfile] === undefined) {
      return false;
    }
  }

  const bundledAssets = config.bundledAssets;
  if (bundledAssets !== undefined) {
    if (bundledAssets === null || typeof bundledAssets !== 'object' || Array.isArray(bundledAssets)) {
      return false;
    }
    if (!Object.values(bundledAssets).every((asset) => isBundledAssetReference(asset))) {
      return false;
    }
  }

  for (const target of Object.values(targets)) {
    if (target === undefined || typeof target !== 'object') {
      continue;
    }
    const profileName = (target as { profile?: unknown }).profile;
    if (profileName !== undefined) {
      if (!isNonEmptyString(profileName)) {
        return false;
      }
      if (profiles !== undefined && profiles[profileName] === undefined) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Merged `stopOnEntry` for launch (target overrides project root), matching
 * {@link populateFromConfig} in launch-args. Undefined in both places means false at runtime.
 */
export function resolveStopOnEntryForTarget(
  config: ProjectConfig | undefined,
  targetName: string | undefined
): boolean {
  if (config === undefined) {
    return false;
  }
  const fromTarget =
    targetName !== undefined ? config.targets?.[targetName]?.stopOnEntry : undefined;
  const merged = fromTarget ?? config.stopOnEntry;
  return merged === true;
}

export function resolveProjectPlatform(config: ProjectConfig | undefined): string | undefined {
  if (config === undefined) {
    return undefined;
  }

  if (typeof config.projectPlatform === 'string' && config.projectPlatform.trim() !== '') {
    return config.projectPlatform.trim().toLowerCase();
  }

  if (typeof config.platform === 'string' && config.platform.trim() !== '') {
    return config.platform.trim().toLowerCase();
  }

  const defaultProfile = config.defaultProfile;
  if (isNonEmptyString(defaultProfile)) {
    const profile = config.profiles?.[defaultProfile];
    if (profile !== undefined && isNonEmptyString(profile.platform)) {
      return profile.platform.trim().toLowerCase();
    }
  }

  for (const profile of Object.values(config.profiles ?? {})) {
    if (profile !== undefined && isNonEmptyString(profile.platform)) {
      return profile.platform.trim().toLowerCase();
    }
  }

  const targets = Object.values(config.targets ?? {});
  for (const target of targets) {
    if (target !== undefined && isNonEmptyString((target as { profile?: unknown }).profile)) {
      const profileName = (target as { profile?: string }).profile;
      const profile = profileName !== undefined ? config.profiles?.[profileName] : undefined;
      if (profile !== undefined && isNonEmptyString(profile.platform)) {
        return profile.platform.trim().toLowerCase();
      }
    }
    if (typeof target?.platform === 'string' && target.platform.trim() !== '') {
      return target.platform.trim().toLowerCase();
    }
  }

  return undefined;
}

export const PROJECT_CONFIG_CANDIDATES = [
  'debug80.json',
  path.join('.vscode', 'debug80.json'),
  '.debug80.json',
];

export function findProjectConfigPath(folder: vscode.WorkspaceFolder): string | undefined {
  for (const candidate of PROJECT_CONFIG_CANDIDATES) {
    const full = path.join(folder.uri.fsPath, candidate);
    if (fs.existsSync(full)) {
      return full;
    }
  }
  return undefined;
}

export function readProjectConfig(projectConfigPath: string): ProjectConfig | undefined {
  try {
    if (projectConfigPath.endsWith('package.json')) {
      const pkgRaw = fs.readFileSync(projectConfigPath, 'utf-8');
      const pkg = JSON.parse(pkgRaw) as { debug80?: ProjectConfig };
      return pkg.debug80 !== undefined ? normalizeProjectVersion(pkg.debug80) : undefined;
    }

    const raw = fs.readFileSync(projectConfigPath, 'utf-8');
    return normalizeProjectVersion(JSON.parse(raw) as ProjectConfig);
  } catch {
    return undefined;
  }
}

export function writeProjectConfig(projectConfigPath: string, config: ProjectConfig): boolean {
  try {
    if (projectConfigPath.endsWith('package.json')) {
      const pkgRaw = fs.readFileSync(projectConfigPath, 'utf-8');
      const pkg = JSON.parse(pkgRaw) as { debug80?: ProjectConfig } & Record<string, unknown>;
      pkg.debug80 = normalizeProjectVersion(config);
      fs.writeFileSync(projectConfigPath, `${JSON.stringify(pkg, null, 2)}\n`);
      return true;
    }

    fs.writeFileSync(projectConfigPath, `${JSON.stringify(normalizeProjectVersion(config), null, 2)}\n`);
    return true;
  } catch {
    return false;
  }
}

export function isInitializedDebug80Project(folder: vscode.WorkspaceFolder): boolean {
  const projectConfigPath = findProjectConfigPath(folder);
  if (projectConfigPath === undefined) {
    return false;
  }
  return isDebug80ProjectConfig(readProjectConfig(projectConfigPath));
}

/**
 * Merged launch args resolve the assemble input as `asm` before `sourceFile`
 * (see `populateFromConfig` in launch-args). Keep both in sync when the user
 * picks a new program file so ZAX (and asm80) targets assemble the selected file.
 */
function nextTargetEntrySource(
  target: Record<string, unknown>,
  sourceFile: string
): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...target };
  const isZax = sourceFile.toLowerCase().endsWith('.zax');
  return {
    ...rest,
    sourceFile,
    asm: sourceFile,
    ...(isZax ? { assembler: 'zax' } : {}),
  };
}

/**
 * Adds a new target to the project config, inheriting all settings from the
 * default target (platform, profile, memory map, etc.) but with a different
 * sourceFile and artifactBase. Used when the user selects a discovered source
 * file from the target dropdown.
 */
function buildNewTargetEntry(
  targets: Record<string, Record<string, unknown>>,
  defaultTargetName: string | undefined,
  targetName: string,
  sourceFile: string
): Record<string, unknown> {
  const templateName =
    typeof defaultTargetName === 'string' && targets[defaultTargetName] !== undefined
      ? defaultTargetName
      : Object.keys(targets)[0];
  const template: Record<string, unknown> =
    templateName !== undefined ? { ...(targets[templateName] ?? {}) } : {};

  // Strip old source-specific keys; set new ones
  delete template.sourceFile;
  delete template.asm;
  delete template.source;
  delete template.artifactBase;
  const ext = path.extname(sourceFile);
  const baseName = path.basename(sourceFile, ext) || targetName;
  const isZax = sourceFile.toLowerCase().endsWith('.zax');

  return {
    ...template,
    sourceFile,
    asm: sourceFile,
    artifactBase: baseName,
    ...(isZax ? { assembler: 'zax' } : {}),
  };
}

export function addProjectTarget(
  projectConfigPath: string,
  targetName: string,
  sourceFile: string
): boolean {
  try {
    if (projectConfigPath.endsWith('package.json')) {
      const pkgRaw = fs.readFileSync(projectConfigPath, 'utf-8');
      const pkg = JSON.parse(pkgRaw) as { debug80?: ProjectConfig } & Record<string, unknown>;
      const config = pkg.debug80 ?? { targets: {} };
      const targets = (config.targets ?? {}) as Record<string, Record<string, unknown>>;
      if (targets[targetName] !== undefined) {
        return false;
      }
      targets[targetName] = buildNewTargetEntry(
        targets,
        config.defaultTarget ?? (config as ProjectConfig & { target?: string }).target,
        targetName,
        sourceFile
      );
      config.targets = targets as NonNullable<ProjectConfig['targets']>;
      pkg.debug80 = config;
      fs.writeFileSync(projectConfigPath, `${JSON.stringify(pkg, null, 2)}\n`);
      return true;
    }

    const raw = fs.readFileSync(projectConfigPath, 'utf-8');
    const config = JSON.parse(raw) as ProjectConfig;
    const targets = (config.targets ?? {}) as Record<string, Record<string, unknown>>;
    if (targets[targetName] !== undefined) {
      return false; // already exists
    }

    targets[targetName] = buildNewTargetEntry(
      targets,
      config.defaultTarget ?? (config as ProjectConfig & { target?: string }).target,
      targetName,
      sourceFile
    );
    config.targets = targets as NonNullable<ProjectConfig['targets']>;
    fs.writeFileSync(projectConfigPath, `${JSON.stringify(config, null, 2)}\n`);
    return true;
  } catch {
    return false;
  }
}

export function updateProjectTargetSource(
  projectConfigPath: string,
  targetName: string,
  sourceFile: string
): boolean {
  try {
    if (projectConfigPath.endsWith('package.json')) {
      const pkgRaw = fs.readFileSync(projectConfigPath, 'utf-8');
      const pkg = JSON.parse(pkgRaw) as { debug80?: ProjectConfig } & Record<string, unknown>;
      const config = pkg.debug80 ?? { targets: {} };
      const targets = (config.targets ?? {}) as Record<string, Record<string, unknown>>;
      const target = targets[targetName] ?? {};
      targets[targetName] = nextTargetEntrySource(target, sourceFile);
      config.targets = targets as NonNullable<ProjectConfig['targets']>;
      pkg.debug80 = config;
      fs.writeFileSync(projectConfigPath, `${JSON.stringify(pkg, null, 2)}\n`);
      return true;
    }

    const raw = fs.readFileSync(projectConfigPath, 'utf-8');
    const config = JSON.parse(raw) as ProjectConfig;
    const targets = (config.targets ?? {}) as Record<string, Record<string, unknown>>;
    const target = targets[targetName] ?? {};
    targets[targetName] = nextTargetEntrySource(target, sourceFile);
    config.targets = targets as NonNullable<ProjectConfig['targets']>;
    fs.writeFileSync(projectConfigPath, `${JSON.stringify(config, null, 2)}\n`);
    return true;
  } catch {
    return false;
  }
}

export function listProjectSourceFiles(rootPath: string): string[] {
  const results: string[] = [];
  collectProjectSourceFiles(rootPath, rootPath, results);
  results.sort((left, right) => left.localeCompare(right));
  return results;
}

const SKIP_DIRS = new Set(['.git', '.vscode', 'node_modules', 'out', 'dist', 'build', 'coverage', 'roms']);

function collectProjectSourceFiles(rootPath: string, currentPath: string, results: string[]): void {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      collectProjectSourceFiles(rootPath, fullPath, results);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const lower = entry.name.toLowerCase();
    if (!lower.endsWith('.asm') && !lower.endsWith('.zax')) {
      continue;
    }

    results.push(path.relative(rootPath, fullPath).split(path.sep).join('/'));
  }
}
