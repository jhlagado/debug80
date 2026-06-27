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
            imageSize: 0x24000,
            bankSize: 0x4000,
            bankCount: 9,
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

    expect(fs.statSync(path.join(root, 'build/roms/tec1g/tecm8/monitor/monitor.bin')).size).toBe(0x4000);
    expect(fs.statSync(path.join(root, 'build/roms/tec1g/tecm8/expansion/expansion.bin')).size).toBe(0x24000);
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
        binTo: 0xbfff,
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
      'roms/tec1g/tecm8/monitor',
      'roms/tec1g/tecm8/expansion',
      'src',
    ]);
  });

  it('does not apply app register-contract checks to source-backed ROM artifacts', async () => {
    const root = makeTempRoot();
    const backend = fakeBackend();
    const args: LaunchRequestArguments = {
      azm: {
        registerContracts: 'strict',
        registerContractsProfile: 'mon3',
      },
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
        ],
      },
    };

    await buildTec1gRomArtifactsIfRequested({
      baseDir: root,
      args,
      backendFactory: () => backend,
      sendEvent: () => undefined,
    });

    expect(backend.assemble).toHaveBeenCalledWith(
      expect.objectContaining({
        azm: expect.objectContaining({
          registerContracts: 'off',
          emitRegisterReport: false,
        }),
      })
    );
    expect(backend.assembleBin).toHaveBeenCalledWith(
      expect.objectContaining({
        azm: expect.objectContaining({
          registerContracts: 'off',
          emitRegisterReport: false,
        }),
      })
    );
  });

  it('builds per-bank expansion artifacts and packs them into the runtime image', async () => {
    const root = makeTempRoot();
    const backend = fakeBackend();
    backend.assembleBin.mockImplementation((options: AssembleBinOptions) => {
      const bankName = path.basename(options.asmPath, '.asm');
      const bankNumber = Number.parseInt(bankName.replace('bank', ''), 10);
      writeBinary(replaceExtension(options.hexPath, '.bin'), Buffer.from([bankNumber + 1]));
      return { success: true };
    });
    const args: LaunchRequestArguments = {
      sourceRoots: ['src'],
      tec1g: {
        romArtifacts: [
          {
            id: 'tecm8-expansion',
            role: 'expansion',
            outputBin: 'build/roms/tec1g/tecm8/expansion/expansion-144k.bin',
            windowAddress: 0x8000,
            windowSize: 0x4000,
            imageSize: 0x24000,
            bankSize: 0x4000,
            bankCount: 9,
            banks: [
              {
                physicalBank: 0,
                sourceFile: 'roms/tec1g/tecm8/expansion/bank0.asm',
                outputBin: 'build/roms/tec1g/tecm8/expansion/bank0.bin',
                outputDebugMap: 'build/roms/tec1g/tecm8/expansion/bank0.d8.json',
              },
              {
                physicalBank: 1,
                sourceFile: 'roms/tec1g/tecm8/expansion/bank1.asm',
                outputBin: 'build/roms/tec1g/tecm8/expansion/bank1.bin',
                outputDebugMap: 'build/roms/tec1g/tecm8/expansion/bank1.d8.json',
              },
              {
                physicalBank: 8,
                sourceFile: 'roms/tec1g/tecm8/expansion/bank8.asm',
                outputBin: 'build/roms/tec1g/tecm8/expansion/bank8.bin',
                outputDebugMap: 'build/roms/tec1g/tecm8/expansion/bank8.d8.json',
              },
            ],
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

    const packed = fs.readFileSync(
      path.join(root, 'build/roms/tec1g/tecm8/expansion/expansion-144k.bin')
    );
    expect(packed).toHaveLength(0x24000);
    expect(packed[0x00000]).toBe(0x01);
    expect(packed[0x04000]).toBe(0x02);
    expect(packed[0x20000]).toBe(0x09);
    expect(fs.statSync(path.join(root, 'build/roms/tec1g/tecm8/expansion/bank0.bin')).size).toBe(0x4000);
    expect(fs.statSync(path.join(root, 'build/roms/tec1g/tecm8/expansion/bank8.bin')).size).toBe(0x4000);
    expect(backend.assembleBin).toHaveBeenCalledTimes(3);
    expect(backend.assembleBin).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        asmPath: path.join(root, 'roms/tec1g/tecm8/expansion/bank8.asm'),
        hexPath: path.join(root, 'build/roms/tec1g/tecm8/expansion/bank8.hex'),
        binFrom: 0x8000,
        binTo: 0xbfff,
      })
    );

    applyTec1gRomArtifactsToLaunchArgs(args, result);

    expect(args.tec1g?.expansionRomHex).toBe(
      path.join(root, 'build/roms/tec1g/tecm8/expansion/expansion-144k.bin')
    );
    expect(args.debugMaps).toEqual([
      path.join(root, 'build/roms/tec1g/tecm8/expansion/bank0.d8.json'),
      path.join(root, 'build/roms/tec1g/tecm8/expansion/bank1.d8.json'),
      path.join(root, 'build/roms/tec1g/tecm8/expansion/bank8.d8.json'),
    ]);
    expect(args.sourceRoots).toEqual(['roms/tec1g/tecm8/expansion', 'src']);
  });

  it('builds configurable multibank expansion output recipes', async () => {
    const root = makeTempRoot();
    const backend = fakeBackend();
    backend.assembleBin.mockImplementation((options: AssembleBinOptions) => {
      const bankName = path.basename(options.asmPath, '.asm');
      const bankNumber = Number.parseInt(bankName.replace('bank', ''), 10);
      writeBinary(replaceExtension(options.hexPath, '.bin'), Buffer.from([bankNumber + 1]));
      return { success: true };
    });
    const args: LaunchRequestArguments = {
      tec1g: {
        romArtifacts: [
          {
            id: 'tecm8-expansion',
            role: 'expansion',
            outputBin: 'build/roms/tec1g/tecm8/expansion/debug80-runtime.bin',
            windowAddress: 0x8000,
            windowSize: 0x4000,
            imageSize: 0x24000,
            bankSize: 0x4000,
            bankCount: 9,
            banks: [
              {
                physicalBank: 0,
                sourceFile: 'roms/tec1g/tecm8/expansion/bank0.asm',
                outputBin: 'build/roms/tec1g/tecm8/expansion/bank0.bin',
              },
              {
                physicalBank: 1,
                sourceFile: 'roms/tec1g/tecm8/expansion/bank1.asm',
                outputBin: 'build/roms/tec1g/tecm8/expansion/bank1.bin',
              },
              {
                physicalBank: 8,
                sourceFile: 'roms/tec1g/tecm8/expansion/bank8.asm',
                outputBin: 'build/roms/tec1g/tecm8/expansion/bank8.bin',
              },
            ],
            outputs: [
              {
                id: 'debug80-runtime',
                kind: 'packed',
                layout: 'physical',
                outputBin: 'build/roms/tec1g/tecm8/expansion/debug80-runtime.bin',
                banks: [0, 1, 8],
              },
              {
                id: 'legacy-expansion-32k',
                kind: 'packed',
                layout: 'contiguous',
                outputBin: 'build/roms/tec1g/tecm8/expansion/legacy-expansion-32k.bin',
                banks: [0, 1],
              },
              {
                id: 'per-bank-reference',
                kind: 'perBank',
                outputDir: 'build/roms/tec1g/tecm8/expansion/banks',
                banks: [0, 8],
              },
            ],
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

    const runtime = fs.readFileSync(
      path.join(root, 'build/roms/tec1g/tecm8/expansion/debug80-runtime.bin')
    );
    const legacy32k = fs.readFileSync(
      path.join(root, 'build/roms/tec1g/tecm8/expansion/legacy-expansion-32k.bin')
    );
    const copiedBank0 = fs.readFileSync(
      path.join(root, 'build/roms/tec1g/tecm8/expansion/banks/bank0.bin')
    );
    const copiedBank8 = fs.readFileSync(
      path.join(root, 'build/roms/tec1g/tecm8/expansion/banks/bank8.bin')
    );

    expect(runtime).toHaveLength(0x24000);
    expect(runtime[0x00000]).toBe(0x01);
    expect(runtime[0x04000]).toBe(0x02);
    expect(runtime[0x20000]).toBe(0x09);
    expect(legacy32k).toHaveLength(0x8000);
    expect(legacy32k[0x00000]).toBe(0x01);
    expect(legacy32k[0x04000]).toBe(0x02);
    expect(copiedBank0).toHaveLength(0x4000);
    expect(copiedBank0[0]).toBe(0x01);
    expect(copiedBank8).toHaveLength(0x4000);
    expect(copiedBank8[0]).toBe(0x09);
    expect(result[0]?.outputBin).toBe(
      path.join(root, 'build/roms/tec1g/tecm8/expansion/debug80-runtime.bin')
    );
  });

  it('rejects contiguous output recipes that write the runtime image path', async () => {
    const root = makeTempRoot();
    const backend = fakeBackend();
    const args: LaunchRequestArguments = {
      tec1g: {
        romArtifacts: [
          {
            id: 'bad-expansion',
            role: 'expansion',
            outputBin: 'build/debug80-runtime.bin',
            windowAddress: 0x8000,
            windowSize: 0x4000,
            imageSize: 0x24000,
            bankSize: 0x4000,
            bankCount: 9,
            banks: [
              {
                physicalBank: 0,
                sourceFile: 'roms/bank0.asm',
                outputBin: 'build/bank0.bin',
              },
              {
                physicalBank: 8,
                sourceFile: 'roms/bank8.asm',
                outputBin: 'build/bank8.bin',
              },
            ],
            outputs: [
              {
                id: 'bad-runtime',
                kind: 'packed',
                outputBin: 'build/debug80-runtime.bin',
                banks: [0, 8],
              },
            ],
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
    ).rejects.toThrow('ROM artifact bad-expansion output bad-runtime writes the runtime outputBin and must use physical layout');
    expect(backend.assemble).not.toHaveBeenCalled();
    expect(backend.assembleBin).not.toHaveBeenCalled();
  });

  it('rejects invalid physical banks before building multibank expansion artifacts', async () => {
    const root = makeTempRoot();
    const backend = fakeBackend();
    const args: LaunchRequestArguments = {
      tec1g: {
        romArtifacts: [
          {
            id: 'bad-expansion',
            role: 'expansion',
            outputBin: 'build/expansion.bin',
            windowAddress: 0x8000,
            windowSize: 0x4000,
            imageSize: 0x8000,
            bankSize: 0x4000,
            bankCount: 2,
            banks: [
              {
                physicalBank: 2,
                sourceFile: 'roms/bank2.asm',
                outputBin: 'build/bank2.bin',
              },
            ],
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
    ).rejects.toThrow('ROM artifact bad-expansion bank 2 is outside bankCount 2');
    expect(backend.assemble).not.toHaveBeenCalled();
    expect(backend.assembleBin).not.toHaveBeenCalled();
  });

  it('rejects physical banks beyond the supported TEC-1G range before building', async () => {
    const root = makeTempRoot();
    const backend = fakeBackend();
    const args: LaunchRequestArguments = {
      tec1g: {
        romArtifacts: [
          {
            id: 'bad-expansion',
            role: 'expansion',
            outputBin: 'build/expansion.bin',
            windowAddress: 0x8000,
            windowSize: 0x4000,
            imageSize: 0x28000,
            bankSize: 0x4000,
            bankCount: 10,
            banks: [
              {
                physicalBank: 9,
                sourceFile: 'roms/bank9.asm',
                outputBin: 'build/bank9.bin',
              },
            ],
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
    ).rejects.toThrow('ROM artifact bad-expansion bank 9 is outside supported bank range 0-8');
    expect(backend.assemble).not.toHaveBeenCalled();
    expect(backend.assembleBin).not.toHaveBeenCalled();
  });

  it('rejects multibank expansion geometry when imageSize and bankCount disagree', async () => {
    const root = makeTempRoot();
    const backend = fakeBackend();
    const args: LaunchRequestArguments = {
      tec1g: {
        romArtifacts: [
          {
            id: 'bad-expansion',
            role: 'expansion',
            outputBin: 'build/expansion.bin',
            windowAddress: 0x8000,
            windowSize: 0x4000,
            imageSize: 0x8000,
            bankSize: 0x4000,
            bankCount: 9,
            banks: [
              {
                physicalBank: 8,
                sourceFile: 'roms/bank8.asm',
                outputBin: 'build/bank8.bin',
              },
            ],
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
    ).rejects.toThrow('ROM artifact bad-expansion bankCount must equal imageSize / bankSize');
    expect(backend.assemble).not.toHaveBeenCalled();
    expect(backend.assembleBin).not.toHaveBeenCalled();
  });

  it('rejects duplicate physical banks before packing multibank expansion artifacts', async () => {
    const root = makeTempRoot();
    const backend = fakeBackend();
    const args: LaunchRequestArguments = {
      tec1g: {
        romArtifacts: [
          {
            id: 'bad-expansion',
            role: 'expansion',
            outputBin: 'build/expansion.bin',
            windowAddress: 0x8000,
            windowSize: 0x4000,
            imageSize: 0x24000,
            bankSize: 0x4000,
            bankCount: 9,
            banks: [
              {
                physicalBank: 0,
                sourceFile: 'roms/bank0.asm',
                outputBin: 'build/bank0.bin',
              },
              {
                physicalBank: 0,
                sourceFile: 'roms/bank0-copy.asm',
                outputBin: 'build/bank0-copy.bin',
              },
            ],
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
    ).rejects.toThrow('ROM artifact bad-expansion declares physical bank 0 more than once');
    expect(backend.assemble).not.toHaveBeenCalled();
    expect(backend.assembleBin).not.toHaveBeenCalled();
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

  it('throws when an expansion artifact binary exceeds its visible bank window', async () => {
    const root = makeTempRoot();
    const backend = fakeBackend();
    backend.assembleBin.mockImplementation((options: AssembleBinOptions) => {
      writeBinary(replaceExtension(options.hexPath, '.bin'), Buffer.alloc(0x8001));
      return { success: true };
    });
    const args: LaunchRequestArguments = {
      tec1g: {
        romArtifacts: [
          {
            id: 'tecm8-expansion',
            role: 'expansion',
            sourceFile: 'roms/expansion.asm',
            outputBin: 'build/expansion.bin',
            outputDebugMap: 'build/expansion.d8.json',
            windowAddress: 0x8000,
            windowSize: 0x4000,
            imageSize: 0x24000,
            bankSize: 0x4000,
            bankCount: 9,
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
    ).rejects.toThrow('ROM artifact tecm8-expansion binary is 32769 bytes; limit is 16384');
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
