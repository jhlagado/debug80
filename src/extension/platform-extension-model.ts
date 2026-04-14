/**
 * @file Unified extension platform registration model.
 */

import {
  registerPlatform,
  type PlatformManifestEntry,
  listPlatforms,
} from '../platforms/provider';
import {
  registerPlatformUi,
  type PlatformUiEntry,
  listPlatformUis,
} from './platform-view-manifest';

export interface ExtensionPlatformEntry {
  runtime: PlatformManifestEntry;
  ui?: PlatformUiEntry;
}

const extensionPlatforms = new Map<string, ExtensionPlatformEntry>();

/**
 * Registers runtime and (optionally) UI concerns for one platform in one call.
 */
export function registerExtensionPlatform(entry: ExtensionPlatformEntry): void {
  registerPlatform(entry.runtime);
  if (entry.ui !== undefined) {
    registerPlatformUi(entry.ui);
  }
  extensionPlatforms.set(entry.runtime.id, entry);
}

/**
 * Returns unified platform entries currently known to the extension.
 */
export function listExtensionPlatforms(): ExtensionPlatformEntry[] {
  // Keep this aligned with runtime order to preserve existing UI expectations.
  const runtimeById = new Map(listPlatforms().map((entry) => [entry.id, entry]));
  const uiById = new Map(listPlatformUis().map((entry) => [entry.id, entry]));
  return Array.from(runtimeById.values()).map((runtime) => {
    const ui = uiById.get(runtime.id);
    return ui !== undefined ? { runtime, ui } : { runtime };
  });
}

/**
 * Compatibility API: register runtime-only platform (existing public surface).
 */
export function registerRuntimePlatform(entry: PlatformManifestEntry): void {
  registerExtensionPlatform({ runtime: entry });
}
