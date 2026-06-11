import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveCoolTermHexArtifact } from '../../src/extension/coolterm/coolterm-hex-artifact';

const tempDirs: string[] = [];

function makeProject(config: Debug80ProjectConfig): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-coolterm-'));
  tempDirs.push(root);
  writeDebug80Config(root, config);
  return root;
}

type Debug80ProjectConfig = {
  outputDir?: string;
  targets: Record<string, Debug80TargetConfig>;
};

type Debug80TargetConfig = {
  artifactBase?: string;
  hex?: string;
  outputDir?: string;
};

function writeHexArtifact(root: string, relativePath: string): string {
  const artifactPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, ':00000001FF\n');
  return artifactPath;
}

function writeDebug80Config(root: string, config: Debug80ProjectConfig): void {
  fs.writeFileSync(path.join(root, 'debug80.json'), `${JSON.stringify(config, null, 2)}\n`);
}

function expectResolvedHex(root: string, targetName: string, hexPath: string): void {
  expect(resolveCoolTermHexArtifact(root, targetName)).toEqual({
    kind: 'found',
    path: hexPath,
  });
}

function expectMissingHex(root: string, targetName: string, relativePath: string): void {
  expect(resolveCoolTermHexArtifact(root, targetName)).toEqual({
    kind: 'missing',
    path: path.join(root, relativePath),
  });
}

describe('resolveCoolTermHexArtifact', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('resolves an explicit target hex path', () => {
    const root = makeProject({
      targets: {
        app: { hex: 'build/app.hex' },
      },
    });
    const hexPath = writeHexArtifact(root, 'build/app.hex');

    expectResolvedHex(root, 'app', hexPath);
  });

  it('infers outputDir/artifactBase when target hex is omitted', () => {
    const root = makeProject({
      outputDir: 'build',
      targets: {
        app: { artifactBase: 'monitor' },
      },
    });
    const hexPath = writeHexArtifact(root, 'build/monitor.hex');

    expectResolvedHex(root, 'app', hexPath);
  });

  it('reports the expected path when the inferred hex file has not been built', () => {
    const root = makeProject({
      targets: {
        app: { outputDir: 'build', artifactBase: 'app' },
      },
    });

    expectMissingHex(root, 'app', path.join('build', 'app.hex'));
  });
});
