/**
 * @fileoverview Assembly toolchain integration for the Z80 debug adapter.
 * Handles running asm80 assembler and related build operations.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { createRequire } from 'module';
import { toPortablePath } from './path-utils';

const moduleRequire = createRequire(__filename);

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
  /** Parsed assembler diagnostic if available */
  diagnostic?: AssemblyDiagnostic;
}

export interface AssemblyDiagnostic {
  /** Source file associated with the diagnostic */
  path?: string;
  /** 1-based source line */
  line?: number;
  /** 1-based source column */
  column?: number;
  /** Primary diagnostic message */
  message: string;
  /** Source line text when available */
  sourceLine?: string;
}

export class AssembleFailureError extends Error {
  public readonly result: AssembleResult;

  public constructor(result: AssembleResult) {
    super(result.error ?? 'Assembly failed');
    this.name = 'AssembleFailureError';
    this.result = result;
  }
}

function extractQuotedValue(output: string, key: string): string | undefined {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escapedKey}:\\s*'([^'\\n\\r]+)'`, 'i').exec(output);
  return match?.[1]?.trim();
}

function extractNumericValue(output: string, key: string): number | undefined {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escapedKey}:\\s*(\\d+)`, 'i').exec(output);
  if (!match) {
    return undefined;
  }
  const value = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(value) ? value : undefined;
}

export function parseAsm80Diagnostic(output: string, asmPath?: string): AssemblyDiagnostic | undefined {
  const trimmed = output.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const pathMatch = /Processing:\s+([^\n\r]+)/i.exec(trimmed);
  const errorMatch = /ERROR\s+([^\n\r]+)/i.exec(trimmed);
  const sourceMatch = />>>\s*(.+)/.exec(trimmed);
  const lineMatch = /at line\s+(\d+)/i.exec(trimmed);

  const message =
    errorMatch?.[1]?.trim() ??
    extractQuotedValue(trimmed, 'msg') ??
    trimmed.split(/\r?\n/, 1)[0]?.trim();
  if (message === undefined || message.length === 0) {
    return undefined;
  }

  const parsedLine =
    (lineMatch?.[1] !== undefined ? Number.parseInt(lineMatch[1], 10) : undefined) ??
    extractNumericValue(trimmed, 'numline');
  const parsedColumn = extractNumericValue(trimmed, 'col');
  const sourceLine = sourceMatch?.[1]?.trim() ?? extractQuotedValue(trimmed, 'line');

  return {
    message,
    ...(pathMatch?.[1] !== undefined
      ? { path: pathMatch[1].trim() }
      : asmPath !== undefined && asmPath.length > 0
        ? { path: asmPath }
        : {}),
    ...(parsedLine !== undefined && Number.isFinite(parsedLine) ? { line: parsedLine } : {}),
    ...(parsedColumn !== undefined && Number.isFinite(parsedColumn) ? { column: parsedColumn } : {}),
    ...(sourceLine !== undefined && sourceLine.length > 0 ? { sourceLine } : {}),
  };
}

export function formatAssemblyDiagnostic(diagnostic: AssemblyDiagnostic): string {
  const location =
    diagnostic.path !== undefined
      ? `${path.basename(diagnostic.path)}${
          diagnostic.line !== undefined ? `:${diagnostic.line}` : ''
        }`
      : diagnostic.line !== undefined
        ? `line ${diagnostic.line}`
        : undefined;
  return [location, diagnostic.message, diagnostic.sourceLine]
    .filter((value): value is string => value !== undefined && value.length > 0)
    .join('\n');
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

  // Try bundled asm80 relative to extension root (out/debug/ -> ../../node_modules)
  const extensionRoot = path.resolve(__dirname, '..', '..');
  const binStub = path.join(extensionRoot, 'node_modules', '.bin', 'asm80');
  if (fs.existsSync(binStub)) {
    return binStub;
  }
  const bundledJs = path.join(extensionRoot, 'node_modules', 'asm80', 'asm80.js');
  if (fs.existsSync(bundledJs)) {
    return bundledJs;
  }

  // Try require.resolve as last resort
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
      return moduleRequire.resolve(id);
    } catch {
      return undefined;
    }
  };

  // Try the actual binary entry from asm80's package.json ("bin": {"asm80": "./asm80.js"})
  const entry = tryResolve('asm80/asm80.js');
  if (entry !== undefined) {
    return entry;
  }

  const direct = tryResolve('asm80/bin/asm80') ?? tryResolve('asm80/bin/asm80.js');
  if (direct !== undefined) {
    return direct;
  }

  const pkg = tryResolve('asm80/package.json');
  if (pkg !== undefined) {
    const root = path.dirname(pkg);

    // Check for the bin entry at the package root
    const rootBin = path.join(root, 'asm80.js');
    if (fs.existsSync(rootBin)) {
      return rootBin;
    }

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
    // process.execPath in VS Code's Extension Host is the Electron binary, not node.
    // Find the real node binary instead.
    const node = findNodeBinary();
    return { command: node, argsPrefix: [resolved] };
  }
  return { command: resolved, argsPrefix: [] };
}

/**
 * Finds the real Node.js binary (not the Electron helper).
 */
function findNodeBinary(): string {
  // If process.execPath looks like a real node binary, use it
  const exec = process.execPath;
  if (exec.endsWith('/node') || exec.endsWith('\\node.exe') || exec.endsWith('/node.exe')) {
    return exec;
  }

  // Look for node on PATH
  const which = process.platform === 'win32' ? 'where' : 'which';
  try {
    const result = cp.spawnSync(which, ['node'], { encoding: 'utf-8' });
    const nodePath = result.stdout?.trim().split('\n')[0]?.trim();
    if (nodePath !== undefined && nodePath !== '' && fs.existsSync(nodePath)) {
      return nodePath;
    }
  } catch {
    // fall through
  }

  return 'node';
}

/**
 * Determines if a command should be invoked via Node.js.
 *
 * @param command - The command path
 * @returns True if the command needs to be run with node
 */
export function shouldInvokeWithNode(command: string): boolean {
  const lower = command.toLowerCase();

  // node_modules/.bin/ stubs are executable scripts that find node themselves
  if (command.includes(`node_modules${path.sep}.bin`) || command.includes('node_modules/.bin')) {
    return false;
  }

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
      ? `asm80 not found. Tried command="${asm80.command}" args=${JSON.stringify(asm80.argsPrefix)} asmDir="${asmDir}" __dirname="${__dirname}"`
      : `asm80 failed to start: ${result.error.message ?? String(result.error)}`;

    if (onOutput) {
      onOutput(`${message}\n`);
    }

    return { success: false, error: message };
  }

  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    const diagnostic = parseAsm80Diagnostic(output, asmPath);
    const error =
      diagnostic !== undefined
        ? formatAssemblyDiagnostic(diagnostic)
        : `asm80 exited with code ${result.status}`;
    return {
      success: false,
      error,
      stdout: result.stdout ?? undefined,
      stderr: result.stderr ?? undefined,
      ...(diagnostic !== undefined ? { diagnostic } : {}),
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
  let vscodeModule: typeof import('vscode') | undefined;
  try {
    vscodeModule = moduleRequire('vscode') as typeof import('vscode');
  } catch {
    vscodeModule = undefined;
  }

  const extension = vscodeModule?.extensions.getExtension('jhlagado.debug80');
  if (!extension) {
    return undefined;
  }

  const candidate = path.join(extension.extensionPath, 'roms', 'tec1', 'mon-1b', 'mon-1b.hex');

  if (fs.existsSync(candidate)) {
    return candidate;
  }

  return undefined;
}
