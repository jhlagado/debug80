/**
 * @file Runnable target entry discovery conventions for Debug80 projects.
 */

import * as fs from 'fs';
import * as path from 'path';

export const TARGET_ENTRY_SOURCE_FILENAMES = ['main.asm', 'main.z80', 'main.nu'] as const;
export const TARGET_SOURCE_EXTENSIONS = ['.asm', '.z80', '.nu'] as const;

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
  return (TARGET_ENTRY_SOURCE_FILENAMES as readonly string[]).includes(fileName);
}

export function isTargetSourcePath(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return (TARGET_SOURCE_EXTENSIONS as readonly string[]).includes(extension);
}

export function listTargetEntrySourceFiles(rootPath: string): string[] {
  return listTargetSourceFiles(rootPath).filter((filePath) => isTargetEntrySourcePath(filePath));
}

export function listTargetSourceFiles(rootPath: string): string[] {
  const results: string[] = [];
  collectTargetSourceFiles(rootPath, rootPath, results);
  results.sort((left, right) => left.localeCompare(right));
  return results;
}

function collectTargetSourceFiles(rootPath: string, currentPath: string, results: string[]): void {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      if (TARGET_DISCOVERY_EXCLUDED_DIRS.has(entry.name.toLowerCase())) {
        continue;
      }
      collectTargetSourceFiles(rootPath, fullPath, results);
      continue;
    }

    if (!entry.isFile() || !isTargetSourcePath(entry.name)) {
      continue;
    }
    results.push(path.relative(rootPath, fullPath).split(path.sep).join('/'));
  }
}
