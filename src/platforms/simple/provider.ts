/**
 * @fileoverview Debug adapter provider for the simple platform.
 */

import { buildPlatformIoHandlers } from "../../debug/platform-host";
import type { LaunchRequestArguments } from "../../debug/types";
import type { ResolvedPlatformProvider } from "../provider";
import { normalizeSimpleConfig } from "./runtime";

export function createSimplePlatformProvider(
  args: LaunchRequestArguments
): ResolvedPlatformProvider {
  const simpleConfig = normalizeSimpleConfig(args.simple);
  return {
    id: "simple",
    payload: { id: "simple" },
    simpleConfig,
    extraListings: simpleConfig.extraListings ?? [],
    runtimeOptions: { romRanges: simpleConfig.romRanges },
    registerCommands: () => undefined,
    buildIoHandlers: async (callbacks) =>
      buildPlatformIoHandlers({
        platform: "simple",
        ...(callbacks.terminal !== undefined ? { terminal: callbacks.terminal } : {}),
        onTec1Update: callbacks.onTec1Update,
        onTec1Serial: callbacks.onTec1Serial,
        onTec1gUpdate: callbacks.onTec1gUpdate,
        onTec1gSerial: callbacks.onTec1gSerial,
        onTerminalOutput: callbacks.onTerminalOutput,
      }),
    resolveEntry: () => simpleConfig.entry,
  };
}
