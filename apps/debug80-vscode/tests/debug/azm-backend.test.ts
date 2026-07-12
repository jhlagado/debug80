/**
 * @file AZM backend tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AzmBackend } from '../../src/debug/launch/azm-backend';
import type { AssembleResult } from '../../src/debug/launch/assembler';

const compile = vi.hoisted(() => vi.fn());
const childProcess = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  execSync: vi.fn(),
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock('@jhlagado/azm/compile', () => ({
  compile,
  defaultFormatWriters: {
    writeHex: vi.fn(),
    writeBin: vi.fn(),
    writeD8m: vi.fn(),
  },
}));

vi.mock('child_process', () => ({
  ...childProcess,
}));

describe('azm-backend', () => {
  let tmpDir: string;

  beforeEach(() => {
    compile.mockReset();
    Object.values(childProcess).forEach((mock) => mock.mockReset());
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-azm-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('assembles through the AZM library and writes Debug80-controlled artifacts', async () => {
    const backend = new AzmBackend();
    const { asmPath, outDir, hexPath, binPath } = createAssemblyFixture(
      tmpDir,
      'ORG 0100h\nSTART: NOP\n'
    );
    mockSuccessfulHexCompile({ binBytes: [0x00] });

    const result = await backend.assemble({ asmPath, hexPath, sourceRoot: tmpDir });

    expect(result.success).toBe(true);
    expectNoExternalProcess();
    expect(compile).toHaveBeenCalledWith(
      asmPath,
      {
        outputType: 'hex',
        emitBin: true,
        emitHex: true,
        emitD8m: true,
        sourceRoot: tmpDir,
        d8mInputs: {
          hex: hexPath,
          bin: binPath,
        },
      },
      expect.objectContaining({ formats: expect.any(Object) })
    );
    expect(fs.readFileSync(hexPath, 'utf-8')).toBe(':0101000000FE\n:00000001FF\n');
    expect([...fs.readFileSync(binPath)]).toEqual([0x00]);
    expect(fs.existsSync(path.join(outDir, 'prog.d8.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'prog.z80'))).toBe(false);
  });

  it('requires native D8 output for source mapping', async () => {
    const backend = new AzmBackend();
    const { asmPath, outDir, hexPath } = createAssemblyFixture(
      tmpDir,
      'ORG 4000h\nSTART: NOP\n',
      'prog.z80'
    );
    mockSuccessfulHexCompile({ binBytes: [0x00] });

    const result = await backend.assemble({ asmPath, hexPath, sourceRoot: tmpDir });

    expect(result.success).toBe(true);
    expect(fs.readFileSync(hexPath, 'utf-8')).toBe(':0101000000FE\n:00000001FF\n');
    expect(fs.existsSync(path.join(outDir, 'prog.d8.json'))).toBe(true);
  });

  it('passes AZM register contracts launch options and writes register contract artifacts', async () => {
    const backend = new AzmBackend();
    const { asmPath, outDir, hexPath } = createAssemblyFixture(tmpDir, 'ORG 4000h\nSTART: NOP\n');
    compile.mockResolvedValue({
      diagnostics: [],
      artifacts: [
        ...successfulHexArtifacts(),
        { kind: 'register-contracts-report', text: 'Register contracts report\n' },
        { kind: 'register-contracts-interface', text: 'extern MON_PRINT_CHAR\nend\n' },
      ],
    });

    const result = await backend.assemble({
      asmPath,
      hexPath,
      azm: {
        symbolCase: 'insensitive',
        registerContracts: 'audit',
        registerContractsPolicy: {
          strict: ['src/**/*.asm'],
          audit: ['roms/tec1g/tecm8/monitor/**/*.asm'],
          off: ['vendor/**/*.asm'],
        },
        emitRegisterReport: true,
        registerContractsProfile: 'mon3',
      },
    });

    expect(result.success).toBe(true);
    expect(compile).toHaveBeenCalledWith(
      asmPath,
      expect.objectContaining({
        symbolCase: 'insensitive',
        registerContracts: 'audit',
        registerContractsPolicy: {
          strict: ['src/**/*.asm'],
          audit: ['roms/tec1g/tecm8/monitor/**/*.asm'],
          off: ['vendor/**/*.asm'],
        },
        emitRegisterReport: true,
        registerContractsProfile: 'mon3',
      }),
      expect.objectContaining({ formats: expect.any(Object) })
    );
    expect(fs.readFileSync(path.join(outDir, 'prog.regcontracts.txt'), 'utf-8')).toBe(
      'Register contracts report\n'
    );
    expect(fs.readFileSync(path.join(outDir, 'prog.asmi'), 'utf-8')).toBe(
      'extern MON_PRINT_CHAR\nend\n'
    );
  });

  it('uses binFrom and binTo as compact output bounds for binary rebuilds', async () => {
    const backend = new AzmBackend();
    const { asmPath, hexPath, binPath } = createAssemblyFixture(tmpDir, 'ORG 4000h\nDB 1,2,3\n');

    compile.mockResolvedValue({
      diagnostics: [],
      artifacts: [{ kind: 'bin', bytes: new Uint8Array([1, 2, 3]) }],
    });

    const result = await backend.assembleBin({ asmPath, hexPath, binFrom: 0x4000, binTo: 0x4002 });

    expect(result.success).toBe(true);
    expect(compile).toHaveBeenCalledWith(
      asmPath,
      expect.objectContaining({
        outputType: 'bin',
        emitBin: true,
        emitHex: false,
        emitD8m: false,
      }),
      expect.objectContaining({ formats: expect.any(Object) })
    );
    expect([...fs.readFileSync(binPath)]).toEqual([1, 2, 3]);
  });

  it('returns compile diagnostics as Debug80 assembly failures', async () => {
    const backend = new AzmBackend();
    const { asmPath, hexPath } = createAssemblyFixture(
      tmpDir,
      'BADOP\n',
      path.join('src', 'prog.asm'),
      tmpDir
    );

    mockDiagnosticCompile({
      id: 'AZM200',
      message: 'Unsupported instruction BADOP.',
      file: asmPath,
      line: 1,
      column: 1,
    });

    const { result, output } = await assembleWithOutput(backend, asmPath, hexPath);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported instruction BADOP.');
    expect(result.diagnostic).toMatchObject({
      path: asmPath,
      line: 1,
      column: 1,
      message: 'Unsupported instruction BADOP.',
    });
    expect(output.join('')).toContain('AZM200');
  });

  it('resolves project-relative AZM diagnostics against the source root', async () => {
    const backend = new AzmBackend();
    const { asmPath, hexPath } = createAssemblyFixture(
      tmpDir,
      'CALL Missing\n',
      path.join('src', 'prog.asm'),
      tmpDir
    );

    mockDiagnosticCompile({
      id: 'AZMN_SYMBOL',
      message: 'Unresolved symbol "Missing".',
      file: 'src/prog.asm',
      line: 1,
      column: 6,
    });

    const result = await backend.assemble({ asmPath, hexPath, sourceRoot: tmpDir });

    expect(result.success).toBe(false);
    expect(result.diagnostic).toMatchObject({
      path: asmPath,
      line: 1,
      column: 6,
      message: 'Unresolved symbol "Missing".',
      sourceLine: 'CALL Missing',
    });
  });

  it('handles AZM diagnostics that do not include a source file', async () => {
    const backend = new AzmBackend();
    const { asmPath, hexPath } = createAssemblyFixture(tmpDir, 'BADOP\n', 'prog.asm', tmpDir);

    compile.mockResolvedValue({
      diagnostics: [
        {
          code: 'AZMN_CASE_STYLE',
          severity: 'warning',
          message: 'Case style warning without a source location.',
        },
        {
          code: 'AZMN_LOAD',
          severity: 'error',
          message: 'Assembly failed before a source location was available.',
        },
      ],
      artifacts: [],
    });

    const { result, output } = await assembleWithOutput(backend, asmPath, hexPath);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Assembly failed before a source location was available.');
    expect(result.error).not.toContain('localeCompare');
    expect(result.diagnostic).toMatchObject({
      message: 'Assembly failed before a source location was available.',
    });
    expect(result.diagnostic?.path).toBeUndefined();
    expect(output.join('')).toContain('AZMN_LOAD');
  });

  it('fails when AZM succeeds but required artifacts are missing', async () => {
    const backend = new AzmBackend();
    const { asmPath, hexPath } = createAssemblyFixture(
      tmpDir,
      'ORG 0100h\nSTART: NOP\n',
      'prog.asm',
      tmpDir
    );

    compile.mockResolvedValue({
      diagnostics: [],
      artifacts: [d8Artifact()],
    });

    const result = await backend.assemble({ asmPath, hexPath });

    expect(result.success).toBe(false);
    expect(result.error).toContain('did not produce HEX output');
  });

  it('fails when AZM succeeds without a native D8 map', async () => {
    const backend = new AzmBackend();
    const { asmPath, hexPath } = createAssemblyFixture(
      tmpDir,
      'ORG 0100h\nSTART: NOP\n',
      'prog.asm',
      tmpDir
    );

    compile.mockResolvedValue({
      diagnostics: [],
      artifacts: [hexArtifact()],
    });

    const result = await backend.assemble({ asmPath, hexPath });

    expect(result.success).toBe(false);
    expect(result.error).toContain('did not produce D8 output');
  });

  it('fails when AZM produces an empty HEX artifact', async () => {
    const backend = new AzmBackend();
    const { asmPath, hexPath } = createAssemblyFixture(tmpDir, 'ORG 0100h\n', 'prog.asm', tmpDir);

    compile.mockResolvedValue({
      diagnostics: [],
      artifacts: [hexArtifact(':00000001FF\n'), d8Artifact()],
    });

    const result = await backend.assemble({ asmPath, hexPath });

    expect(result.success).toBe(false);
    expect(result.error).toContain('produced no HEX data records');
    expect(fs.existsSync(hexPath)).toBe(false);
  });
});

interface AssemblyFixture {
  asmPath: string;
  outDir: string;
  hexPath: string;
  binPath: string;
}

interface TestHexArtifactsOptions {
  binBytes?: number[];
}

interface TestDiagnostic {
  id?: string;
  code?: string;
  severity?: 'error' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
  column?: number;
}

function createAssemblyFixture(
  tmpDir: string,
  source: string,
  sourceFile = 'prog.asm',
  outputDir = path.join(tmpDir, 'build')
): AssemblyFixture {
  const asmPath = path.join(tmpDir, sourceFile);
  const outDir = outputDir;
  const hexPath = path.join(outDir, 'prog.hex');
  const binPath = path.join(outDir, 'prog.bin');
  fs.mkdirSync(path.dirname(asmPath), { recursive: true });
  fs.writeFileSync(asmPath, source);
  return { asmPath, outDir, hexPath, binPath };
}

function hexArtifact(text = ':0101000000FE\n:00000001FF\n'): { kind: 'hex'; text: string } {
  return { kind: 'hex', text };
}

function d8Artifact(): { kind: 'd8m'; json: { format: string; version: number; arch: string } } {
  return { kind: 'd8m', json: { format: 'd8-debug-map', version: 1, arch: 'z80' } };
}

function successfulHexArtifacts(options: TestHexArtifactsOptions = {}): unknown[] {
  return [
    hexArtifact(),
    ...(options.binBytes !== undefined
      ? [{ kind: 'bin', bytes: new Uint8Array(options.binBytes) }]
      : []),
    d8Artifact(),
  ];
}

function mockSuccessfulHexCompile(options: TestHexArtifactsOptions = {}): void {
  compile.mockResolvedValue({
    diagnostics: [],
    artifacts: successfulHexArtifacts(options),
  });
}

function mockDiagnosticCompile(diagnostic: TestDiagnostic): void {
  compile.mockResolvedValue({
    diagnostics: [{ severity: 'error', ...diagnostic }],
    artifacts: [],
  });
}

async function assembleWithOutput(
  backend: AzmBackend,
  asmPath: string,
  hexPath: string
): Promise<{ result: AssembleResult; output: string[] }> {
  const output: string[] = [];
  const result = await backend.assemble({
    asmPath,
    hexPath,
    onOutput: (message) => output.push(message),
  });
  return { result, output };
}

function expectNoExternalProcess(): void {
  for (const mock of Object.values(childProcess)) {
    expect(mock).not.toHaveBeenCalled();
  }
}
