#!/usr/bin/env node
/**
 * Maintainers: refresh the bundled MON3 payload under resources/bundles/tec1g/mon3/v1.
 *
 * 1. Copies `MON3-1G_BC25-16.bin` from a MON3 checkout → `mon3.bin` (canonical release ROM).
 * 2. Unzips `MON3-1G_BC25-16_src.zip`, runs asm80 on `mon3.z80` → `mon3.lst` (and a temp bin).
 *
 * Set MON3_ROOT to your MON3 repository root (default: ../MON3 next to this repo).
 * Requires `unzip` and `asm80` on PATH (asm80-node: https://github.com/asm80/asm80-node).
 *
 * Note: the release `.bin` and an asm80 build from the published source zip can differ by a
 * few bytes at the end of the image; the listing still maps the monitor for debugging. See
 * bundle README.
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
const destLst = path.join(destDir, 'mon3.lst');

if (!fs.existsSync(srcBin)) {
  console.error(`sync-mon3-bundle: ROM not found: ${srcBin}`);
  console.error('Set MON3_ROOT to your MON3 repository root.');
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(srcBin, destBin);
console.log(`sync-mon3-bundle: copied ${srcBin} -> ${destBin}`);

if (!fs.existsSync(srcZip)) {
  console.error(`sync-mon3-bundle: source zip not found (needed for mon3.lst): ${srcZip}`);
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

  const asm = spawnSync('asm80', ['-m', 'Z80', '-t', 'bin', '-o', 'mon3.bin', 'mon3.z80'], {
    cwd: tmpDir,
    stdio: 'inherit',
  });
  if (asm.error) {
    console.error(`sync-mon3-bundle: asm80 failed: ${asm.error.message}`);
    console.error('Install asm80 (e.g. npm i -g asm80) and ensure it is on PATH.');
    process.exit(1);
  }
  if (asm.status !== 0) {
    process.exit(1);
  }

  const builtLst = path.join(tmpDir, 'mon3.lst');
  if (!fs.existsSync(builtLst)) {
    console.error('sync-mon3-bundle: asm80 did not produce mon3.lst');
    process.exit(1);
  }
  fs.copyFileSync(builtLst, destLst);
  console.log(`sync-mon3-bundle: wrote ${destLst}`);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log('sync-mon3-bundle: update bundle.json sha256 values for mon3.bin and mon3.lst if they changed:');
console.log('  shasum -a 256 resources/bundles/tec1g/mon3/v1/mon3.bin resources/bundles/tec1g/mon3/v1/mon3.lst');
