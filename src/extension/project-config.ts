/**
 * @file Shared helpers for locating and reading Debug80 project configs.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { ProjectConfig } from '../debug/types';

export const PROJECT_CONFIG_CANDIDATES = [
  path.join('.vscode', 'debug80.json'),
  'debug80.json',
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
      return pkg.debug80;
    }

    const raw = fs.readFileSync(projectConfigPath, 'utf-8');
    return JSON.parse(raw) as ProjectConfig;
  } catch {
    return undefined;
  }
}

/**
 * Merged launch args resolve the assemble input as `asm` before `sourceFile`
 * (see `populateFromConfig` in launch-args). Keep both in sync when the user
 * picks a new entry source so ZAX (and asm80) targets assemble the selected file.
 */
function nextTargetEntrySource(
  target: Record<string, unknown>,
  sourceFile: string
): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...target };
  delete rest.assembler;
  const isZax = sourceFile.toLowerCase().endsWith('.zax');
  return {
    ...rest,
    sourceFile,
    asm: sourceFile,
    ...(isZax ? { assembler: 'zax' } : {}),
  };
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

const SKIP_DIRS = new Set(['.git', '.vscode', 'node_modules', 'out', 'dist', 'build', 'coverage']);

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