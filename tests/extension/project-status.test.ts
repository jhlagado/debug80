import { describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveProjectStatusSummary } from '../../src/extension/project-status';

vi.mock('vscode', () => ({}));

describe('project-status', () => {
  it('resolves the selected project target and entry source', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-project-status-'));
    fs.mkdirSync(path.join(root, '.vscode'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.vscode', 'debug80.json'),
      JSON.stringify({
        defaultTarget: 'app',
        targets: {
          app: { sourceFile: 'src/main.asm' },
          serial: { sourceFile: 'src/serial.asm' },
        },
      })
    );

    const summary = resolveProjectStatusSummary(
      {
        get: vi.fn((key: string) =>
          key === `debug80.selectedTarget:${path.join(root, '.vscode', 'debug80.json')}`
            ? 'serial'
            : undefined
        ),
        update: vi.fn(),
      } as never,
      {
        name: 'demo',
        uri: { fsPath: root },
      } as never
    );

    expect(summary).toEqual({
      projectName: 'demo',
      targetName: 'serial',
      entrySource: 'src/serial.asm',
    });
  });
});