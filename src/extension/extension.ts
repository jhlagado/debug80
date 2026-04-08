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
  listPlatforms,
  registerPlatform,
  type PlatformManifestEntry,
} from '../platforms/provider';
import {
  registerPlatformUi,
  type PlatformUiEntry,
  type PlatformUiModules,
} from './platform-view-manifest';

export interface Debug80Api {
  registerPlatform: (entry: PlatformManifestEntry) => void;
  listPlatforms: () => PlatformManifestEntry[];
}

/**
 *
 */
function registerBuiltInPlatformUis(): void {
  registerPlatformUi(createTec1PlatformUiEntry());
  registerPlatformUi(createTec1gPlatformUiEntry());
}

/**
 *
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
      const serializeState = (uiState: Tec1UiState): Record<string, unknown> => ({
        digits: uiState.digits,
        matrix: uiState.matrix,
        speaker: uiState.speaker,
        speedMode: uiState.speedMode,
        lcd: uiState.lcd,
      });
      return {
        getHtml: html.getTec1Html,
        createUiState: state.createTec1UiState,
        resetUiState: (uiState): void => state.resetTec1UiState(uiState as Tec1UiState),
        applyUpdate: (uiState, payload): Record<string, unknown> => {
          const tec1State = uiState as Tec1UiState;
          const tec1Payload = payload as Parameters<typeof state.applyTec1Update>[1];
          state.applyTec1Update(tec1State, tec1Payload);
          return {
            ...serializeState(tec1State),
            ...(tec1Payload.speakerHz !== undefined ? { speakerHz: tec1Payload.speakerHz } : {}),
          };
        },
        createMemoryViewState: memory.createMemoryViewState,
        handleMessage: (message, context): Promise<void> => messages.handleTec1Message(message, context),
        buildUpdateMessage: (uiState, uiRevision): Record<string, unknown> => ({
          type: 'update',
          uiRevision,
          ...serializeState(uiState as Tec1UiState),
        }),
        buildClearMessage: (uiState, uiRevision): Record<string, unknown> => {
          const tec1State = uiState as Tec1UiState;
          return {
            type: 'update',
            uiRevision,
            digits: tec1State.digits,
            matrix: tec1State.matrix,
            speaker: false,
            speedMode: tec1State.speedMode,
            lcd: tec1State.lcd,
          };
        },
        snapshotCommand: 'debug80/tec1MemorySnapshot',
      };
    },
  };
}

/**
 *
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
      const serializeState = (uiState: Tec1gUiState): Record<string, unknown> => ({
        digits: uiState.digits,
        matrix: uiState.matrix,
        matrixGreen: uiState.matrixGreen,
        matrixBlue: uiState.matrixBlue,
        matrixBrightness: uiState.matrixBrightness,
        matrixBrightnessG: uiState.matrixBrightnessG,
        matrixBrightnessB: uiState.matrixBrightnessB,
        glcd: uiState.glcd,
        glcdDdram: uiState.glcdDdram,
        glcdState: uiState.glcdState,
        speaker: uiState.speaker,
        speedMode: uiState.speedMode,
        sysCtrl: uiState.sysCtrlValue,
        bankA14: uiState.bankA14,
        capsLock: uiState.capsLock,
        lcdState: uiState.lcdState,
        lcdCgram: uiState.lcdCgram,
        lcd: uiState.lcd,
      });
      return {
        getHtml: html.getTec1gHtml,
        createUiState: state.createTec1gUiState,
        resetUiState: (uiState): void => state.resetTec1gUiState(uiState as Tec1gUiState),
        applyUpdate: (uiState, payload): Record<string, unknown> => {
          const tec1gState = uiState as Tec1gUiState;
          const tec1gPayload = payload as Parameters<typeof state.applyTec1gUpdate>[1];
          state.applyTec1gUpdate(tec1gState, tec1gPayload);
          return {
            ...serializeState(tec1gState),
            ...(tec1gPayload.speakerHz !== undefined ? { speakerHz: tec1gPayload.speakerHz } : {}),
          };
        },
        createMemoryViewState: memory.createMemoryViewState,
        handleMessage: (message, context): Promise<void> => messages.handleTec1gMessage(message, context),
        buildUpdateMessage: (uiState, uiRevision): Record<string, unknown> => ({
          type: 'update',
          uiRevision,
          ...serializeState(uiState as Tec1gUiState),
        }),
        buildClearMessage: (uiState, uiRevision): Record<string, unknown> => {
          const tec1gState = uiState as Tec1gUiState;
          return {
            type: 'update',
            uiRevision,
            digits: tec1gState.digits,
            matrix: tec1gState.matrix,
            matrixGreen: tec1gState.matrixGreen,
            matrixBlue: tec1gState.matrixBlue,
            matrixBrightness: tec1gState.matrixBrightness,
            matrixBrightnessG: tec1gState.matrixBrightnessG,
            matrixBrightnessB: tec1gState.matrixBrightnessB,
            glcd: tec1gState.glcd,
            speaker: false,
            speedMode: tec1gState.speedMode,
            lcd: tec1gState.lcd,
          };
        },
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
  const platformViewProvider = new PlatformViewProvider(context.extensionUri);
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
    registerPlatform,
    listPlatforms,
  };
}

/**
 * Disposes extension resources on deactivation.
 */
export function deactivate(): void {
  // Nothing to clean up
}
