import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildTec1gRomArtifactsIfRequested,
  applyTec1gRomArtifactsToLaunchArgs,
} from '../../src/debug/launch/tec1g-rom-artifact-build';
import type {
  AssembleBinOptions,
  AssembleOptions,
  AssemblerBackend,
} from '../../src/debug/launch/assembler-backend';
import type { LaunchRequestArguments } from '../../src/debug/session/types';

describe('TEC-1G ROM artifact builds', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    tempRoots.length = 0;
  });

  it('builds active source-backed monitor and expansion artifacts even when app assembly is disabled', async () => {
    const root = makeTempRoot();
    const backend = fakeBackend();
    const args: LaunchRequestArguments = {
      assemble: false,
      sourceRoots: ['src'],
      debugMaps: ['build/app.d8.json'],
      tec1g: {
        romArtifacts: [
          {
            id: 'tecm8-monitor',
            role: 'monitor',
            sourceFile: 'roms/tec1g/tecm8/monitor/monitor.asm',
            outputBin: 'build/roms/tec1g/tecm8/monitor/monitor.bin',
            outputDebugMap: 'build/roms/tec1g/tecm8/monitor/monitor.d8.json',
            address: 0xc000,
            size: 0x4000,
          },
          {
            id: 'tecm8-expansion',
            role: 'expansion',
            sourceFile: 'roms/tec1g/tecm8/expansion/expansion.asm',
            outputBin: 'build/roms/tec1g/tecm8/expansion/expansion.bin',
            outputDebugMap: 'build/roms/tec1g/tecm8/expansion/expansion.d8.json',
            windowAddress: 0x8000,
            windowSize: 0x4000,
            imageSize: 0x8000,
            bankSize: 0x4000,
            bankCount: 2,
          },
        ],
      },
    };

    const result = await buildTec1gRomArtifactsIfRequested({
      baseDir: root,
      args,
      backendFactory: () => backend,
      sendEvent: () => undefined,
    });

    expect(backend.assemble).toHaveBeenCalledTimes(2);
    expect(backend.assemble).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        asmPath: path.join(root, 'roms/tec1g/tecm8/monitor/monitor.asm'),
        hexPath: path.join(root, 'build/roms/tec1g/tecm8/monitor/monitor.hex'),
        sourceRoot: root,
      })
    );
    expect(backend.assembleBin).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        asmPath: path.join(root, 'roms/tec1g/tecm8/monitor/monitor.asm'),
        hexPath: path.join(root, 'build/roms/tec1g/tecm8/monitor/monitor.hex'),
        binFrom: 0xc000,
        binTo: 0xffff,
      })
    );
    expect(backend.assembleBin).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        asmPath: path.join(root, 'roms/tec1g/tecm8/expansion/expansion.asm'),
        hexPath: path.join(root, 'build/roms/tec1g/tecm8/expansion/expansion.hex'),
        binFrom: 0x8000,
        binTo: 0xffff,
      })
    );

    applyTec1gRomArtifactsToLaunchArgs(args, result);

    expect(args.tec1g?.romHex).toBe(path.join(root, 'build/roms/tec1g/tecm8/monitor/monitor.bin'));
    expect(args.tec1g?.expansionRomHex).toBe(
      path.join(root, 'build/roms/tec1g/tecm8/expansion/expansion.bin')
    );
    expect(args.debugMaps).toEqual([
      path.join(root, 'build/roms/tec1g/tecm8/monitor/monitor.d8.json'),
      path.join(root, 'build/roms/tec1g/tecm8/expansion/expansion.d8.json'),
      'build/app.d8.json',
    ]);
    expect(args.sourceRoots).toEqual([
      'src',
      'roms/tec1g/tecm8/monitor',
      'roms/tec1g/tecm8/expansion',
    ]);
  });

  it('suppresses bundled MON-3 maps when a generated monitor artifact owns the monitor role', () => {
    const args: LaunchRequestArguments = {
      debugMaps: [
        '/extension/resources/bundles/tec1g/mon3/v1/mon3.d8.json',
        'C:\\debug80\\resources\\bundles\\tec1g\\mon3\\v1\\mon3.d8.json',
        '/workspace/roms/tec1g/mon3/mon3.d8.json',
        'C:\\workspace\\roms\\tec1g\\mon3\\mon3.d8.json',
        '/workspace/build/app.d8.json',
      ],
      tec1g: {},
    };

    applyTec1gRomArtifactsToLaunchArgs(args, [
      {
        id: 'tecm8-monitor',
        role: 'monitor',
        sourceFile: '/workspace/roms/tec1g/tecm8/monitor/monitor.asm',
        outputBin: '/workspace/build/roms/tec1g/tecm8/monitor/monitor.bin',
        outputDebugMap: '/workspace/build/roms/tec1g/tecm8/monitor/monitor.d8.json',
        sourceRoot: 'roms/tec1g/tecm8/monitor',
      },
    ]);

    expect(args.debugMaps).toEqual([
      '/workspace/build/roms/tec1g/tecm8/monitor/monitor.d8.json',
      '/workspace/build/app.d8.json',
    ]);
  });

  it('deduplicates generated ROM debug maps before existing maps', () => {
    const args: LaunchRequestArguments = {
      debugMaps: ['/workspace/build/app.d8.json'],
      tec1g: {},
    };

    applyTec1gRomArtifactsToLaunchArgs(args, [
      {
        id: 'tecm8-monitor',
        role: 'monitor',
        sourceFile: '/workspace/roms/tec1g/tecm8/monitor/monitor.asm',
        outputBin: '/workspace/build/roms/tec1g/tecm8/monitor/monitor.bin',
        outputDebugMap: '/workspace/build/roms/tec1g/tecm8/shared.d8.json',
        sourceRoot: 'roms/tec1g/tecm8/monitor',
      },
      {
        id: 'tecm8-expansion',
        role: 'expansion',
        sourceFile: '/workspace/roms/tec1g/tecm8/expansion/expansion.asm',
        outputBin: '/workspace/build/roms/tec1g/tecm8/expansion/expansion.bin',
        outputDebugMap: '/workspace/build/roms/tec1g/tecm8/shared.d8.json',
        sourceRoot: 'roms/tec1g/tecm8/expansion',
      },
    ]);

    expect(args.debugMaps).toEqual([
      '/workspace/build/roms/tec1g/tecm8/shared.d8.json',
      '/workspace/build/app.d8.json',
    ]);
  });

  it('keeps bundled MON-3 maps when only an expansion artifact is generated', () => {
    const args: LaunchRequestArguments = {
      debugMaps: [
        '/extension/resources/bundles/tec1g/mon3/v1/mon3.d8.json',
        '/workspace/build/app.d8.json',
      ],
      tec1g: {},
    };

    applyTec1gRomArtifactsToLaunchArgs(args, [
      {
        id: 'tecm8-expansion',
        role: 'expansion',
        sourceFile: '/workspace/roms/tec1g/tecm8/expansion/expansion.asm',
        outputBin: '/workspace/build/roms/tec1g/tecm8/expansion/expansion.bin',
        outputDebugMap: '/workspace/build/roms/tec1g/tecm8/expansion/expansion.d8.json',
        sourceRoot: 'roms/tec1g/tecm8/expansion',
      },
    ]);

    expect(args.debugMaps).toEqual([
      '/workspace/build/roms/tec1g/tecm8/expansion/expansion.d8.json',
      '/extension/resources/bundles/tec1g/mon3/v1/mon3.d8.json',
      '/workspace/build/app.d8.json',
    ]);
  });

  it('ignores inactive artifacts during launch', async () => {
    const root = makeTempRoot();
    const backend = fakeBackend();
    const args: LaunchRequestArguments = {
      tec1g: {
        romArtifacts: [
          {
            id: 'future-monitor',
            role: 'monitor',
            active: false,
            sourceFile: 'roms/future-monitor.asm',
            outputBin: 'build/future-monitor.bin',
            address: 0xc000,
            size: 0x4000,
          },
        ],
      },
    };

    const result = await buildTec1gRomArtifactsIfRequested({
      baseDir: root,
      args,
      backendFactory: () => backend,
      sendEvent: () => undefined,
    });

    expect(result).toEqual([]);
    expect(backend.assemble).not.toHaveBeenCalled();
    expect(backend.assembleBin).not.toHaveBeenCalled();
  });

  it('throws when a ROM artifact build fails', async () => {
    const root = makeTempRoot();
    const backend = fakeBackend();
    backend.assemble.mockResolvedValue({ success: false, error: 'bad rom' });
    const args: LaunchRequestArguments = {
      tec1g: {
        romArtifacts: [
          {
            id: 'tecm8-monitor',
            role: 'monitor',
            sourceFile: 'roms/monitor.asm',
            outputBin: 'build/monitor.bin',
            address: 0xc000,
            size: 0x4000,
          },
        ],
      },
    };

    await expect(
      buildTec1gRomArtifactsIfRequested({
        baseDir: root,
        args,
        backendFactory: () => backend,
        sendEvent: () => undefined,
      })
    ).rejects.toThrow('bad rom');
  });

  it('throws when the assembler backend cannot emit ROM binaries', async () => {
    const root = makeTempRoot();
    const backend: AssemblerBackend = {
      id: 'hex-only',
      assemble: vi.fn(() => Promise.resolve({ success: true })),
    };
    const args: LaunchRequestArguments = {
      tec1g: {
        romArtifacts: [
          {
            id: 'tecm8-monitor',
            role: 'monitor',
            sourceFile: 'roms/monitor.asm',
            outputBin: 'build/monitor.bin',
            address: 0xc000,
            size: 0x4000,
          },
        ],
      },
    };

    await expect(
      buildTec1gRomArtifactsIfRequested({
        baseDir: root,
        args,
        backendFactory: () => backend,
        sendEvent: () => undefined,
      })
    ).rejects.toThrow('hex-only cannot emit binary ROM artifact tecm8-monitor');
  });

  it('rejects output paths that do not match AZM-derived artifact paths', async () => {
    const root = makeTempRoot();
    const backend = fakeBackend();
    const args: LaunchRequestArguments = {
      tec1g: {
        romArtifacts: [
          {
            id: 'tecm8-monitor',
            role: 'monitor',
            sourceFile: 'roms/monitor.asm',
            outputBin: 'build/monitor.rom',
            outputDebugMap: 'build/maps/monitor.d8.json',
            address: 0xc000,
            size: 0x4000,
          },
        ],
      },
    };

    await expect(
      buildTec1gRomArtifactsIfRequested({
        baseDir: root,
        args,
        backendFactory: () => backend,
        sendEvent: () => undefined,
      })
    ).rejects.toThrow(
      'ROM artifact tecm8-monitor outputBin must use .bin so AZM writes the configured binary'
    );
    expect(backend.assemble).not.toHaveBeenCalled();
  });

  it('rejects outputDebugMap paths that do not match the outputBin artifact base', async () => {
    const root = makeTempRoot();
    const backend = fakeBackend();
    const args: LaunchRequestArguments = {
      tec1g: {
        romArtifacts: [
          {
            id: 'tecm8-monitor',
            role: 'monitor',
            sourceFile: 'roms/monitor.asm',
            outputBin: 'build/monitor.bin',
            outputDebugMap: 'build/maps/monitor.d8.json',
            address: 0xc000,
            size: 0x4000,
          },
        ],
      },
    };

    await expect(
      buildTec1gRomArtifactsIfRequested({
        baseDir: root,
        args,
        backendFactory: () => backend,
        sendEvent: () => undefined,
      })
    ).rejects.toThrow(`ROM artifact tecm8-monitor outputDebugMap must match ${path.join(root, 'build', 'monitor.d8.json')}`);
    expect(backend.assemble).not.toHaveBeenCalled();
  });

  function makeTempRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-rom-artifact-build-'));
    tempRoots.push(root);
    return root;
  }
});

function fakeBackend(): AssemblerBackend & {
  assemble: ReturnType<typeof vi.fn>;
  assembleBin: ReturnType<typeof vi.fn>;
} {
  return {
    id: 'fake-azm',
    assemble: vi.fn((options: AssembleOptions) => {
      writeText(options.hexPath, ':00000001FF\n');
      writeText(replaceExtension(options.hexPath, '.d8.json'), '{}\n');
      return Promise.resolve({ success: true });
    }),
    assembleBin: vi.fn((options: AssembleBinOptions) => {
      writeBinary(replaceExtension(options.hexPath, '.bin'), Buffer.from([0]));
      return Promise.resolve({ success: true });
    }),
  };
}

function replaceExtension(filePath: string, extension: string): string {
  return path.join(
    path.dirname(filePath),
    `${path.basename(filePath, path.extname(filePath))}${extension}`
  );
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writeBinary(filePath: string, content: Buffer): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}
