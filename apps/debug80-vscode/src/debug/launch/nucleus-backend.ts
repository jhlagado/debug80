/**
 * @fileoverview Standalone Nucleus compiler backend.
 *
 * Nucleus owns compilation and NOBJ. Debug80 asks its CLI for canonical NOBJ
 * plus a flat Intel HEX launch adapter and translates its positioned failure.
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AssemblyDiagnostic, AssembleResult } from './assembler';
import type { AssembleOptions, AssemblerBackend } from './assembler-backend';

export interface NucleusCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type NucleusCommandRunner = (
  command: string,
  args: readonly string[],
  cwd: string,
  onOutput?: (message: string) => void
) => Promise<NucleusCommandResult>;

const runNucleusCommand: NucleusCommandRunner = async (command, args, cwd, onOutput) =>
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      onOutput?.(chunk);
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      onOutput?.(chunk);
    });
    child.on('error', reject);
    child.on('close', (exitCode) => resolve({ exitCode: exitCode ?? 1, stdout, stderr }));
  });

const diagnosticPattern = /^(.*):(\d+):(\d+): Nucleus diagnostic (\d+)$/m;

function sourceLine(filePath: string, line: number): string | undefined {
  try {
    return fs.readFileSync(filePath, 'utf8').split(/\r?\n/)[line - 1];
  } catch {
    return undefined;
  }
}

function parseDiagnostic(stderr: string): AssemblyDiagnostic | undefined {
  const match = diagnosticPattern.exec(stderr);
  if (match === null) {
    return undefined;
  }
  const [, filePath = '', lineText = '0', columnText = '0', code = ''] = match;
  const line = Number.parseInt(lineText, 10);
  const column = Number.parseInt(columnText, 10);
  const lineTextValue = sourceLine(filePath, line);
  return {
    path: filePath,
    line,
    column,
    message: `Nucleus diagnostic ${code}`,
    ...(lineTextValue !== undefined ? { sourceLine: lineTextValue } : {}),
  };
}

export class NucleusBackend implements AssemblerBackend {
  public readonly id = 'nucleus';

  public constructor(
    private readonly run: NucleusCommandRunner = runNucleusCommand,
    private readonly command: string = process.env.NUCLEUS_COMPILER?.trim() || 'nucleus'
  ) {}

  public async assemble(options: AssembleOptions): Promise<AssembleResult> {
    fs.mkdirSync(path.dirname(options.hexPath), { recursive: true });
    const artifactBase = options.hexPath.slice(0, -path.extname(options.hexPath).length);
    const nobjPath = `${artifactBase}.nobj`;
    const cwd = options.sourceRoot ?? path.dirname(options.asmPath);
    let result: NucleusCommandResult;
    try {
      result = await this.run(
        this.command,
        ['build', '-o', nobjPath, '--hex-output', options.hexPath, options.asmPath],
        cwd,
        options.onOutput
      );
    } catch (error) {
      const message = `Nucleus compiler failed to start: ${error instanceof Error ? error.message : String(error)}`;
      options.onOutput?.(`${message}\n`);
      return { success: false, error: message };
    }
    if (result.exitCode !== 0) {
      const diagnostic = parseDiagnostic(result.stderr);
      return {
        success: false,
        error: result.stderr.trim() || `Nucleus compiler exited with code ${result.exitCode}`,
        stdout: result.stdout,
        stderr: result.stderr,
        ...(diagnostic !== undefined ? { diagnostic } : {}),
      };
    }
    if (!fs.existsSync(options.hexPath) || !fs.existsSync(nobjPath)) {
      return {
        success: false,
        error: 'Nucleus compiler succeeded without producing NOBJ and Intel HEX artifacts',
      };
    }
    return { success: true, stdout: result.stdout, stderr: result.stderr };
  }
}
