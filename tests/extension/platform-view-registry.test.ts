/**
 * @file Platform view registry tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryViewState } from '../../src/platforms/panel-memory';
import type {
  PlatformUiEntry,
  PlatformUiModules,
} from '../../src/extension/platform-view-manifest';

describe('platform-view-registry', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('preloads registered modules and creates per-platform state', async () => {
    const { PlatformViewRegistry, registerPlatformUi } = await loadRegistryModules();
    const modules = createModules();
    registerPlatformUi(createEntry('registry-test-a', modules));
    const registry = new PlatformViewRegistry({
      postSnapshot: vi.fn().mockResolvedValue(undefined),
      onSnapshotFailed: vi.fn(),
    });

    await registry.preloadAll();

    const bundle = registry.getBundle('registry-test-a');
    expect(bundle?.modules).toBe(modules);
    expect(bundle?.state.activeTab).toBe('ui');
    expect(bundle?.state.uiState).toEqual({ id: 'state' });
    expect(bundle?.state.serialBuffer).toBeDefined();
    expect(bundle?.state.memoryViews.viewModes.a).toBe('pc');
    expect(bundle?.state.refreshController).toBeDefined();
  });

  it('does not reload modules that are already cached', async () => {
    const { PlatformViewRegistry, registerPlatformUi } = await loadRegistryModules();
    const modules = createModules();
    const loadUiModules = vi.fn().mockResolvedValue(modules);
    registerPlatformUi({ id: 'registry-test-b', loadUiModules });
    const registry = new PlatformViewRegistry({
      postSnapshot: vi.fn().mockResolvedValue(undefined),
      onSnapshotFailed: vi.fn(),
    });

    await registry.preloadAll();
    const firstBundle = registry.getBundle('registry-test-b');
    if (firstBundle !== undefined) {
      firstBundle.state.activeTab = 'memory';
      firstBundle.state.memoryViews.viewAfter.a = 128;
    }
    await registry.preloadAll();

    expect(loadUiModules).toHaveBeenCalledTimes(1);
    const secondBundle = registry.getBundle('registry-test-b');
    expect(secondBundle?.state).toBe(firstBundle?.state);
    expect(secondBundle?.state.activeTab).toBe('memory');
    expect(secondBundle?.state.memoryViews.viewAfter.a).toBe(128);
  });

  it('wires snapshot handlers through the registry callbacks', async () => {
    const { PlatformViewRegistry, registerPlatformUi } = await loadRegistryModules();
    const modules = createModules();
    const postSnapshot = vi.fn().mockResolvedValue(undefined);
    const onSnapshotFailed = vi.fn();
    registerPlatformUi(createEntry('registry-test-c', modules));
    const registry = new PlatformViewRegistry({ postSnapshot, onSnapshotFailed });

    await registry.preloadAll();
    const bundle = registry.getBundle('registry-test-c');
    await bundle?.state.refreshController.handlers.postSnapshot(
      bundle.state.refreshController.snapshotPayload()
    );
    bundle?.state.refreshController.handlers.onSnapshotFailed(true);

    expect(postSnapshot).toHaveBeenCalledWith('debug80/memorySnapshot', {
      views: expect.any(Array),
    });
    expect(onSnapshotFailed).toHaveBeenCalledWith(true);
  });

  it('iterates known platform states with their modules', async () => {
    const { PlatformViewRegistry, registerPlatformUi } = await loadRegistryModules();
    const modules = createModules();
    registerPlatformUi(createEntry('registry-test-d', modules));
    const registry = new PlatformViewRegistry({
      postSnapshot: vi.fn().mockResolvedValue(undefined),
      onSnapshotFailed: vi.fn(),
    });

    await registry.preloadAll();
    const seen: string[] = [];
    registry.forEachState((id, state, entryModules) => {
      seen.push(id);
      if (id === 'registry-test-d') {
        expect(state.activeTab).toBe('ui');
        expect(entryModules).toBe(modules);
      }
    });

    expect(seen).toContain('registry-test-d');
  });
});

function createEntry(id: string, modules: PlatformUiModules): PlatformUiEntry {
  return {
    id,
    loadUiModules: vi.fn().mockResolvedValue(modules),
  };
}

async function loadRegistryModules(): Promise<{
  PlatformViewRegistry: typeof import('../../src/extension/platform-view-registry').PlatformViewRegistry;
  registerPlatformUi: typeof import('../../src/extension/platform-view-manifest').registerPlatformUi;
}> {
  const [{ PlatformViewRegistry }, { registerPlatformUi }] = await Promise.all([
    import('../../src/extension/platform-view-registry'),
    import('../../src/extension/platform-view-manifest'),
  ]);
  return { PlatformViewRegistry, registerPlatformUi };
}

function createModules(): PlatformUiModules {
  return {
    getHtml: vi.fn(),
    createUiState: vi.fn(() => ({ id: 'state' })),
    resetUiState: vi.fn(),
    applyUpdate: vi.fn(() => ({})),
    createMemoryViewState,
    handleMessage: vi.fn(),
    buildUpdateMessage: vi.fn(() => ({ type: 'update' })),
    buildClearMessage: vi.fn(() => ({ type: 'clear' })),
    snapshotCommand: 'debug80/memorySnapshot',
  };
}
