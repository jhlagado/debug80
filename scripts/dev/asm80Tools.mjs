import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

function normalizeExecutableCandidate(candidate) {
  return candidate.includes('/') || candidate.includes('\\') ? resolve(candidate) : candidate;
}

export function findAsm80() {
  const candidates = [
    process.env.ASM80,
    process.env.ASM80_PATH,
    '/Users/johnhardy/Documents/projects/debug80/node_modules/.bin/asm80',
    'asm80',
  ]
    .filter((candidate) => candidate && candidate.trim().length > 0)
    .map(normalizeExecutableCandidate);
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['-h'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    if (!probe.error) return candidate;
  }
  return undefined;
}
