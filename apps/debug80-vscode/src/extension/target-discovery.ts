/**
 * @file Runnable target entry discovery conventions for Debug80 projects.
 */

import * as fs from 'fs';
import * as path from 'path';

export const TARGET_ENTRY_SOURCE_SUFFIXES = ['.main.asm', '.main.z80'] as const;
export const TARGET_ENTRY_SOURCE_FILENAMES = ['main.asm', 'main.z80'] as const;
export const TARGET_SOURCE_EXTENSIONS = ['.asm', '.z80', '.glim'] as const;

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
    fileName.endsWith('.glim') ||
    (TARGET_ENTRY_SOURCE_FILENAMES as readonly string[]).includes(fileName) ||
    TARGET_ENTRY_SOURCE_SUFFIXES.some((suffix) => fileName.endsWith(suffix))
  );
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
    if (entry.name.toLowerCase().endsWith('.glim') && !hasGlimmerProgramDeclaration(fullPath)) {
      continue;
    }

    results.push(path.relative(rootPath, fullPath).split(path.sep).join('/'));
  }
}

function hasGlimmerProgramDeclaration(filePath: string): boolean {
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    let inAzmBody = false;
    for (const rawLine of lines) {
      const comment = rawLine.indexOf(';');
      const line = (comment >= 0 ? rawLine.slice(0, comment) : rawLine).trim();
      if (line === 'begin') {
        inAzmBody = true;
        continue;
      }
      if (line === 'end' && inAzmBody) {
        inAzmBody = false;
        continue;
      }
      if (!inAzmBody && /^program\s+[A-Za-z_][A-Za-z0-9_]*$/.test(line)) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}
