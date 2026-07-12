/**
 * Filesystem and path utilities for Debug80 project target selection.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getTargetEntrySource, normalizeProjectRelativePath } from './project-target-source-policy';
import { listTargetEntrySourceFiles } from './target-discovery';

const SOURCE_FILE_CACHE_TTL_MS = 2000;

type ExistsSync = (candidate: string) => boolean;
type DiscoverSourceFiles = (projectRoot: string) => string[];

export function projectRootFromProjectConfigPath(projectConfigPath: string): string {
  const normalized = projectConfigPath.replace(/\\/g, '/');
  if (normalized.endsWith('.vscode/debug80.json')) {
    return path.dirname(path.dirname(projectConfigPath));
  }
  return path.dirname(projectConfigPath);
}

export function targetProgramFileExists(
  projectRoot: string,
  target: Record<string, unknown>,
  existsSync: ExistsSync = fs.existsSync
): boolean {
  const sourcePath = getTargetEntrySource(target);
  if (sourcePath === undefined || sourcePath.trim().length === 0) {
    return true;
  }
  const abs = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.join(projectRoot, normalizeProjectRelativePath(sourcePath));
  try {
    return existsSync(abs);
  } catch {
    return false;
  }
}

type SourceFileCacheEntry = { files: string[]; cachedAt: number };

export class ProjectTargetSourceFileCache {
  private readonly entries = new Map<string, SourceFileCacheEntry>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly discover: DiscoverSourceFiles;

  constructor(
    options: {
      ttlMs?: number;
      now?: () => number;
      discover?: DiscoverSourceFiles;
    } = {}
  ) {
    this.ttlMs = options.ttlMs ?? SOURCE_FILE_CACHE_TTL_MS;
    this.now = options.now ?? Date.now;
    this.discover = options.discover ?? listTargetEntrySourceFiles;
  }

  get(projectRoot: string): string[] {
    const cached = this.entries.get(projectRoot);
    const now = this.now();
    if (cached !== undefined && now - cached.cachedAt < this.ttlMs) {
      return cached.files;
    }
    const files = this.discover(projectRoot);
    this.entries.set(projectRoot, { files, cachedAt: now });
    return files;
  }
}
