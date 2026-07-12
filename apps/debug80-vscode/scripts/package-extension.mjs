import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { extensionRoot, removeStage, stageExtension } from './stage-extension.mjs';

const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'));
const output = path.join(extensionRoot, `${manifest.name}-${manifest.version}.vsix`);
const stage = stageExtension();

try {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(command, ['vsce', 'package', '--no-dependencies', '-o', output], {
    cwd: stage,
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
} finally {
  removeStage(stage);
}
