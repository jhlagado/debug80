import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(rootDir, 'out', 'webview');
const webviewDir = path.join(rootDir, 'webview');

const entryPoints = [
  path.join(webviewDir, 'simple', 'index.ts'),
  path.join(webviewDir, 'tec1', 'index.ts'),
  path.join(webviewDir, 'tec1g', 'index.ts'),
];

const staticFiles = [
  path.join(webviewDir, 'common', 'styles.css'),
  path.join(webviewDir, 'simple', 'index.html'),
  path.join(webviewDir, 'simple', 'styles.css'),
  path.join(webviewDir, 'tec1', 'index.html'),
  path.join(webviewDir, 'tec1', 'styles.css'),
  path.join(webviewDir, 'terminal', 'index.html'),
  path.join(webviewDir, 'tec1g', 'index.html'),
  path.join(webviewDir, 'tec1g', 'styles.css'),
];

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function copyFile(src, destRoot) {
  const rel = path.relative(webviewDir, src);
  const dest = path.join(destRoot, rel);
  await ensureDir(dest);
  await fs.copyFile(src, dest);
}

async function build() {
  await esbuild.build({
    entryPoints,
    outdir: outDir,
    outbase: webviewDir,
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: ['es2020'],
    sourcemap: true,
    loader: {
      '.bin': 'binary',
    },
  });

  await Promise.all(staticFiles.map((file) => copyFile(file, outDir)));
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
