import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { extensionRoot } from './stage-extension.mjs';

const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'));
const packagePath = path.join(extensionRoot, `${manifest.name}-${manifest.version}.vsix`);

if (!fs.existsSync(packagePath)) {
  throw new Error(`Verified VSIX not found: ${packagePath}`);
}

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(command, ['vsce', 'publish', '--packagePath', packagePath], {
  cwd: extensionRoot,
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
}
