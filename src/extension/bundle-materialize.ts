/**
 * @file Copy bundled ROM assets from the extension into the workspace.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { BundleManifestV1 } from './bundle-manifest';
import { isBundleManifestV1 } from './bundle-manifest';

/** Default MON3 profile shipped under resources/bundles/tec1g/mon3/v1 */
export const BUNDLED_MON3_V1_REL = 'tec1g/mon3/v1' as const;

/** Default MON-1B profile shipped under resources/bundles/tec1/mon1b/v1 */
export const BUNDLED_MON1B_V1_REL = 'tec1/mon1b/v1' as const;

export type MaterializeBundledRomResult = {
  ok: true;
  destinationRelative: string;
  romRelativePath: string;
  listingRelativePath?: string;
  sourceRootRelative?: string;
} | {
  ok: false;
  reason: string;
};

function bundleRootUri(extensionUri: vscode.Uri, bundleRelPath: string): vscode.Uri {
  return vscode.Uri.joinPath(extensionUri, 'resources', 'bundles', ...bundleRelPath.split('/'));
}

function readManifest(extensionUri: vscode.Uri, bundleRelPath: string): BundleManifestV1 | undefined {
  const manifestUri = vscode.Uri.joinPath(bundleRootUri(extensionUri, bundleRelPath), 'bundle.json');
  try {
    const raw = fs.readFileSync(manifestUri.fsPath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!isBundleManifestV1(parsed)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function sha256File(filePath: string, normalizeLineEndings = false): string {
  const data = fs.readFileSync(filePath);
  if (!normalizeLineEndings) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
  // Windows checkouts may materialize listings with CRLF even when bundle checksums
  // were generated from LF content; normalize to LF for checksum verification only.
  const normalized = Buffer.from(data.toString('utf-8').replace(/\r\n/g, '\n'), 'utf-8');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function verifyEntryChecksum(
  filePath: string,
  entry: BundleManifestV1['files'][number]
): string | undefined {
  if (entry.sha256 === undefined || entry.sha256.length === 0) {
    return undefined;
  }
  const expected = entry.sha256.toLowerCase();
  const direct = sha256File(filePath).toLowerCase();
  if (direct === expected) {
    return undefined;
  }
  if (entry.role === 'listing') {
    const normalized = sha256File(filePath, true).toLowerCase();
    if (normalized === expected) {
      return undefined;
    }
    return direct;
  }
  return direct;
}

function checksumMismatchReason(
  entry: BundleManifestV1['files'][number],
  actualHash: string
): string {
  const expected = entry.sha256 ?? '';
  return `Checksum mismatch for ${entry.path} (expected ${expected}, got ${actualHash})`;
}

/**
 * Copies extension bundle files into the workspace under `workspaceLayout.destination`.
 * Verifies SHA-256 when listed in the manifest.
 */
export function materializeBundledRom(
  extensionUri: vscode.Uri,
  workspaceRoot: string,
  bundleRelPath: string,
  options?: { overwrite?: boolean }
): MaterializeBundledRomResult {
  const manifest = readManifest(extensionUri, bundleRelPath);
  if (manifest === undefined) {
    return { ok: false, reason: `Missing or invalid bundle manifest at ${bundleRelPath}` };
  }

  const bundleDiskRoot = bundleRootUri(extensionUri, bundleRelPath).fsPath;
  const destDir = path.join(workspaceRoot, manifest.workspaceLayout.destination);
  const overwrite = options?.overwrite === true;

  try {
    fs.mkdirSync(destDir, { recursive: true });
  } catch (e) {
    return { ok: false, reason: `Could not create ${destDir}: ${String(e)}` };
  }

  let romRel: string | undefined;
  let listingRel: string | undefined;
  let sourceTreeRel: string | undefined;

  for (const entry of manifest.files) {
    const from = path.join(bundleDiskRoot, entry.path);
    const destName = path.basename(entry.path);
    const to = path.join(destDir, destName);

    if (!fs.existsSync(from)) {
      return { ok: false, reason: `Bundled file missing in extension: ${entry.path}` };
    }

    const checksumMismatch = verifyEntryChecksum(from, entry);
    if (checksumMismatch !== undefined) {
      return {
        ok: false,
        reason: checksumMismatchReason(entry, checksumMismatch),
      };
    }

    if (fs.existsSync(to) && !overwrite) {
      // Skip copy but still resolve paths for config merge
    } else {
      try {
        fs.copyFileSync(from, to);
      } catch (e) {
        return { ok: false, reason: `Copy failed ${from} -> ${to}: ${String(e)}` };
      }
    }

    const rel = path.join(manifest.workspaceLayout.destination, destName).split(path.sep).join('/');
    if (entry.role === 'rom') {
      romRel = rel;
    } else if (entry.role === 'listing') {
      listingRel = rel;
    } else if (entry.role === 'source_tree') {
      // Expect a directory copied recursively — for future use; single file roles above cover MON3 v1
      sourceTreeRel = rel;
    }
  }

  if (romRel === undefined) {
    return { ok: false, reason: 'Bundle manifest has no rom file entry' };
  }

  return {
    ok: true,
    destinationRelative: manifest.workspaceLayout.destination,
    romRelativePath: romRel,
    ...(listingRel !== undefined ? { listingRelativePath: listingRel } : {}),
    ...(sourceTreeRel !== undefined ? { sourceRootRelative: sourceTreeRel } : {}),
  };
}
