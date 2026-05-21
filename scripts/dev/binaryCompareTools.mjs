import { copyFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export function byteHex(value) {
  return value === undefined ? 'EOF' : `0x${value.toString(16).padStart(2, '0')}`;
}

export function hex(value, width = 4) {
  return `0x${value.toString(16).padStart(width, '0')}`;
}

export function findFirstMismatch(actual, reference) {
  const maxLength = Math.max(actual.length, reference.length);
  for (let i = 0; i < maxLength; i++) {
    if (actual[i] !== reference[i]) return i;
  }
  return -1;
}

export function summarizeBinaryMismatch(actual, reference) {
  const firstMismatch = findFirstMismatch(actual, reference);
  const lines = [`Binary length: actual=${actual.length} reference=${reference.length}`];
  if (firstMismatch >= 0) {
    lines.push(
      `First mismatch @${hex(firstMismatch)}: actual=${byteHex(
        actual[firstMismatch],
      )} reference=${byteHex(reference[firstMismatch])}`,
    );
  } else {
    lines.push('First mismatch: none');
  }
  return lines.join('\n');
}

export function byteWindow(bytes, center, radius = 4) {
  if (center === undefined || center < 0) return '[]';
  const start = Math.max(0, center - radius);
  const end = Math.min(bytes.length, center + radius + 1);
  return `[${Array.from(bytes.subarray(start, end), (byte) => hex(byte, 2)).join(' ')}]`;
}

export function sourceStem(source) {
  return basename(source).replace(/\.(z80|asm)$/i, '');
}

export function copyAsm80SourceSiblings(source, outDir, extensions = /\.(z80|asm)$/i) {
  for (const entry of readdirSync(dirname(source), { withFileTypes: true })) {
    if (entry.isFile() && extensions.test(entry.name)) {
      copyFileSync(join(dirname(source), entry.name), join(outDir, entry.name));
    }
  }
}
