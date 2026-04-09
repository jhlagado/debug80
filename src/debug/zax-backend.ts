/**
 * @fileoverview ZAX CLI-backed implementation of the debug80 assembler backend interface.
 */

import * as cp from 'child_process';
import { createRequire } from 'module';
import * as fs from 'fs';
import * as path from 'path';
import { D8_DEBUG_MAP_EXT } from './d8-map-paths';
import { toPortablePath } from './path-utils';
import type { AssembleResult } from './assembler';
import type { AssembleOptions, AssemblerBackend } from './assembler-backend';

const moduleRequire = createRequire(__filename);

/**
 * Resolution order:
 * 1) Optional env overrides (one-off debugging; see README).
 * 2) `require.resolve('@jhlagado/zax/dist/src/cli.js')` / package layout.
 * 3) Walk parents for `node_modules/@jhlagado/zax` (e.g. workspace with hoisted deps).
 *
 * Normal local ZAX development: keep `package.json` on the published semver
 * (`@jhlagado/zax`) and use `npm link` — no committed `file:` dependency.
 */
function resolveZaxCliFromEnv(): string | undefined {
  const cli = process.env.DEBUG80_ZAX_CLI?.trim();
  if (cli !== undefined && cli !== '') {
    const abs = path.resolve(cli);
    if (fs.existsSync(abs)) {
      return abs;
    }
  }
  const root = process.env.DEBUG80_ZAX_ROOT?.trim();
  if (root !== undefined && root !== '') {
    const candidate = path.join(path.resolve(root), 'dist', 'src', 'cli.js');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function findLocalZaxCli(startDir: string): string | undefined {
  for (let dir = startDir; ; ) {
    const candidate = path.join(dir, 'node_modules', '@jhlagado', 'zax', 'dist', 'src', 'cli.js');
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  return undefined;
}

function resolveZaxCliPath(startDir: string): string | undefined {
  const fromEnv = resolveZaxCliFromEnv();
  if (fromEnv !== undefined) {
    return fromEnv;
  }

  try {
    return moduleRequire.resolve('@jhlagado/zax/dist/src/cli.js');
  } catch {
    /* fall through */
  }

  try {
    const pkg = moduleRequire.resolve('@jhlagado/zax/package.json');
    const root = path.dirname(pkg);
    const cliPath = path.join(root, 'dist', 'src', 'cli.js');
    if (fs.existsSync(cliPath)) {
      return cliPath;
    }
  } catch {
    /* fall through */
  }

  return findLocalZaxCli(startDir);
}

function zaxNotFoundMessage(): string {
  return (
    'zax not found. Install with "npm install -D @jhlagado/zax", or link a local ZAX build ' +
    '("cd ZAX && npm run build && npm link" then "cd debug80 && npm link @jhlagado/zax"). ' +
    'Optional: DEBUG80_ZAX_ROOT / DEBUG80_ZAX_CLI (see Debug80 README).'
  );
}

export class ZaxBackend implements AssemblerBackend {
  public readonly id = 'zax';

  public assemble(options: AssembleOptions): AssembleResult {
    const asmDir = path.dirname(options.asmPath);
    const outDir = path.dirname(options.hexPath);
    const cliPath = resolveZaxCliPath(asmDir);

    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    if (cliPath === undefined) {
      const message = zaxNotFoundMessage();
      options.onOutput?.(`${message}\n`);
      return { success: false, error: message };
    }

    const outArg = toPortablePath(path.relative(asmDir, options.hexPath));
    // ZAX --asm80: emit ASM80-compatible lowered source (.z80) beside the HEX for inspection.
    const args = [cliPath, '--nobin', '--asm80', '-o', outArg, path.basename(options.asmPath)];
    const result = cp.spawnSync(process.execPath, args, {
      cwd: asmDir,
      encoding: 'utf-8',
    });

    if (result.error) {
      const enoent = (result.error as NodeJS.ErrnoException)?.code === 'ENOENT';
      const message = enoent
        ? zaxNotFoundMessage()
        : `zax failed to start: ${result.error.message ?? String(result.error)}`;
      options.onOutput?.(`${message}\n`);
      return { success: false, error: message };
    }

    if (result.status !== 0) {
      if (result.stdout) {
        options.onOutput?.(`zax stdout:\n${result.stdout}\n`);
      }
      if (result.stderr) {
        options.onOutput?.(`zax stderr:\n${result.stderr}\n`);
      }
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
      const suffix = output.length > 0 ? `: ${output}` : '';
      return {
        success: false,
        error: `zax exited with code ${result.status}${suffix}`,
        stdout: result.stdout ?? undefined,
        stderr: result.stderr ?? undefined,
      };
    }

    const producedListing = path.join(
      path.dirname(options.hexPath),
      `${path.basename(options.hexPath, path.extname(options.hexPath))}.lst`
    );

    if (!fs.existsSync(options.hexPath)) {
      return {
        success: false,
        error: `zax succeeded but did not produce HEX output at "${options.hexPath}".`,
        stdout: result.stdout ?? undefined,
        stderr: result.stderr ?? undefined,
      };
    }

    if (!fs.existsSync(producedListing)) {
      return {
        success: false,
        error: `zax succeeded but did not produce listing output at "${producedListing}".`,
        stdout: result.stdout ?? undefined,
        stderr: result.stderr ?? undefined,
      };
    }

    if (options.listingPath !== producedListing) {
      const listingDir = path.dirname(options.listingPath);
      if (!fs.existsSync(listingDir)) {
        fs.mkdirSync(listingDir, { recursive: true });
      }
      fs.copyFileSync(producedListing, options.listingPath);
      const artifactBase = path.basename(options.hexPath, path.extname(options.hexPath));
      const producedD8 = path.join(path.dirname(options.hexPath), `${artifactBase}${D8_DEBUG_MAP_EXT}`);
      const targetD8 = path.join(path.dirname(options.listingPath), `${artifactBase}${D8_DEBUG_MAP_EXT}`);
      if (fs.existsSync(producedD8) && producedD8 !== targetD8) {
        fs.copyFileSync(producedD8, targetD8);
      }
    }

    return {
      success: true,
      stdout: result.stdout ?? undefined,
      stderr: result.stderr ?? undefined,
    };
  }
}