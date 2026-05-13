/**
 * @file Built-in platform UI entry factories.
 *
 * These functions create {@link PlatformUiEntry} objects for the simple,
 * TEC-1 and TEC-1G platforms.  They are kept in a separate module so that
 * tests can register the real UI modules without importing the full extension
 * entry point and all its side-effect-heavy dependencies.
 */

import {
  serializeTec1ClearFromUiState,
  serializeTec1UpdateFromUiState,
} from '../platforms/tec1/serialize-update-payload';
import type { SimpleUiState } from '../platforms/simple/ui-panel-state';
import {
  serializeTec1gClearPanelUpdateFromUiState,
  serializeTec1gUpdateFromUiState,
} from '../platforms/tec1g/serialize-ui-update-payload';
import type { PlatformUiEntry, PlatformUiModules } from './platform-view-manifest';

/**
 * Builds the TEC-1 UI entry for the sidebar panel manifest.
 * Lazily imports all four TEC-1 UI modules (html, memory, messages,
 * state) and wires them into a {@link PlatformUiModules} instance.
 */
export function createTec1PlatformUiEntry(): PlatformUiEntry {
  return {
    id: 'tec1',
    loadUiModules: async (): Promise<PlatformUiModules> => {
      const [html, memory, messages, state] = await Promise.all([
        import('../platforms/tec1/ui-panel-html.js'),
        import('../platforms/tec1/ui-panel-memory.js'),
        import('../platforms/tec1/ui-panel-messages.js'),
        import('../platforms/tec1/ui-panel-state.js'),
      ]);
      type Tec1UiState = ReturnType<typeof state.createTec1UiState>;
      return {
        getHtml: html.getTec1Html,
        createUiState: state.createTec1UiState,
        resetUiState: (uiState): void => state.resetTec1UiState(uiState as Tec1UiState),
        applyUpdate: (uiState, payload): Record<string, unknown> => {
          const tec1State = uiState as Tec1UiState;
          const tec1Payload = payload as Parameters<typeof state.applyTec1Update>[1];
          state.applyTec1Update(tec1State, tec1Payload);
          // PlatformUiModules.applyUpdate is loosely typed; payload is TEC-1-shaped after apply.
          return serializeTec1UpdateFromUiState(
            tec1State,
            tec1Payload.speakerHz
          ) as unknown as Record<string, unknown>;
        },
        createMemoryViewState: memory.createMemoryViewState,
        handleMessage: (message, context): Promise<void> =>
          // Cast getActiveTab/setActiveTab to the narrower 'ui'|'memory' type expected by the
          // panel message handler; 'config' never reaches handleTec1Message in practice.
          messages.handleTec1Message(
            message,
            context as Parameters<typeof messages.handleTec1Message>[1]
          ),
        buildUpdateMessage: (uiState, uiRevision): Record<string, unknown> => ({
          type: 'update',
          uiRevision,
          ...serializeTec1UpdateFromUiState(uiState as Tec1UiState),
        }),
        buildClearMessage: (uiState, uiRevision): Record<string, unknown> => ({
          type: 'update',
          uiRevision,
          ...serializeTec1ClearFromUiState(uiState as Tec1UiState),
        }),
        snapshotCommand: 'debug80/memorySnapshot',
      };
    },
  };
}

/**
 * Builds the TEC-1G UI entry for the sidebar panel manifest.
 * Lazily imports all four TEC-1G UI modules (html, memory, messages,
 * state) and wires them into a {@link PlatformUiModules} instance.
 */
export function createTec1gPlatformUiEntry(): PlatformUiEntry {
  return {
    id: 'tec1g',
    loadUiModules: async (): Promise<PlatformUiModules> => {
      const [html, memory, messages, state] = await Promise.all([
        import('../platforms/tec1g/ui-panel-html.js'),
        import('../platforms/tec1g/ui-panel-memory.js'),
        import('../platforms/tec1g/ui-panel-messages.js'),
        import('../platforms/tec1g/ui-panel-state.js'),
      ]);
      type Tec1gUiState = ReturnType<typeof state.createTec1gUiState>;
      return {
        getHtml: html.getTec1gHtml,
        createUiState: state.createTec1gUiState,
        resetUiState: (uiState): void => state.resetTec1gUiState(uiState as Tec1gUiState),
        applyUpdate: (uiState, payload): Record<string, unknown> => {
          const tec1gState = uiState as Tec1gUiState;
          const tec1gPayload = payload as Parameters<typeof state.applyTec1gUpdate>[1];
          state.applyTec1gUpdate(tec1gState, tec1gPayload);
          // PlatformUiModules.applyUpdate is loosely typed; payload is TEC-1G-shaped after apply.
          return serializeTec1gUpdateFromUiState(
            tec1gState,
            tec1gPayload.speakerHz
          ) as unknown as Record<string, unknown>;
        },
        createMemoryViewState: memory.createMemoryViewState,
        handleMessage: (message, context): Promise<void> =>
          // Cast getActiveTab/setActiveTab to the narrower 'ui'|'memory' type expected by the
          // panel message handler; 'config' never reaches handleTec1gMessage in practice.
          messages.handleTec1gMessage(
            message,
            context as Parameters<typeof messages.handleTec1gMessage>[1]
          ),
        buildUpdateMessage: (uiState, uiRevision): Record<string, unknown> => ({
          type: 'update',
          uiRevision,
          ...serializeTec1gUpdateFromUiState(uiState as Tec1gUiState),
        }),
        buildClearMessage: (uiState, uiRevision): Record<string, unknown> => ({
          type: 'update',
          uiRevision,
          ...serializeTec1gClearPanelUpdateFromUiState(uiState as Tec1gUiState),
        }),
        snapshotCommand: 'debug80/memorySnapshot',
      };
    },
  };
}

/**
 * Builds the simple platform UI entry for the sidebar panel manifest.
 * The simple platform has no hardware display — only the CPU memory viewer
 * is shown.
 */
export function createSimplePlatformUiEntry(): PlatformUiEntry {
  return {
    id: 'simple',
    loadUiModules: async (): Promise<PlatformUiModules> => {
      const [html, memory, messages, state] = await Promise.all([
        import('../platforms/simple/ui-panel-html.js'),
        import('../platforms/simple/ui-panel-memory.js'),
        import('../platforms/simple/ui-panel-messages.js'),
        import('../platforms/simple/ui-panel-state.js'),
      ]);
      return {
        getHtml: (tab, webview, extensionUri) => html.getSimpleHtml(webview, extensionUri, tab),
        createUiState: state.createSimpleUiState,
        resetUiState: (uiState): void => state.resetSimpleUiState(uiState as SimpleUiState),
        applyUpdate: (uiState, payload): Record<string, unknown> =>
          state.applySimpleUpdate(uiState as SimpleUiState, payload),
        createMemoryViewState: memory.createMemoryViewState,
        handleMessage: (message, context): Promise<void> =>
          messages.handleSimpleMessage(
            message,
            context as Parameters<typeof messages.handleSimpleMessage>[1]
          ),
        buildUpdateMessage: (_uiState, uiRevision): Record<string, unknown> => ({
          type: 'update',
          uiRevision,
        }),
        buildClearMessage: (_uiState, uiRevision): Record<string, unknown> => ({
          type: 'update',
          uiRevision,
        }),
        snapshotCommand: 'debug80/memorySnapshot',
      };
    },
  };
}
