/**
 * @file Helpers for ensuring bundled ROM/listing assets are present in the workspace.
 */

import * as vscode from 'vscode';
import {
  BUNDLED_MON1B_V1_REL,
  BUNDLED_MON3_V1_REL,
  materializeBundledRom,
} from './bundle-materialize';
import type { BundledAssetReference, ProjectConfig } from '../debug/session/types';

export type BundledAssetInstallPlan = {
  label: string;
  references: BundledAssetReference[];
};

function normalizeBundledAssetInstallPlan(
  label: string,
  references: BundledAssetReference[]
): BundledAssetInstallPlan | undefined {
  const filtered = references.filter(
    (reference) =>
      typeof reference.bundleId === 'string' &&
      reference.bundleId.trim().length > 0 &&
      typeof reference.path === 'string' &&
      reference.path.trim().length > 0
  );
  if (filtered.length === 0) {
    return undefined;
  }
  return { label, references: filtered };
}

export function resolveProjectBundledAssetInstallPlan(
  config: ProjectConfig
): BundledAssetInstallPlan | undefined {
  const defaultProfileName =
    typeof config.defaultProfile === 'string' && config.defaultProfile.trim().length > 0
      ? config.defaultProfile.trim()
      : undefined;
  if (defaultProfileName !== undefined) {
    const defaultProfile = config.profiles?.[defaultProfileName];
    const profilePlan = normalizeBundledAssetInstallPlan(
      `profile:${defaultProfileName}`,
      Object.values(defaultProfile?.bundledAssets ?? {})
    );
    if (profilePlan !== undefined) {
      return profilePlan;
    }
  }

  const rootPlan = normalizeBundledAssetInstallPlan(
    'bundledAssets',
    Object.values(config.bundledAssets ?? {})
  );
  if (rootPlan !== undefined) {
    return rootPlan;
  }

  const profileEntries = Object.entries(config.profiles ?? {}).filter(([, profile]) =>
    Object.keys(profile?.bundledAssets ?? {}).length > 0
  );
  if (profileEntries.length === 1) {
    const firstProfileEntry = profileEntries[0];
    if (firstProfileEntry === undefined) {
      return undefined;
    }
    const [profileName, profile] = firstProfileEntry;
    return normalizeBundledAssetInstallPlan(
      `profile:${profileName}`,
      Object.values(profile?.bundledAssets ?? {})
    );
  }

  return undefined;
}

export function buildBundledAssetFallbackPlans(): BundledAssetInstallPlan[] {
  return [
    {
      label: 'MON3 (TEC-1G)',
      references: [
        { bundleId: BUNDLED_MON3_V1_REL, path: 'mon3.bin' },
        { bundleId: BUNDLED_MON3_V1_REL, path: 'mon3.lst' },
      ],
    },
    {
      label: 'MON-1B (TEC-1)',
      references: [
        { bundleId: BUNDLED_MON1B_V1_REL, path: 'mon-1b.bin' },
        { bundleId: BUNDLED_MON1B_V1_REL, path: 'mon-1b.lst' },
      ],
    },
  ];
}

/**
 * Silently copies any bundled ROM/listing assets that are referenced in the project config
 * but not yet present in the workspace. Called on every debug launch so that new projects
 * work without a manual "Install bundled assets" step.
 */
export function ensureBundledAssetsPresent(
  extensionUri: vscode.Uri,
  workspaceRoot: string,
  config: ProjectConfig
): void {
  const plan = resolveProjectBundledAssetInstallPlan(config);
  if (plan === undefined) {
    return;
  }
  // Collect unique bundle IDs and re-materialize each bundle as a whole.
  // materializeBundledRom copies every file in the bundle (rom, listing, and all
  // source files), so multi-file source trees like MON-3 are recovered in full
  // without needing every file enumerated individually in bundledAssets.
  const bundleIds = new Set<string>();
  for (const reference of plan.references) {
    if (typeof reference.bundleId === 'string' && reference.bundleId.trim().length > 0) {
      bundleIds.add(reference.bundleId.trim());
    }
  }
  for (const bundleId of bundleIds) {
    const result = materializeBundledRom(extensionUri, workspaceRoot, bundleId, { overwrite: false });
    if (!result.ok) {
      void vscode.window.showWarningMessage(
        `Debug80: Could not install bundled ROM assets for "${bundleId}": ${result.reason}`
      );
    }
  }
}
