/**
 * @fileoverview Configuration utility functions.
 * Provides helpers for project configuration discovery and directory management.
 */

import * as fs from 'fs';
import * as path from 'path';
import { toPortableRelative } from './path-utils';

/**
 * Result of inferring a default build target.
 */
export interface InferredTarget {
  /** Relative path to the source file */
  sourceFile: string;
  /** Output directory for build artifacts */
  outputDir: string;
  /** Base name for output files (without extension) */
  artifactBase: string;
  /** Whether the source file was actually found */
  found: boolean;
}

/** Default source file location */
const DEFAULT_SOURCE = 'src/main.asm';
/** Default output directory */
const DEFAULT_OUTPUT_DIR = 'build';

/**
 * Infers a default build target by searching for assembly files.
 *
 * Search order:
 * 1. src/main.asm (preferred)
 * 2. main.asm in root
 * 3. First .asm file in src/
 * 4. First .asm file in root
 * 5. Falls back to src/main.asm (not found)
 *
 * @param root - Project root directory
 * @returns Inferred target with source file and output paths
 */
export function inferDefaultTarget(root: string): InferredTarget {
  const rootDir = root ?? process.cwd();
  const preferred = path.join(rootDir, 'src', 'main.asm');
  const rootMain = path.join(rootDir, 'main.asm');
  const srcAny = findFirstAsm(path.join(rootDir, 'src'));
  const rootAny = findFirstAsm(rootDir);

  const chosen =
    existing(preferred) ??
    existing(rootMain) ??
    srcAny ??
    rootAny ??
    path.join(rootDir, DEFAULT_SOURCE);

  const found = fs.existsSync(chosen);
  const rel = normalizeRelative(rootDir, chosen);

  return {
    sourceFile: rel,
    outputDir: DEFAULT_OUTPUT_DIR,
    artifactBase: path.basename(rel, path.extname(rel)) || 'main',
    found,
  };
}

/**
 * Ensures a directory exists, creating it recursively if needed.
 * No-op for empty string or '.' paths.
 *
 * @param dir - Directory path to create
 */
export function ensureDirExists(dir: string): void {
  if (dir === '' || dir === '.') {
    return;
  }
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const existing = (p: string): string | undefined => (fs.existsSync(p) ? p : undefined);

function normalizeRelative(root: string, absolutePath: string): string {
  return toPortableRelative(root, absolutePath);
}

function findFirstAsm(dir: string): string | undefined {
  if (!fs.existsSync(dir)) {
    return undefined;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.asm')) {
      return path.join(dir, entry.name);
    }
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const child = findFirstAsm(path.join(dir, entry.name));
      if (child !== undefined) {
        return child;
      }
    }
  }

  return undefined;
}
