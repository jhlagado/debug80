/**
 * @fileoverview Platform provider abstraction for debug adapter launch/setup.
 */

import type { DebugProtocol } from "@vscode/debugprotocol";
import type { PlatformIoBuildResult } from "../debug/platform-host";
import type { PlatformRegistry } from "../debug/platform-registry";
import type { PlatformKind } from "../debug/program-loader";
import type { SessionStateShape } from "../debug/session-state";
import type { TerminalConfig } from "../debug/terminal-types";
import type { Z80Runtime } from "../z80/runtime";
import type { Logger } from "../util/logger";
import type {
  SimplePlatformConfigNormalized,
  Tec1PlatformConfigNormalized,
  Tec1gPlatformConfigNormalized,
} from "./types";

export interface PlatformCommandContext {
  sessionState: SessionStateShape;
  sendResponse: (response: DebugProtocol.Response) => void;
  sendErrorResponse: (
    response: DebugProtocol.Response,
    id: number,
    message: string
  ) => void;
  handleMatrixModeRequest: (args: unknown) => string | null;
  handleMatrixKeyRequest: (args: unknown) => string | null;
  clearMatrixHeldKeys: () => void;
}

export interface PlatformIoCallbacks {
  terminal?: TerminalConfig;
  onTec1Update: (payload: unknown) => void;
  onTec1Serial: (payload: { byte: number; text: string }) => void;
  onTec1gUpdate: (payload: unknown) => void;
  onTec1gSerial: (payload: { byte: number; text: string }) => void;
  onTerminalOutput: (payload: { text: string }) => void;
}

export interface PlatformAssetLoadContext {
  baseDir: string;
  logger: Logger;
  resolveRelative: (filePath: string, baseDir: string) => string;
}

export interface PlatformRuntimeFinalizeContext {
  runtime: Z80Runtime;
  sessionState: SessionStateShape;
  assets?: unknown;
}

export interface ResolvedPlatformProvider {
  id: PlatformKind;
  payload: { id: PlatformKind; uiVisibility?: Tec1gPlatformConfigNormalized["uiVisibility"] };
  simpleConfig?: SimplePlatformConfigNormalized;
  tec1Config?: Tec1PlatformConfigNormalized;
  tec1gConfig?: Tec1gPlatformConfigNormalized;
  extraListings: string[];
  runtimeOptions?: { romRanges: Array<{ start: number; end: number }> };
  registerCommands: (registry: PlatformRegistry, context: PlatformCommandContext) => void;
  buildIoHandlers: (callbacks: PlatformIoCallbacks) => Promise<PlatformIoBuildResult>;
  loadAssets?: (context: PlatformAssetLoadContext) => unknown;
  resolveEntry: (assets?: unknown) => number | undefined;
  finalizeRuntime?: (context: PlatformRuntimeFinalizeContext) => void;
}

export {
  listPlatforms,
  registerPlatform,
  resolvePlatformProvider,
  type PlatformManifestEntry,
} from './manifest';
