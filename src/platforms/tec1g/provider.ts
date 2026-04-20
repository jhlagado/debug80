/**
 * @file Debug adapter provider for the TEC-1G platform.
 */

import * as fs from 'fs';
import type { DebugProtocol } from '@vscode/debugprotocol';
import {
  applyCartridgeMemory,
  createTec1gMemoryHooks,
} from './tec1g-memory';
import {
  loadTec1gCartridgeImage,
  type Tec1gCartridgeImage,
} from './tec1g-cartridge';
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
  cartridgeImage: Tec1gCartridgeImage | null;
};

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
      'debug80/tec1gReset': (response) =>
        sendPlatformResponse(
          response,
          handleResetRequest(
            context.sessionState.runtime,
            context.sessionState.loadedProgram,
            context.sessionState.loadedEntry,
            context.sessionState.tec1gRuntime
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
  cartridgeHex: string | undefined,
  context: PlatformAssetLoadContext
): Tec1gPlatformAssets {
  if (cartridgeHex === undefined || cartridgeHex === '') {
    return { cartridgeImage: null };
  }

  const cartridgePath = context.resolveRelative(cartridgeHex, context.baseDir);
  if (!fs.existsSync(cartridgePath)) {
    context.logger.warn('Debug80: TEC-1G cartridge not found at ' + cartridgePath + '.');
    return { cartridgeImage: null };
  }

  try {
    return { cartridgeImage: loadTec1gCartridgeImage(cartridgePath) };
  } catch (err) {
    context.logger.error('Debug80: Failed to load cartridge ' + cartridgePath + ': ' + String(err));
    return { cartridgeImage: null };
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

  const assets = (context.assets ?? { cartridgeImage: null }) as Tec1gPlatformAssets;
  const baseMemory = context.runtime.hardware.memory;
  const hooks = createTec1gMemoryHooks(baseMemory, config.romRanges, tec1gRuntime.state.system);
  context.runtime.hardware.memRead = hooks.memRead;
  context.runtime.hardware.memWrite = hooks.memWrite;
  if (assets.cartridgeImage) {
    applyCartridgeMemory(hooks.expandBanks, assets.cartridgeImage.memory);
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
    payload: {
      id: 'tec1g',
      ...(tec1gConfig.uiVisibility ? { uiVisibility: tec1gConfig.uiVisibility } : {}),
    },
    tec1gConfig,
    extraListings: tec1gConfig.extraListings ?? [],
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
      loadTec1gAssets(tec1gConfig.cartridgeHex, context),
    resolveEntry: (assets): number | undefined =>
      ((assets as Tec1gPlatformAssets | undefined)?.cartridgeImage?.bootEntry ??
        tec1gConfig.entry),
    finalizeRuntime: (context): void => finalizeTec1gRuntime(tec1gConfig, context),
  };
}
