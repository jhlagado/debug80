/**
 * @file ROM bundle manifest (extension-shipped platform payloads).
 *
 * @see docs/plans/platform-rom-bundles.md
 */

export const BUNDLE_MANIFEST_SCHEMA_VERSION = 1 as const;

/** Single file shipped inside a bundle directory (under resources/bundles/...). */
export type BundleFileRole = 'rom' | 'listing' | 'source' | 'source_tree';

export interface BundleFileEntry {
  role: BundleFileRole;
  /** Path relative to the bundle root directory */
  path: string;
  /** Optional SHA-256 hex (64 chars) for verification */
  sha256?: string;
}

/** Where materialized files land in the workspace (relative to project root). */
export interface BundleWorkspaceLayout {
  /** Directory under workspace root, e.g. roms/tec1g/mon3 */
  destination: string;
}

/**
 * Parsed bundle.json next to shipped ROM/listing/source assets.
 * Schema version allows future migrations.
 */
export interface BundleManifestV1 {
  schemaVersion: typeof BUNDLE_MANIFEST_SCHEMA_VERSION;
  /** Stable id, e.g. tec1g/mon3 */
  id: string;
  /** Semver or upstream label */
  version: string;
  /** Debug80 platform id */
  platform: 'simple' | 'tec1' | 'tec1g';
  label: string;
  files: BundleFileEntry[];
  workspaceLayout: BundleWorkspaceLayout;
}

export function isBundleManifestV1(value: unknown): value is BundleManifestV1 {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const o = value as Record<string, unknown>;
  const wl = o.workspaceLayout;
  return (
    o.schemaVersion === BUNDLE_MANIFEST_SCHEMA_VERSION &&
    typeof o.id === 'string' &&
    typeof o.version === 'string' &&
    typeof o.platform === 'string' &&
    typeof o.label === 'string' &&
    Array.isArray(o.files) &&
    wl !== null &&
    typeof wl === 'object' &&
    typeof (wl as { destination?: unknown }).destination === 'string'
  );
}
