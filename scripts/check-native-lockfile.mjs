import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const failures = [];
let checked = 0;

// npm can omit other platforms' optional bindings when updating an existing
// node_modules tree. npm ci then succeeds, but the bundler fails at startup.
for (const [location, entry] of Object.entries(lock.packages)) {
  if (!/(?:^|\/)node_modules\/(?:rollup|rolldown)$/.test(location)) continue;
  for (const [name, version] of Object.entries(entry.optionalDependencies ?? {})) {
    if (!name.startsWith('@rollup/rollup-') && !name.startsWith('@rolldown/binding-')) continue;
    checked += 1;
    let installed;
    let directory = location;
    while (true) {
      if (path.posix.basename(directory) !== 'node_modules') {
        installed = lock.packages[path.posix.join(directory, 'node_modules', name)];
        if (installed !== undefined) break;
      }
      if (directory === '.') break;
      directory = path.posix.dirname(directory);
    }
    if (installed?.version !== version) {
      failures.push(`${location}: ${name}@${version} is missing or has the wrong version`);
    }
  }
}

assert.ok(checked > 0, 'No native bundler dependencies were checked');
assert.equal(failures.length, 0, failures.join('\n'));
console.log(`Native lockfile check passed: ${checked} platform bindings pinned.`);
