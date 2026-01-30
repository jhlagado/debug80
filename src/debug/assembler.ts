/**
 * @fileoverview Assembly toolchain integration for the Z80 debug adapter.
 * Handles running asm80 assembler and related build operations.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as vscode from 'vscode';
import { toPortablePath } from './path-utils';

/**
 * Represents the asm80 command and its arguments.
 */
export interface Asm80Command {
  /** The command to run (may be node) */
  command: string;
  /** Arguments to prepend (e.g., script path when using node) */
  argsPrefix: string[];
}

/**
 * Result of running the assembler.
 */
export interface AssembleResult {
  /** Whether assembly succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Stdout content */
  stdout?: string;
  /** Stderr content */
  stderr?: string;
}

/**
 * Finds the asm80 binary by searching up from a directory.
 *
 * @param startDir - Directory to start searching from
 * @returns Path to asm80 binary, or undefined if not found
 */
export function findAsm80Binary(startDir: string): string | undefined {
  const candidates =
    process.platform === 'win32' ? ['asm80.cmd', 'asm80.exe', 'asm80.ps1', 'asm80'] : ['asm80'];

  for (let dir = startDir; ; ) {
    const binDir = path.join(dir, 'node_modules', '.bin');
    for (const name of candidates) {
      const candidate = path.join(binDir, name);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  // Try bundled asm80
  const bundled = resolveBundledAsm80();
  if (bundled !== undefined) {
    return bundled;
  }

  return undefined;
}

/**
 * Resolves the bundled asm80 package.
 *
 * @returns Path to bundled asm80, or undefined
 */
export function resolveBundledAsm80(): string | undefined {
  const tryResolve = (id: string): string | undefined => {
    try {
      return require.resolve(id);
    } catch {
      return undefined;
    }
  };

  const direct = tryResolve('asm80/bin/asm80') ?? tryResolve('asm80/bin/asm80.js');
  if (direct !== undefined) {
    return direct;
  }

  const pkg = tryResolve('asm80/package.json');
  if (pkg !== undefined) {
    const root = path.dirname(pkg);
    const bin = path.join(root, 'bin', 'asm80');
    if (fs.existsSync(bin)) {
      return bin;
    }
    const binJs = `${bin}.js`;
    if (fs.existsSync(binJs)) {
      return binJs;
    }
  }

  return undefined;
}

/**
 * Resolves the asm80 command for running assembly.
 *
 * @param asmDir - Directory containing assembly source
 * @returns Command and argument prefix
 */
export function resolveAsm80Command(asmDir: string): Asm80Command {
  const resolved = findAsm80Binary(asmDir) ?? 'asm80';
  if (shouldInvokeWithNode(resolved)) {
    return { command: process.execPath, argsPrefix: [resolved] };
  }
  return { command: resolved, argsPrefix: [] };
}

/**
 * Determines if a command should be invoked via Node.js.
 *
 * @param command - The command path
 * @returns True if the command needs to be run with node
 */
export function shouldInvokeWithNode(command: string): boolean {
  const lower = command.toLowerCase();

  // Windows executables run directly
  if (
    process.platform === 'win32' &&
    (lower.endsWith('.cmd') || lower.endsWith('.exe') || lower.endsWith('.ps1'))
  ) {
    return false;
  }

  // Commands without paths (system commands) run directly
  if (!(command.includes(path.sep) || command.includes('/'))) {
    return false;
  }

  // JavaScript files need node
  const ext = path.extname(command).toLowerCase();
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    return true;
  }

  // Check for Node.js shebang
  try {
    const fd = fs.openSync(command, 'r');
    const buffer = Buffer.alloc(160);
    const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);
    const firstLine = buffer.toString('utf-8', 0, bytes).split('\n')[0] ?? '';
    return firstLine.startsWith('#!') && firstLine.includes('node');
  } catch {
    return false;
  }
}

/**
 * Runs the asm80 assembler to produce HEX and LST files.
 *
 * @param asmPath - Path to the assembly source file
 * @param hexPath - Path for the output HEX file
 * @param listingPath - Path for the output listing file
 * @param onOutput - Callback for assembler output
 * @returns Assembly result
 */
export function runAssembler(
  asmPath: string,
  hexPath: string,
  listingPath: string,
  onOutput?: (message: string) => void
): AssembleResult {
  const asmDir = path.dirname(asmPath);
  const outDir = path.dirname(hexPath);

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const asm80 = resolveAsm80Command(asmDir);
  // Use forward slashes for cross-platform compatibility with asm80
  const outArg = toPortablePath(path.relative(asmDir, hexPath));

  const result = cp.spawnSync(
    asm80.command,
    [...asm80.argsPrefix, '-m', 'Z80', '-t', 'hex', '-o', outArg, path.basename(asmPath)],
    {
      cwd: asmDir,
      encoding: 'utf-8',
    }
  );

  if (result.error) {
    const enoent = (result.error as NodeJS.ErrnoException)?.code === 'ENOENT';
    const message = enoent
      ? 'asm80 not found. Install it with "npm install -D asm80" or ensure it is on PATH.'
      : `asm80 failed to start: ${result.error.message ?? String(result.error)}`;

    if (onOutput) {
      onOutput(`${message}\n`);
    }

    return { success: false, error: message };
  }

  if (result.status !== 0) {
    if (onOutput) {
      if (result.stdout) {
        onOutput(`asm80 stdout:\n${result.stdout}\n`);
      }
      if (result.stderr) {
        onOutput(`asm80 stderr:\n${result.stderr}\n`);
      }
    }

    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    const suffix = output.length > 0 ? `: ${output}` : '';
    return {
      success: false,
      error: `asm80 exited with code ${result.status}${suffix}`,
      stdout: result.stdout ?? undefined,
      stderr: result.stderr ?? undefined,
    };
  }

  // Copy listing to target location if different
  const producedListing = path.join(
    path.dirname(hexPath),
    `${path.basename(hexPath, path.extname(hexPath))}.lst`
  );

  if (listingPath !== producedListing && fs.existsSync(producedListing)) {
    const listingDir = path.dirname(listingPath);
    if (!fs.existsSync(listingDir)) {
      fs.mkdirSync(listingDir, { recursive: true });
    }
    fs.copyFileSync(producedListing, listingPath);
  }

  return {
    success: true,
    stdout: result.stdout ?? undefined,
    stderr: result.stderr ?? undefined,
  };
}

/**
 * Runs the asm80 assembler to produce a binary file with BINFROM/BINTO directives.
 *
 * @param asmPath - Path to the assembly source file
 * @param hexPath - Path for reference (binary will be in same directory)
 * @param binFrom - Start address for binary
 * @param binTo - End address for binary
 * @param onOutput - Callback for assembler output
 * @returns Assembly result
 */
export function runAssemblerBin(
  asmPath: string,
  hexPath: string,
  binFrom: number,
  binTo: number,
  onOutput?: (message: string) => void
): AssembleResult {
  const asmDir = path.dirname(asmPath);
  const outDir = path.dirname(hexPath);
  const binPath = path.join(outDir, `${path.basename(hexPath, path.extname(hexPath))}.bin`);
  const wrapperName = `.${path.basename(asmPath, path.extname(asmPath))}.bin.asm`;
  const wrapperPath = path.join(asmDir, wrapperName);

  const wrapper = `.BINFROM ${binFrom}\n.BINTO ${binTo}\n.INCLUDE "${path.basename(asmPath)}"\n`;
  fs.writeFileSync(wrapperPath, wrapper);

  const asm80 = resolveAsm80Command(asmDir);
  // Use forward slashes for cross-platform compatibility with asm80
  const outArg = toPortablePath(path.relative(asmDir, binPath));
  const wrapperArg = toPortablePath(path.relative(asmDir, wrapperPath));

  const result = cp.spawnSync(
    asm80.command,
    [...asm80.argsPrefix, '-m', 'Z80', '-t', 'bin', '-o', outArg, wrapperArg],
    {
      cwd: asmDir,
      encoding: 'utf-8',
    }
  );

  // Clean up wrapper file
  try {
    fs.unlinkSync(wrapperPath);
  } catch {
    /* ignore */
  }

  if (result.error) {
    const message = `asm80 bin failed to start: ${result.error.message ?? String(result.error)}`;
    if (onOutput) {
      onOutput(`${message}\n`);
    }
    return { success: false, error: message };
  }

  if (result.status !== 0) {
    if (onOutput) {
      if (result.stdout) {
        onOutput(`asm80 stdout:\n${result.stdout}\n`);
      }
      if (result.stderr) {
        onOutput(`asm80 stderr:\n${result.stderr}\n`);
      }
    }

    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    const suffix = output.length > 0 ? `: ${output}` : '';
    return {
      success: false,
      error: `asm80 bin exited with code ${result.status}${suffix}`,
      stdout: result.stdout ?? undefined,
      stderr: result.stderr ?? undefined,
    };
  }

  return {
    success: true,
    stdout: result.stdout ?? undefined,
    stderr: result.stderr ?? undefined,
  };
}

/**
 * Resolves the bundled TEC-1 ROM path.
 *
 * @returns Path to the bundled ROM, or undefined
 */
export function resolveBundledTec1Rom(): string | undefined {
  const extension = vscode.extensions.getExtension('jhlagado.debug80');
  if (!extension) {
    return undefined;
  }

  const candidate = path.join(extension.extensionPath, 'roms', 'tec1', 'mon-1b', 'mon-1b.hex');

  if (fs.existsSync(candidate)) {
    return candidate;
  }

  return undefined;
}
