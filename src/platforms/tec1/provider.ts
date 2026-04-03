/**
 * @file Debug adapter provider for the TEC-1 platform.
 */

import type { DebugProtocol } from '@vscode/debugprotocol';
import {
  buildPlatformIoHandlers,
  type PlatformIoBuildResult,
} from '../../debug/platform-host';
import {
  handleKeyRequest,
  handleResetRequest,
  handleSerialRequest,
  handleSpeedRequest,
} from '../../debug/platform-requests';
import type { PlatformContribution } from '../../debug/platform-registry';
import type { LaunchRequestArguments } from '../../debug/types';
import { extractKeyCode } from '../../debug/message-types';
import type { PlatformCommandContext, ResolvedPlatformProvider } from '../provider';
import { normalizeTec1Config } from './runtime';

/**
 * Sends a successful or failed custom request response.
 */
function sendPlatformResponse(
  response: DebugProtocol.Response,
  error: string | null,
  context: PlatformCommandContext
): true {
  if (error !== null) {
    context.sendErrorResponse(response, 1, error);
    return true;
  }
  context.sendResponse(response);
  return true;
}

/**
 * Builds the TEC-1 custom request contribution.
 */
function buildTec1Contribution(context: PlatformCommandContext): PlatformContribution {
  return {
    id: 'tec1',
    commands: {
      'debug80/tec1Key': (response, args) =>
        sendPlatformResponse(
          response,
          handleKeyRequest(
            context.sessionState.tec1Runtime,
            extractKeyCode(args),
            () => context.sessionState.tec1gRuntime?.silenceSpeaker()
          ),
          context
        ),
      'debug80/tec1Reset': (response) =>
        sendPlatformResponse(
          response,
          handleResetRequest(
            context.sessionState.runtime,
            context.sessionState.loadedProgram,
            context.sessionState.loadedEntry,
            context.sessionState.tec1Runtime
          ),
          context
        ),
      'debug80/tec1Speed': (response, args) =>
        sendPlatformResponse(
          response,
          handleSpeedRequest(context.sessionState.tec1Runtime, args),
          context
        ),
      'debug80/tec1SerialInput': (response, args) =>
        sendPlatformResponse(
          response,
          handleSerialRequest(context.sessionState.tec1Runtime, args),
          context
        ),
    },
  };
}

/**
 * Creates the debug adapter provider for TEC-1 launches.
 */
export function createTec1PlatformProvider(
  args: LaunchRequestArguments
): ResolvedPlatformProvider {
  const tec1Config = normalizeTec1Config(args.tec1);
  return {
    id: 'tec1',
    payload: { id: 'tec1' },
    tec1Config,
    extraListings: tec1Config.extraListings ?? [],
    runtimeOptions: { romRanges: tec1Config.romRanges },
    registerCommands: (registry, context): void => {
      registry.register(buildTec1Contribution(context));
    },
    buildIoHandlers: async (callbacks): Promise<PlatformIoBuildResult> =>
      buildPlatformIoHandlers({
        platform: 'tec1',
        tec1Config,
        ...(callbacks.terminal !== undefined ? { terminal: callbacks.terminal } : {}),
        onTec1Update: callbacks.onTec1Update,
        onTec1Serial: callbacks.onTec1Serial,
        onTec1gUpdate: callbacks.onTec1gUpdate,
        onTec1gSerial: callbacks.onTec1gSerial,
        onTerminalOutput: callbacks.onTerminalOutput,
      }),
    resolveEntry: (): number | undefined => tec1Config.entry,
  };
}
