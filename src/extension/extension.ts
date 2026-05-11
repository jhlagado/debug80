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
  createSimplePlatformUiEntry,
  createTec1PlatformUiEntry,
  createTec1gPlatformUiEntry,
} from './platform-ui-entries';
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
      id: 'simple',
      displayName: 'Simple',
      loadProvider: async (args) => {
        const { createSimplePlatformProvider } = await import('../platforms/simple/provider.js');
        return createSimplePlatformProvider(args);
      },
    },
    ui: createSimplePlatformUiEntry(),
  });
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
  const platformViewProvider = new PlatformViewProvider(
    context.extensionUri,
    context.workspaceState,
    logger
  );
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
