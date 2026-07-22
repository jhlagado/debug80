import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssembleFailureError } from '../../src/debug/launch/assembler';

const assembleIfRequested = vi.fn();
const showErrorMessage = vi.fn();
const showInformationMessage = vi.fn();
const startDebugging = vi.fn();

vi.mock('../../src/debug/launch/launch-pipeline', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/debug/launch/launch-pipeline')>()),
  assembleIfRequested,
}));

vi.mock('vscode', () => ({
  debug: { startDebugging },
  workspace: { workspaceFolders: [] },
  window: { showErrorMessage, showInformationMessage },
}));

describe('debug session actions', () => {
  let root: string;

  beforeEach(() => {
    vi.clearAllMocks();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-build-action-'));
    fs.writeFileSync(
      path.join(root, 'debug80.json'),
      JSON.stringify({
        defaultTarget: 'first',
        targets: {
          first: { sourceFile: 'first.asm', platform: 'simple' },
          second: {
            sourceFile: 'second.asm',
            platform: 'simple',
            assemble: false,
            simple: { binFrom: 0x4000, binTo: 0x40ff },
          },
        },
      })
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('builds the selected target, overrides run-only assembly disablement, and forwards output', async () => {
    assembleIfRequested.mockImplementation((options) => {
      options.onOutput?.('assembled second.asm\n');
      return Promise.resolve();
    });
    const harness = await createBuildHarness('second');

    await expect(harness.build()).resolves.toBe(true);

    expect(assembleIfRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        asmPath: path.join(root, 'second.asm'),
        args: expect.objectContaining({ target: 'second', assemble: true }),
        simpleConfig: expect.objectContaining({ binFrom: 0x4000, binTo: 0x40ff }),
      })
    );
    expect(harness.output.append).toHaveBeenCalledWith('assembled second.asm\n');
    expect(harness.output.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('Build succeeded:')
    );
    expect(harness.output.show).not.toHaveBeenCalled();
  });

  it('reports assembly failures in the panel and output without opening an error modal', async () => {
    assembleIfRequested.mockRejectedValue(
      new AssembleFailureError({
        success: false,
        diagnostic: {
          path: path.join(root, 'second.asm'),
          line: 7,
          message: 'unsupported source line',
          sourceLine: '.orgg 0x4000',
        },
      })
    );
    const harness = await createBuildHarness('second');

    await expect(harness.build()).resolves.toBe(false);

    expect(harness.setBuildStatus).toHaveBeenCalledWith('Build failed: second.asm:7', 'error');
    expect(harness.output.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('unsupported source line')
    );
    expect(harness.output.show).toHaveBeenCalledWith(true);
    expect(showErrorMessage).not.toHaveBeenCalled();
  });

  it('rejects malformed merged Simple binary ranges before assembly', async () => {
    fs.writeFileSync(
      path.join(root, 'debug80.json'),
      JSON.stringify({
        defaultTarget: 'second',
        targets: {
          second: {
            sourceFile: 'second.asm',
            platform: 'simple',
            simple: { binFrom: 0x4000 },
          },
        },
      })
    );
    const harness = await createBuildHarness('second');

    await expect(harness.build()).resolves.toBe(false);

    expect(assembleIfRequested).not.toHaveBeenCalled();
    expect(harness.setBuildStatus).toHaveBeenCalledWith('Build failed.', 'error');
    expect(harness.output.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('simple.binFrom and simple.binTo must be specified together')
    );
  });

  async function createBuildHarness(target: string) {
    const { buildCurrentProjectTarget } = await import('../../src/extension/debug-session-actions');
    const folder = { name: 'project', index: 0, uri: { fsPath: root } };
    const workspaceSelection = { rememberWorkspace: vi.fn() };
    const targetSelection = { resolveTarget: vi.fn().mockResolvedValue(target) };
    const output = { append: vi.fn(), appendLine: vi.fn(), show: vi.fn() };
    const setBuildStatus = vi.fn();
    return {
      output,
      setBuildStatus,
      build: () =>
        buildCurrentProjectTarget(
          folder as never,
          workspaceSelection as never,
          targetSelection as never,
          {
            stopOnEntry: false,
            azmRegisterContractsMode: 'off',
            azmContractUpdateMode: 'never',
          },
          output as never,
          setBuildStatus
        ),
    };
  }
});
