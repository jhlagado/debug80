/**
 * @file VS Code extension entry and UI wiring for Debug80.
 */

import * as vscode from 'vscode';
import { Z80DebugAdapterFactory } from '../debug/adapter';
import { registerExtensionCommands } from './commands';
import { registerDebugSessionHandlers } from './debug-session-events';
import { registerAutoRebuildOnSave } from './auto-rebuild';
import { registerLanguageAssociations } from './language-association';
import { SessionStateManager } from './session-state-manager';
import { PlatformViewProvider } from './platform-view-provider';
import { SourceColumnController } from './source-columns';
import { TerminalPanelController } from './terminal-panel';
import { ProjectTargetSelectionController } from './project-target-selection';
import { WorkspaceSelectionController } from './workspace-selection';
import { Debug80ConfigurationProvider } from './debug-configuration-provider';
import { OutputChannelLogger } from '../util/logger';
import {
  type PlatformManifestEntry,
} from '../platforms/provider';
import {
  type PlatformUiEntry,
  type PlatformUiModules,
} from './platform-view-manifest';
import {
  serializeTec1ClearFromUiState,
  serializeTec1UpdateFromUiState,
} from '../platforms/tec1/serialize-update-payload';
import {
  serializeTec1gClearPanelUpdateFromUiState,
  serializeTec1gUpdateFromUiState,
} from '../platforms/tec1g/serialize-ui-update-payload';
import {
  listExtensionPlatforms,
  registerExtensionPlatform,
  registerRuntimePlatform,
} from './platform-extension-model';

export interface Debug80Api {
  registerPlatform: (entry: PlatformManifestEntry) => void;
  listPlatforms: () => PlatformManifestEntry[];
}

/**
 * Registers the built-in TEC-1 and TEC-1G platforms with both the
 * runtime manifest (for session launch) and the UI manifest (for the
 * sidebar panel).
 */
function registerBuiltInPlatformUis(): void {
  registerExtensionPlatform({
    runtime: {
      id: 'tec1',
      displayName: 'TEC-1',
      loadProvider: async (args) => {
        const { createTec1PlatformProvider } = await import('../platforms/tec1/provider.js');
        return createTec1PlatformProvider(args);
      },
    },
    ui: createTec1PlatformUiEntry(),
  });
  registerExtensionPlatform({
    runtime: {
      id: 'tec1g',
      displayName: 'TEC-1G',
      loadProvider: async (args) => {
        const { createTec1gPlatformProvider } = await import('../platforms/tec1g/provider.js');
        return createTec1gPlatformProvider(args);
      },
    },
    ui: createTec1gPlatformUiEntry(),
  });
}

/**
 * Builds the TEC-1 UI entry for the sidebar panel manifest.
 * Lazily imports all four TEC-1 UI modules (html, memory, messages,
 * state) and wires them into a {@link PlatformUiModules} instance.
 */
function createTec1PlatformUiEntry(): PlatformUiEntry {
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
          return serializeTec1UpdateFromUiState(tec1State, tec1Payload.speakerHz) as unknown as Record<
            string,
            unknown
          >;
        },
        createMemoryViewState: memory.createMemoryViewState,
        handleMessage: (message, context): Promise<void> => messages.handleTec1Message(message, context),
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
        snapshotCommand: 'debug80/tec1MemorySnapshot',
      };
    },
  };
}

/**
 * Builds the TEC-1G UI entry for the sidebar panel manifest.
 * Lazily imports all four TEC-1G UI modules (html, memory, messages,
 * state) and wires them into a {@link PlatformUiModules} instance.
 */
function createTec1gPlatformUiEntry(): PlatformUiEntry {
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
          return serializeTec1gUpdateFromUiState(tec1gState, tec1gPayload.speakerHz) as unknown as Record<
            string,
            unknown
          >;
        },
        createMemoryViewState: memory.createMemoryViewState,
        handleMessage: (message, context): Promise<void> => messages.handleTec1gMessage(message, context),
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
        snapshotCommand: 'debug80/tec1gMemorySnapshot',
      };
    },
  };
}

/**
 * Activates the Debug80 extension and registers commands/providers.
 */
export function activate(context: vscode.ExtensionContext): Debug80Api {
  registerBuiltInPlatformUis();
  const sessionState = new SessionStateManager();
  const output = vscode.window.createOutputChannel('Debug80');
  const rebuildDiagnostics = vscode.languages.createDiagnosticCollection('debug80-rebuild');
  const assemblyDiagnostics = vscode.languages.createDiagnosticCollection('debug80-assembly');
  const logger = new OutputChannelLogger(output);
  const factory = new Z80DebugAdapterFactory(logger);
  const platformViewProvider = new PlatformViewProvider(context.extensionUri, context.workspaceState);
  const workspaceSelection = new WorkspaceSelectionController(context, platformViewProvider);
  const targetSelection = new ProjectTargetSelectionController(context);
  const debugConfigurationProvider = new Debug80ConfigurationProvider(
    workspaceSelection,
    targetSelection
  );
  const sourceColumns = new SourceColumnController(sessionState);
  const terminalPanel = new TerminalPanelController(
    sessionState,
    (session) => sourceColumns.getSessionColumns(session).panel,
    context.extensionUri
  );

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('z80', factory)
  );

  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider('z80', debugConfigurationProvider)
  );

  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider(
      'z80',
      debugConfigurationProvider,
      vscode.DebugConfigurationProviderTriggerKind.Dynamic
    )
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      PlatformViewProvider.viewType,
      platformViewProvider
    )
  );
  context.subscriptions.push(output);
  context.subscriptions.push(rebuildDiagnostics);
  context.subscriptions.push(assemblyDiagnostics);

  registerLanguageAssociations(context, output);
  workspaceSelection.registerInfrastructure();
  sourceColumns.register(context);
  registerExtensionCommands({
    context,
    platformViewProvider,
    sourceColumns,
    terminalPanel,
    workspaceSelection,
    targetSelection,
  });
  registerDebugSessionHandlers({
    context,
    rebuildDiagnostics,
    assemblyDiagnostics,
    platformViewProvider,
    sessionState,
    sourceColumns,
    terminalPanel,
    workspaceSelection,
  });
  registerAutoRebuildOnSave(context, sessionState, output, rebuildDiagnostics);

  return {
    registerPlatform: registerRuntimePlatform,
    listPlatforms: () => listExtensionPlatforms().map((entry) => entry.runtime),
  };
}

/**
 * Disposes extension resources on deactivation.
 */
export function deactivate(): void {
  // Nothing to clean up
}
