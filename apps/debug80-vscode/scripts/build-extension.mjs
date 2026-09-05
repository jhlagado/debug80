import fs from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { rollup, watch as watchRollup } from 'rollup';
import esbuild from 'rollup-plugin-esbuild';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const atomPackageRoot = path.resolve(
  path.dirname(createRequire(import.meta.url).resolve('atom-z80')),
  '..',
  '..'
);
const atomNativeCoreSource = path.join(atomPackageRoot, 'assets', 'native-core.json');
const nucleusPackageRoot = path.resolve(
  path.dirname(createRequire(import.meta.url).resolve('@jhlagado/nucleus')),
  '..'
);
const nucleusLibrarySource = path.join(nucleusPackageRoot, 'library');
const watch = process.argv.includes('--watch');

const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const inputOptions = {
  input: path.join(rootDirectory, 'src', 'extension', 'extension.ts'),
  external: (id) => id === 'vscode' || builtins.has(id),
  plugins: [
    {
      name: 'exclude-historical-assembler',
      resolveId(id) {
        if (id === '@jhlagado/azm' || id.startsWith('@jhlagado/azm/')) {
          this.error(
            'AZM must remain an optional project tool, not a bundled extension dependency'
          );
        }
      },
      generateBundle() {
        for (const id of this.getModuleIds()) {
          if (/\/(?:packages\/azm|node_modules\/@jhlagado\/azm)\//.test(id.replaceAll('\\', '/'))) {
            this.error(`Historical AZM module reached the shipping bundle: ${id}`);
          }
        }
      },
    },
    nodeResolve({ preferBuiltins: true }),
    commonjs(),
    esbuild({ target: 'es2022', tsconfig: path.join(rootDirectory, 'tsconfig.json') }),
    compilerAssetsPlugin(),
  ],
};
const outputOptions = {
  file: path.join(rootDirectory, 'out', 'extension', 'extension.js'),
  format: 'es',
  sourcemap: true,
  inlineDynamicImports: true,
};
const atomPackageAssetPath = '../../../assets/native-core.json';
const bundledExtensionAssetPath = '../assets/native-core.json';

function compilerAssetsPlugin() {
  return {
    name: 'debug80-compiler-assets',
    buildStart() {
      this.addWatchFile(atomNativeCoreSource);
      for (const entry of fs.readdirSync(nucleusLibrarySource, { recursive: true })) {
        const source = path.join(nucleusLibrarySource, entry);
        if (fs.statSync(source).isFile()) this.addWatchFile(source);
      }
    },
    renderChunk(code) {
      if (!code.includes(atomPackageAssetPath)) {
        this.error('bundled Atom native-core asset path was not found');
      }
      return {
        code: code.split(atomPackageAssetPath).join(bundledExtensionAssetPath),
        map: null,
      };
    },
    writeBundle() {
      const assetDirectory = path.join(rootDirectory, 'out', 'assets');
      fs.mkdirSync(assetDirectory, { recursive: true });
      fs.copyFileSync(atomNativeCoreSource, path.join(assetDirectory, 'native-core.json'));
      fs.cpSync(nucleusLibrarySource, path.join(rootDirectory, 'out', 'library'), {
        recursive: true,
      });
    },
  };
}

if (watch) {
  const watcher = watchRollup({ ...inputOptions, output: outputOptions });
  watcher.on('event', (event) => {
    if (event.code === 'ERROR') {
      console.error(event.error);
    }
  });
} else {
  const bundle = await rollup(inputOptions);
  await bundle.write(outputOptions);
  await bundle.close();
}
