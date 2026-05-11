/**
 * Merges Debug80-recommended .gitignore rules into a project workspace. Kept free of
 * vscode dependencies so it can be unit tested without a VS Code host.
 */

import * as fs from 'fs';
import * as path from 'path';

const DEBUG80_GITIGNORE_BEGIN = '### Debug80 (do not remove this line) ###';
const DEBUG80_GITIGNORE_END = '### end Debug80 ###';

/**
 * Merges a small ignore block: extension cache, default build dir, local-only launch,
 * common junk. Idempotent. Does not ignore all of `.vscode/` (a config may
 * live at `.vscode/debug80.json`).
 */
export function ensureDebug80Gitignore(workspaceRoot: string, defaultOutputDir: string): void {
  const relOut = (defaultOutputDir || 'build').replace(/^\.\/+/, '').replace(/\/$/, '') || 'build';
  const block = [
    '',
    DEBUG80_GITIGNORE_BEGIN,
    '# Extension cache and session data',
    '.debug80/',
    `# Assembled output (scaffold default is "${relOut}/"; match your debug80.json outputDir)`,
    `${relOut}/`,
    'out/',
    'dist/',
    '# Materialized platform ROM bundles are local copies; debug80.json references extension bundles by profile',
    'roms/',
    '# Optional local launch; the extension also contributes "Debug80: Current Project"',
    '.vscode/launch.json',
    '# OS / editor',
    '.DS_Store',
    'Thumbs.db',
    DEBUG80_GITIGNORE_END,
    '',
  ].join('\n');

  const gitignorePath = path.join(workspaceRoot, '.gitignore');
  try {
    if (fs.existsSync(gitignorePath)) {
      const existing = fs.readFileSync(gitignorePath, 'utf8');
      if (existing.includes(DEBUG80_GITIGNORE_BEGIN)) {
        return;
      }
      fs.appendFileSync(gitignorePath, block, 'utf8');
      return;
    }
    fs.writeFileSync(gitignorePath, block.replace(/^\n/, ''), 'utf8');
  } catch {
    // Best-effort; do not fail scaffold if the workspace is read-only, etc.
  }
}
