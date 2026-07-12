import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { rollup, watch as watchRollup } from 'rollup';
import esbuild from 'rollup-plugin-esbuild';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');

const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const inputOptions = {
  input: path.join(rootDirectory, 'src', 'extension', 'extension.ts'),
  external: (id) => id === 'vscode' || builtins.has(id),
  plugins: [
    nodeResolve({ preferBuiltins: true }),
    commonjs(),
    esbuild({ target: 'es2022', tsconfig: path.join(rootDirectory, 'tsconfig.json') }),
  ],
};
const outputOptions = {
  file: path.join(rootDirectory, 'out', 'extension', 'extension.js'),
  format: 'es',
  sourcemap: true,
  inlineDynamicImports: true,
};

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
