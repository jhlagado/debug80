import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveCoolTermHexArtifact } from '../../src/extension/coolterm/coolterm-hex-artifact';

const tempDirs: string[] = [];

function makeProject(config: unknown): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-coolterm-'));
  tempDirs.push(root);
  fs.writeFileSync(path.join(root, 'debug80.json'), `${JSON.stringify(config, null, 2)}\n`);
  return root;
}

function writeHexArtifact(root: string, relativePath: string): string {
  const artifactPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, ':00000001FF\n');
  return artifactPath;
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

    expect(resolveCoolTermHexArtifact(root, 'app')).toEqual({
      kind: 'found',
      path: hexPath,
    });
  });

  it('infers outputDir/artifactBase when target hex is omitted', () => {
    const root = makeProject({
      outputDir: 'build',
      targets: {
        app: { artifactBase: 'monitor' },
      },
    });
    const hexPath = writeHexArtifact(root, 'build/monitor.hex');

    expect(resolveCoolTermHexArtifact(root, 'app')).toEqual({
      kind: 'found',
      path: hexPath,
    });
  });

  it('reports the expected path when the inferred hex file has not been built', () => {
    const root = makeProject({
      targets: {
        app: { outputDir: 'build', artifactBase: 'app' },
      },
    });

    expect(resolveCoolTermHexArtifact(root, 'app')).toEqual({
      kind: 'missing',
      path: path.join(root, 'build', 'app.hex'),
    });
  });
});
