const path = require('path');
const fs = require('fs/promises');
const esbuild = require('esbuild');

const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'out', 'webview');
const webviewDir = path.join(rootDir, 'webview');

const entryPoints = [
  path.join(webviewDir, 'tec1', 'index.ts'),
  path.join(webviewDir, 'tec1g', 'index.ts'),
];

const staticFiles = [
  path.join(webviewDir, 'common', 'styles.css'),
  path.join(webviewDir, 'tec1', 'index.html'),
  path.join(webviewDir, 'tec1', 'styles.css'),
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
  });

  await Promise.all(staticFiles.map((file) => copyFile(file, outDir)));
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
