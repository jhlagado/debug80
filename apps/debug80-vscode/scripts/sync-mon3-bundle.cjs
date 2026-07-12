#!/usr/bin/env node
/**
 * Maintainers: refresh the bundled MON3 payload under resources/bundles/tec1g/mon3/v1.
 *
 * 1. Copies `MON3-1G_BC25-16.bin` from a MON3 checkout → `mon3.bin` (canonical release ROM).
 * 2. Unzips `MON3-1G_BC25-16_src.zip`, runs AZM on `mon3.z80` → `mon3.d8.json`.
 *
 * Set MON3_ROOT to your MON3 repository root (default: ../MON3 next to this repo).
 * Requires `unzip`; AZM is resolved from this repo's npm dependencies.
 *
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const mon3Root = process.env.MON3_ROOT ?? path.join(repoRoot, '..', 'MON3');
const srcBin = path.join(mon3Root, 'MON3-1G_BC25-16.bin');
const srcZip = path.join(mon3Root, 'MON3-1G_BC25-16_src.zip');
const destDir = path.join(repoRoot, 'resources', 'bundles', 'tec1g', 'mon3', 'v1');
const destBin = path.join(destDir, 'mon3.bin');
const destD8 = path.join(destDir, 'mon3.d8.json');
const azmBin = path.join(
  repoRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'azm.cmd' : 'azm'
);

if (!fs.existsSync(srcBin)) {
  console.error(`sync-mon3-bundle: ROM not found: ${srcBin}`);
  console.error('Set MON3_ROOT to your MON3 repository root.');
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(srcBin, destBin);
console.log(`sync-mon3-bundle: copied ${srcBin} -> ${destBin}`);

if (!fs.existsSync(srcZip)) {
  console.error(`sync-mon3-bundle: source zip not found (needed for mon3.d8.json): ${srcZip}`);
  process.exit(1);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-mon3-bundle-'));
try {
  const unzip = spawnSync('unzip', ['-q', '-d', tmpDir, srcZip], { stdio: 'inherit' });
  if (unzip.error) {
    console.error(`sync-mon3-bundle: unzip failed: ${unzip.error.message}`);
    process.exit(1);
  }
  if (unzip.status !== 0) {
    process.exit(1);
  }

  const asm = spawnSync(azmBin, ['--type', 'bin', '--output', 'mon3.bin', 'mon3.z80'], {
    cwd: tmpDir,
    stdio: 'inherit',
  });
  if (asm.error) {
    console.error(`sync-mon3-bundle: AZM failed: ${asm.error.message}`);
    console.error('Run npm install in the Debug80 repository and try again.');
    process.exit(1);
  }
  if (asm.status !== 0) {
    process.exit(1);
  }

  const builtD8 = path.join(tmpDir, 'mon3.d8.json');
  if (!fs.existsSync(builtD8)) {
    console.error('sync-mon3-bundle: AZM did not produce mon3.d8.json');
    process.exit(1);
  }
  fs.copyFileSync(builtD8, destD8);
  console.log(`sync-mon3-bundle: wrote ${destD8}`);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log(
  'sync-mon3-bundle: update bundle.json sha256 values for mon3.bin and mon3.d8.json if they changed:'
);
console.log(
  '  shasum -a 256 resources/bundles/tec1g/mon3/v1/mon3.bin resources/bundles/tec1g/mon3/v1/mon3.d8.json'
);
