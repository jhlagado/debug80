/**
 * @file Runnable target entry discovery conventions for Debug80 projects.
 */

import * as fs from 'fs';
import * as path from 'path';

export const TARGET_ENTRY_SOURCE_SUFFIXES = ['.main.asm'] as const;
export const TARGET_ENTRY_SOURCE_FILENAMES = ['main.asm'] as const;

const TARGET_DISCOVERY_EXCLUDED_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  '.vscode',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);

export function isTargetEntrySourcePath(filePath: string): boolean {
  const fileName = path.basename(filePath).toLowerCase();
  return (
    (TARGET_ENTRY_SOURCE_FILENAMES as readonly string[]).includes(fileName) ||
    TARGET_ENTRY_SOURCE_SUFFIXES.some((suffix) => fileName.endsWith(suffix))
  );
}

export function listTargetEntrySourceFiles(rootPath: string): string[] {
  const results: string[] = [];
  collectTargetEntrySourceFiles(rootPath, rootPath, results);
  results.sort((left, right) => left.localeCompare(right));
  return results;
}

function collectTargetEntrySourceFiles(
  rootPath: string,
  currentPath: string,
  results: string[]
): void {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      if (TARGET_DISCOVERY_EXCLUDED_DIRS.has(entry.name.toLowerCase())) {
        continue;
      }
      collectTargetEntrySourceFiles(rootPath, fullPath, results);
      continue;
    }

    if (!entry.isFile() || !isTargetEntrySourcePath(entry.name)) {
      continue;
    }

    results.push(path.relative(rootPath, fullPath).split(path.sep).join('/'));
  }
}
