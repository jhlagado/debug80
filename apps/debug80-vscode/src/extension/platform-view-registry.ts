/**
 * @file Platform UI module/state registry for the Debug80 platform view.
 */

import type { PanelTab } from '../platforms/panel-html';
import { createRefreshController, type RefreshController } from '../platforms/panel-refresh';
import { createSerialBuffer } from './platform-view-serial-state';
import { buildMemorySnapshotPayload } from './platform-view-memory-refresh';
import type { PlatformRuntimeState } from './platform-view-runtime-state';
import { loadPlatformUi, listPlatformUis, type PlatformUiModules } from './platform-view-manifest';

export interface PerPlatformState extends PlatformRuntimeState {
  activeTab: PanelTab;
  refreshController: RefreshController;
}

export interface PlatformViewBundle {
  modules: PlatformUiModules;
  state: PerPlatformState;
}

export interface PlatformRefreshHandlers {
  postSnapshot: (
    command: 'debug80/memorySnapshot',
    payload: ReturnType<typeof buildMemorySnapshotPayload>
  ) => Promise<void>;
  onSnapshotFailed: (allowErrors: boolean) => void;
}

/**
 * Holds loaded platform UI modules and their mutable per-platform state.
 */
export class PlatformViewRegistry {
  private readonly loadedModules = new Map<string, PlatformUiModules>();
  private readonly platformStates = new Map<string, PerPlatformState>();

  constructor(private readonly refreshHandlers: PlatformRefreshHandlers) {}

  /**
   * Loads all registered platform UI modules and creates matching state.
   */
  async preloadAll(): Promise<void> {
    await Promise.all(
      listPlatformUis().map(async (entry) => {
        if (!this.loadedModules.has(entry.id)) {
          const modules = await loadPlatformUi(entry.id);
          this.loadedModules.set(entry.id, modules);
          this.initPlatformState(entry.id, modules);
        }
      })
    );
  }

  /**
   * Returns the loaded modules + state bundle for a platform id, if loaded.
   */
  getBundle(id: string): PlatformViewBundle | undefined {
    const modules = this.loadedModules.get(id);
    const state = this.platformStates.get(id);
    if (modules === undefined || state === undefined) {
      return undefined;
    }
    return { modules, state };
  }

  /**
   * Iterates over each known platform state with its loaded modules when available.
   */
  forEachState(
    callback: (id: string, state: PerPlatformState, modules?: PlatformUiModules) => void
  ): void {
    for (const [id, state] of this.platformStates) {
      callback(id, state, this.loadedModules.get(id));
    }
  }

  private initPlatformState(id: string, modules: PlatformUiModules): PerPlatformState {
    const existing = this.platformStates.get(id);
    if (existing !== undefined) {
      return existing;
    }
    const state: PerPlatformState = {
      activeTab: 'ui' as PanelTab,
      uiState: modules.createUiState(),
      hasPostedRuntimeUpdate: false,
      serialBuffer: createSerialBuffer(),
      memoryViews: modules.createMemoryViewState(),
      // Created after state allocation so snapshotPayload captures the state object.
      refreshController: null as unknown as RefreshController,
    };
    state.refreshController = createRefreshController(
      () => buildMemorySnapshotPayload(state.memoryViews),
      {
        postSnapshot: (payload) =>
          this.refreshHandlers.postSnapshot(modules.snapshotCommand, payload),
        onSnapshotPosted: () => undefined,
        onSnapshotFailed: (allowErrors) => this.refreshHandlers.onSnapshotFailed(allowErrors),
      }
    );
    this.platformStates.set(id, state);
    return state;
  }
}
