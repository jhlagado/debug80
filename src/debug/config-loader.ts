/**
 * @fileoverview Configuration loading and merging for the debug adapter.
 * Handles reading debug80.json files and merging configuration layers.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { LaunchRequestArguments, ProjectConfig } from './types';

/**
 * Searches for a configuration file starting from startDir and walking up
 * the directory tree.
 *
 * @param startDir - Directory to start searching from
 * @param configCandidates - List of config file names to look for
 * @returns The absolute path to the config file, or undefined if not found
 */
export function findConfigFile(
  startDir: string,
  configCandidates: string[]
): string | undefined {
  const dirsToCheck: string[] = [];
  for (let dir = startDir; ; ) {
    dirsToCheck.push(dir);
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  for (const dir of dirsToCheck) {
    for (const candidate of configCandidates) {
      const full = path.isAbsolute(candidate) ? candidate : path.join(dir, candidate);
      if (fs.existsSync(full)) {
        return full;
      }
    }

    // Check package.json for debug80 section
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkgRaw = fs.readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(pkgRaw) as { debug80?: unknown };
        if (pkg.debug80 !== undefined) {
          return pkgPath;
        }
      } catch {
        /* ignore parse errors */
      }
    }
  }

  return undefined;
}

/**
 * Loads configuration from a file path.
 *
 * @param configPath - Path to the configuration file
 * @returns The parsed configuration object
 * @throws If the file cannot be read or parsed
 */
export function loadConfigFile(configPath: string): ProjectConfig {
  if (configPath.endsWith('package.json')) {
    const pkgRaw = fs.readFileSync(configPath, 'utf-8');
    const pkg = JSON.parse(pkgRaw) as { debug80?: unknown };
    return (pkg.debug80 as ProjectConfig) ?? { targets: {} };
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw) as ProjectConfig;
}

/**
 * Determines the starting directory for configuration search.
 *
 * @param args - Launch request arguments
 * @returns The directory to start searching from
 */
export function getConfigSearchStartDir(args: LaunchRequestArguments): string {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  if (args.asm !== undefined && args.asm !== '') {
    return path.dirname(args.asm);
  }
  if (args.sourceFile !== undefined && args.sourceFile !== '') {
    return path.dirname(args.sourceFile);
  }

  return workspaceRoot ?? process.cwd();
}

/**
 * Gets the list of default configuration file candidates.
 *
 * @param projectConfig - Optional explicit config path from args
 * @returns Array of config file names to search for
 */
export function getConfigCandidates(projectConfig?: string): string[] {
  const candidates: string[] = [];

  if (projectConfig !== undefined && projectConfig !== '') {
    candidates.push(projectConfig);
  }

  candidates.push('debug80.json');
  candidates.push('.debug80.json');
  candidates.push(path.join('.vscode', 'debug80.json'));

  return candidates;
}

/**
 * Merges configuration from file with launch request arguments.
 * Priority: args > targetCfg > rootCfg
 *
 * @param args - Launch request arguments
 * @param cfg - Project configuration loaded from file
 * @returns Merged launch request arguments
 */
export function mergeConfig(
  args: LaunchRequestArguments,
  cfg: ProjectConfig
): LaunchRequestArguments {
  const targets = cfg.targets ?? {};
  const targetName =
    args.target ?? cfg.target ?? cfg.defaultTarget ?? Object.keys(targets)[0];
  const targetCfg =
    (targetName !== undefined ? targets[targetName] : undefined) ?? undefined;

  const merged: LaunchRequestArguments = {
    ...cfg,
    ...targetCfg,
    ...args,
  };

  // Resolve asm path with multiple fallbacks
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

  // Resolve sourceFile path with multiple fallbacks
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

  // Merge individual fields with priority - only assign if defined
  const hexResolved = args.hex ?? targetCfg?.hex ?? cfg.hex ?? merged.hex;
  if (hexResolved !== undefined) {
    merged.hex = hexResolved;
  }

  const listingResolved = args.listing ?? targetCfg?.listing ?? cfg.listing ?? merged.listing;
  if (listingResolved !== undefined) {
    merged.listing = listingResolved;
  }

  const outputDirResolved = args.outputDir ?? targetCfg?.outputDir ?? cfg.outputDir ?? merged.outputDir;
  if (outputDirResolved !== undefined) {
    merged.outputDir = outputDirResolved;
  }

  const artifactBaseResolved =
    args.artifactBase ?? targetCfg?.artifactBase ?? cfg.artifactBase ?? merged.artifactBase;
  if (artifactBaseResolved !== undefined) {
    merged.artifactBase = artifactBaseResolved;
  }

  const entryResolved = args.entry ?? targetCfg?.entry ?? cfg.entry ?? merged.entry;
  if (entryResolved !== undefined) {
    merged.entry = entryResolved;
  }

  const platformResolved = args.platform ?? targetCfg?.platform ?? cfg.platform ?? merged.platform;
  if (platformResolved !== undefined) {
    merged.platform = platformResolved;
  }

  const simpleResolved = args.simple ?? targetCfg?.simple ?? cfg.simple ?? merged.simple;
  if (simpleResolved !== undefined) {
    merged.simple = simpleResolved;
  }

  const stopOnEntryResolved =
    args.stopOnEntry ?? targetCfg?.stopOnEntry ?? cfg.stopOnEntry ?? merged.stopOnEntry;
  if (stopOnEntryResolved !== undefined) {
    merged.stopOnEntry = stopOnEntryResolved;
  }

  const assembleResolved = args.assemble ?? targetCfg?.assemble ?? cfg.assemble ?? merged.assemble;
  if (assembleResolved !== undefined) {
    merged.assemble = assembleResolved;
  }

  const sourceRootsResolved =
    args.sourceRoots ?? targetCfg?.sourceRoots ?? cfg.sourceRoots ?? merged.sourceRoots;
  if (sourceRootsResolved !== undefined) {
    merged.sourceRoots = sourceRootsResolved;
  }

  const stepOverResolved =
    args.stepOverMaxInstructions ??
    targetCfg?.stepOverMaxInstructions ??
    cfg.stepOverMaxInstructions ??
    merged.stepOverMaxInstructions;
  if (stepOverResolved !== undefined) {
    merged.stepOverMaxInstructions = stepOverResolved;
  }

  const stepOutResolved =
    args.stepOutMaxInstructions ??
    targetCfg?.stepOutMaxInstructions ??
    cfg.stepOutMaxInstructions ??
    merged.stepOutMaxInstructions;
  if (stepOutResolved !== undefined) {
    merged.stepOutMaxInstructions = stepOutResolved;
  }

  const tec1Resolved = args.tec1 ?? targetCfg?.tec1 ?? cfg.tec1 ?? merged.tec1;
  if (tec1Resolved !== undefined) {
    merged.tec1 = tec1Resolved;
  }

  const tec1gResolved = args.tec1g ?? targetCfg?.tec1g ?? cfg.tec1g ?? merged.tec1g;
  if (tec1gResolved !== undefined) {
    merged.tec1g = tec1gResolved;
  }

  const terminalResolved = args.terminal ?? targetCfg?.terminal ?? cfg.terminal ?? merged.terminal;
  if (terminalResolved !== undefined) {
    merged.terminal = terminalResolved;
  }

  if (targetName !== undefined) {
    merged.target = targetName;
  }

  return merged;
}

/**
 * Populates launch arguments from a configuration file.
 * Searches for config file and merges with provided arguments.
 *
 * @param args - Launch request arguments
 * @returns Merged arguments with configuration applied
 */
export function populateFromConfig(args: LaunchRequestArguments): LaunchRequestArguments {
  const configCandidates = getConfigCandidates(args.projectConfig);
  const startDir = getConfigSearchStartDir(args);
  const configPath = findConfigFile(startDir, configCandidates);

  if (configPath === undefined) {
    return args;
  }

  try {
    const cfg = loadConfigFile(configPath);
    return mergeConfig(args, cfg);
  } catch {
    return args;
  }
}
