/**
 * @fileoverview Unified memory snapshot request handler extracted from the debug adapter.
 */

import { DebugProtocol } from '@vscode/debugprotocol';
import { buildMemorySnapshotResponse, type MemorySnapshotContext } from '../session/memory-snapshot';

export type MemoryRequestDeps = {
  getRuntime: () => MemorySnapshotContext['runtime'] | undefined;
  getRunning: () => boolean;
  getSymbolAnchors: () => MemorySnapshotContext['symbolAnchors'];
  getLookupAnchors: () => MemorySnapshotContext['lookupAnchors'];
  getSymbolList: () => MemorySnapshotContext['symbolList'];
  sendResponse: (response: DebugProtocol.Response) => void;
  sendErrorResponse: (response: DebugProtocol.Response, id: number, message: string) => void;
};

export function handleMemorySnapshotRequest(
  response: DebugProtocol.Response,
  args: unknown,
  deps: MemoryRequestDeps,
): boolean {
  const runtime = deps.getRuntime();
  if (runtime === undefined) {
    deps.sendErrorResponse(response, 1, 'Debug80: No program loaded.');
    return true;
  }
  const snapshot = buildMemorySnapshotResponse(args, {
    runtime,
    running: deps.getRunning(),
    symbolAnchors: deps.getSymbolAnchors(),
    lookupAnchors: deps.getLookupAnchors(),
    symbolList: deps.getSymbolList(),
  });
  response.body = {
    before: snapshot.before,
    rowSize: snapshot.rowSize,
    running: snapshot.running,
    views: snapshot.views,
    symbols: snapshot.symbols,
    registers: snapshot.registers,
  };
  deps.sendResponse(response);
  return true;
}
