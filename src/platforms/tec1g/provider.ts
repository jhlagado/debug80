/**
 * @file Debug adapter provider for the TEC-1G platform.
 */

import * as fs from 'fs';
import type { DebugProtocol } from '@vscode/debugprotocol';
import { applyExpansionRomMemory, createTec1gMemoryHooks } from './tec1g-memory';
import {
  loadTec1gExpansionRomImage,
  type Tec1gExpansionRomImage,
} from './tec1g-expansion-rom';
import {
  buildPlatformIoHandlers,
  type PlatformIoBuildResult,
} from '../../debug/session/platform-host';
import {
  handleKeyRequest,
  handleResetRequest,
  handleSerialRequest,
  handleSpeedRequest,
} from '../../debug/requests/platform-requests';
import type { PlatformContribution } from '../../debug/session/platform-registry';
import type { LaunchRequestArguments } from '../../debug/session/types';
import { extractKeyCode } from '../../debug/session/message-types';
import type {
  PlatformAssetLoadContext,
  PlatformCommandContext,
  PlatformRuntimeFinalizeContext,
  ResolvedPlatformProvider,
} from '../provider';
import { normalizeTec1gConfig } from './runtime';

type Tec1gPlatformAssets = {
  expansionRomImage: Tec1gExpansionRomImage | null;
};

const TEC1G_MON3_MONITOR_RAM_START = 0x0800;
const TEC1G_MON3_MONITOR_RAM_END = 0x1000;

/**
 * Sends a successful or failed custom request response.
 */
function sendPlatformResponse(
  response: DebugProtocol.Response,
  error: string | null,
  context: PlatformCommandContext,
  onSuccess?: () => void
): true {
  if (error !== null) {
    context.sendErrorResponse(response, 1, error);
    return true;
  }
  onSuccess?.();
  context.sendResponse(response);
  return true;
}

/** Reads a boolean property from a custom request payload. */
function readBooleanProperty(args: unknown, key: string): boolean | undefined {
  if (typeof args !== 'object' || args === null) {
    return undefined;
  }
  const value = (args as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : undefined;
}

/** Reads a TMS9918 video standard from a custom request payload. */
function readTms9918Standard(args: unknown): 'pal' | 'ntsc' | undefined {
  if (typeof args !== 'object' || args === null) {
    return undefined;
  }
  const value = (args as Record<string, unknown>).standard;
  return value === 'pal' || value === 'ntsc' ? value : undefined;
}

/** Handles attachment/detachment of the TEC-1G TMS9918 video card. */
function handleTms9918ActiveRequest(context: PlatformCommandContext, args: unknown): string | null {
  const enabled = readBooleanProperty(args, 'enabled');
  if (enabled === undefined) {
    return 'Debug80: Missing TMS9918 active flag.';
  }
  context.sessionState.ui.tec1gTms9918Active = enabled;
  const runtime = context.sessionState.tec1gRuntime;
  if (!runtime) {
    return null;
  }
  runtime.setTms9918Active(enabled);
  return null;
}

/** Handles PAL/NTSC cadence changes for the TEC-1G TMS9918 video card. */
function handleTms9918VideoStandardRequest(
  context: PlatformCommandContext,
  args: unknown
): string | null {
  const standard = readTms9918Standard(args);
  if (standard === undefined) {
    return 'Debug80: Missing TMS9918 video standard.';
  }
  context.sessionState.ui.tec1gTms9918VideoStandard = standard;
  const runtime = context.sessionState.tec1gRuntime;
  if (!runtime) {
    return null;
  }
  runtime.setTms9918VideoStandard(standard);
  return null;
}

/**
 * Builds the TEC-1G custom request contribution.
 */
function buildTec1gContribution(context: PlatformCommandContext): PlatformContribution {
  return {
    id: 'tec1g',
    commands: {
      'debug80/tec1gKey': (response, args) =>
        sendPlatformResponse(
          response,
          handleKeyRequest(context.sessionState.tec1gRuntime, extractKeyCode(args)),
          context
        ),
      'debug80/tec1gMatrixKey': (response, args) =>
        sendPlatformResponse(response, context.handleMatrixKeyRequest(args), context),
      'debug80/tec1gMatrixMode': (response, args) =>
        sendPlatformResponse(response, context.handleMatrixModeRequest(args), context),
      'debug80/tec1gJoystick': (response, args) =>
        sendPlatformResponse(response, context.handleJoystickRequest(args), context),
      'debug80/tec1gTms9918Active': (response, args) =>
        sendPlatformResponse(response, handleTms9918ActiveRequest(context, args), context),
      'debug80/tec1gTms9918VideoStandard': (response, args) =>
        sendPlatformResponse(response, handleTms9918VideoStandardRequest(context, args), context),
      'debug80/tec1gReset': (response) =>
        sendPlatformResponse(
          response,
          handleResetRequest(
            context.sessionState.runtime,
            context.sessionState.loadedProgram,
            context.sessionState.loadedEntry,
            context.sessionState.tec1gRuntime,
            {
              preserveRanges: [
                {
                  start: TEC1G_MON3_MONITOR_RAM_START,
                  end: TEC1G_MON3_MONITOR_RAM_END,
                },
              ],
            }
          ),
          context,
          () => context.clearMatrixHeldKeys()
        ),
      'debug80/tec1gSpeed': (response, args) =>
        sendPlatformResponse(
          response,
          handleSpeedRequest(context.sessionState.tec1gRuntime, args),
          context
        ),
      'debug80/tec1gSerialInput': (response, args) =>
        sendPlatformResponse(
          response,
          handleSerialRequest(context.sessionState.tec1gRuntime, args),
          context
        ),
    },
  };
}

/**
 * Loads optional TEC-1G launch assets.
 */
function loadTec1gAssets(
  expansionRomHex: string | undefined,
  context: PlatformAssetLoadContext
): Tec1gPlatformAssets {
  if (expansionRomHex === undefined || expansionRomHex === '') {
    return { expansionRomImage: null };
  }

  const expansionRomPath = context.resolveRelative(expansionRomHex, context.baseDir);
  if (!fs.existsSync(expansionRomPath)) {
    context.logger.warn('Debug80: TEC-1G expansion ROM not found at ' + expansionRomPath + '.');
    return { expansionRomImage: null };
  }

  try {
    return { expansionRomImage: loadTec1gExpansionRomImage(expansionRomPath) };
  } catch (err) {
    context.logger.error(
      'Debug80: Failed to load expansion ROM ' + expansionRomPath + ': ' + String(err)
    );
    return { expansionRomImage: null };
  }
}

/**
 * Applies TEC-1G runtime hooks after the core runtime is created.
 */
function finalizeTec1gRuntime(
  config: ReturnType<typeof normalizeTec1gConfig>,
  context: PlatformRuntimeFinalizeContext
): void {
  const tec1gRuntime = context.sessionState.tec1gRuntime;
  if (!tec1gRuntime) {
    return;
  }
  const tms9918Active = config.tms9918Active === true || context.sessionState.ui.tec1gTms9918Active;
  context.sessionState.ui.tec1gTms9918Active = tms9918Active;
  tec1gRuntime.setTms9918Active(tms9918Active);
  tec1gRuntime.setTms9918VideoStandard(context.sessionState.ui.tec1gTms9918VideoStandard);

  const assets = (context.assets ?? { expansionRomImage: null }) as Tec1gPlatformAssets;
  const baseMemory = context.runtime.hardware.memory;
  const hooks = createTec1gMemoryHooks(baseMemory, config.romRanges, tec1gRuntime.state.system);
  context.runtime.hardware.memRead = hooks.memRead;
  context.runtime.hardware.memWrite = hooks.memWrite;
  context.runtime.hardware.forceMemWrite = hooks.forceMemWrite;
  context.runtime.hardware.isMemoryWritable = hooks.isMemoryWritable;
  if (assets.expansionRomImage) {
    applyExpansionRomMemory(hooks.expandBanks, assets.expansionRomImage);
    tec1gRuntime.setCartridgePresent(true);
    return;
  }
  tec1gRuntime.setCartridgePresent(false);
}

/**
 * Creates the debug adapter provider for TEC-1G launches.
 */
export function createTec1gPlatformProvider(
  args: LaunchRequestArguments
): ResolvedPlatformProvider {
  const tec1gConfig = normalizeTec1gConfig(args.tec1g);
  return {
    id: 'tec1g',
    payload: { id: 'tec1g' },
    tec1gConfig,
    runtimeOptions: { romRanges: tec1gConfig.romRanges },
    registerCommands: (registry, context): void => {
      registry.register(buildTec1gContribution(context));
    },
    buildIoHandlers: async (callbacks): Promise<PlatformIoBuildResult> =>
      buildPlatformIoHandlers({
        platform: 'tec1g',
        tec1gConfig,
        ...(callbacks.terminal !== undefined ? { terminal: callbacks.terminal } : {}),
        onTec1Update: callbacks.onTec1Update,
        onTec1Serial: callbacks.onTec1Serial,
        onTec1gUpdate: callbacks.onTec1gUpdate,
        onTec1gSerial: callbacks.onTec1gSerial,
        onTerminalOutput: callbacks.onTerminalOutput,
      }),
    loadAssets: (context): Tec1gPlatformAssets =>
      loadTec1gAssets(tec1gConfig.expansionRomHex, context),
    resolveEntry: (assets): number | undefined =>
      (assets as Tec1gPlatformAssets | undefined)?.expansionRomImage?.bootEntry ??
      tec1gConfig.entry,
    finalizeRuntime: (context): void => finalizeTec1gRuntime(tec1gConfig, context),
  };
}
