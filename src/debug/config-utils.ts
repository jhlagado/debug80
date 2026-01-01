import * as fs from 'fs';
import * as path from 'path';

export interface InferredTarget {
  sourceFile: string;
  outputDir: string;
  artifactBase: string;
  found: boolean;
}

const DEFAULT_SOURCE = 'src/main.asm';
const DEFAULT_OUTPUT_DIR = 'build';

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
  const rel = path.relative(root, absolutePath) || path.basename(absolutePath);
  return rel.split(path.sep).join('/');
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
