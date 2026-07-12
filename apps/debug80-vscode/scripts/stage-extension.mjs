import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const files = [
  'CHANGELOG.md',
  'LICENSE',
  'README.md',
  'SUPPORT.md',
  'THIRD_PARTY_NOTICES.md',
  'null-language.json',
  'tec-1g.CoolTermSettings',
  'assets/debug80-icon.png',
  'assets/debug80_pixel_art_flat.png',
];

const directories = ['language-configuration', 'out', 'resources', 'roms', 'schemas', 'syntaxes'];

export function stageExtension() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-vsix-stage-'));
  for (const file of files) {
    const destination = path.join(directory, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(extensionRoot, file), destination);
  }
  for (const source of directories) {
    fs.cpSync(path.join(extensionRoot, source), path.join(directory, source), {
      recursive: true,
      filter: (candidate) => !candidate.endsWith('.map'),
    });
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'));
  delete manifest.dependencies;
  delete manifest.devDependencies;
  delete manifest['lint-staged'];
  delete manifest.overrides;
  delete manifest.scripts;
  manifest.files = ['**/*'];
  fs.writeFileSync(path.join(directory, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return directory;
}

export function removeStage(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
}

export { extensionRoot };
